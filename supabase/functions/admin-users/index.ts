import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const appUrl = Deno.env.get("DOPAMINA_APP_URL") || "https://dopamina3d.netlify.app/criar-senha.html";
  const configuredOrigins = (Deno.env.get("DOPAMINA_ALLOWED_ORIGINS") || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  let appOrigin = "https://dopamina3d.netlify.app";
  try { appOrigin = new URL(appUrl).origin; } catch { /* usa o domínio padrão seguro */ }
  const allowedOrigins = new Set([appOrigin, "https://dopamina3d.netlify.app", ...configuredOrigins]);
  if (!origin || !allowedOrigins.has(origin)) {
    return new Response(JSON.stringify({ error: "Origem não autorizada." }), {
      status: 403, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  }
  const cors = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const contentLength = Number(req.headers.get("Content-Length") || "0");
  if (contentLength > 32768) return json({ error: "Requisição excede o tamanho permitido." }, 413);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Não autenticado." }, 401);
    const admin = createClient(url, service);
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > 32768) return json({ error: "Requisição excede o tamanho permitido." }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(rawBody); } catch { return json({ error: "Corpo JSON inválido." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Formato de requisição inválido." }, 400);
    // O próprio usuário autenticado pode concluir apenas o seu primeiro acesso.
    if (body.action === "complete_setup") {
      const { data: ownProfile, error: ownError } = await admin.from("profiles").select("id,must_set_password,is_active").eq("id", user.id).single();
      if (ownError || !ownProfile || ownProfile.is_active === false) return json({ error: "Perfil não encontrado ou conta desativada." }, 403);
      if (ownProfile.must_set_password !== true) return json({ ok: true, message: "Primeiro acesso já concluído." });
      const password = String(body.password || "");
      if (password.length < 10) return json({ error: "A senha precisa ter pelo menos 10 caracteres." }, 400);
      // A identidade já foi validada acima com o JWT recebido em Authorization.
      // Em uma Edge Function, um cliente supabase-js recém-criado não possui
      // sessão persistida no Auth storage; por isso auth.updateUser() pode falhar
      // com "Auth session missing!". Atualizamos somente o próprio usuário,
      // usando o Admin API após validar user.id e must_set_password.
      const { error: passwordError } = await admin.auth.admin.updateUserById(
        user.id,
        { password }
      );
      if (passwordError) return json({ error: passwordError.message }, 400);
      const { error } = await admin.from("profiles").update({ must_set_password: false, updated_at: new Date().toISOString() }).eq("id", user.id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, message: "Primeiro acesso concluído." });
    }
    // Completa os dados cadastrais do próprio revendedor/colaborador.
    // O papel é consultado no banco; nunca é aceito do corpo enviado pelo navegador.
    if (body.action === "complete_profile") {
      const { data: own, error: ownProfileError } = await admin
        .from("profiles").select("id,role,is_active").eq("id", user.id).single();
      if (ownProfileError || !own || own.is_active === false) return json({ error: "Perfil não encontrado ou conta desativada." }, 403);
      if (!["reseller", "collaborator"].includes(own.role)) return json({ error: "Este formulário não é aplicável a este tipo de conta." }, 403);
      const clean = (v: unknown, max = 160) => String(v ?? "").trim().slice(0, max);
      const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
      const full_name = clean(body.full_name, 120);
      const phone = digits(body.phone);
      const document_type = own.role === "collaborator" ? "CPF" : clean(body.document_type, 4).toUpperCase();
      const document_number = digits(body.document_number);
      const postal_code = digits(body.postal_code);
      const street = clean(body.street, 180);
      const address_number = clean(body.address_number, 30);
      const complement = clean(body.complement, 100);
      const neighborhood = clean(body.neighborhood, 100);
      const city = clean(body.city, 100);
      const state = clean(body.state, 2).toUpperCase();
      const reference = clean(body.reference, 180);
      const business_legal_name = clean(body.business_legal_name, 180);
      const business_trade_name = clean(body.business_trade_name, 120);
      const business_location_name = clean(body.business_location_name, 120);
      const job_title = clean(body.job_title, 100);
      if (body.privacy_accepted !== true) return json({ error: "Confirme a declaração de veracidade e uso dos dados para concluir o cadastro." }, 400);
      if (full_name.length < 3) return json({ error: "Informe seu nome completo." }, 400);
      if (phone.length < 10 || phone.length > 11) return json({ error: "Informe um telefone/WhatsApp válido com DDD." }, 400);
      if (document_type !== "CPF" && document_type !== "CNPJ") return json({ error: "Tipo de documento inválido." }, 400);
      if ((document_type === "CPF" && document_number.length !== 11) || (document_type === "CNPJ" && document_number.length !== 14)) return json({ error: document_type + " inválido. Confira os números informados." }, 400);
      if (own.role === "reseller" && (postal_code.length !== 8 || !street || !address_number || !neighborhood || !city || state.length !== 2)) return json({ error: "Complete o endereço comercial, incluindo CEP, número, bairro, cidade e UF." }, 400);
      if (own.role === "reseller" && document_type === "CNPJ" && (!business_legal_name || !business_trade_name)) return json({ error: "Para cadastro com CNPJ, informe razão social e nome fantasia." }, 400);
      if (own.role === "collaborator" && !job_title) return json({ error: "Informe sua função na Dopamina 3D." }, 400);
      const { error: nameError } = await admin.from("profiles").update({ full_name, updated_at: new Date().toISOString() }).eq("id", user.id);
      if (nameError) return json({ error: nameError.message }, 400);
      const details = {
        user_id: user.id,
        account_kind: own.role === "collaborator" ? "collaborator" : (document_type === "CNPJ" ? "business" : "individual"),
        document_type, document_number, phone, postal_code: postal_code || null,
        street: street || null, address_number: address_number || null,
        complement: complement || null, neighborhood: neighborhood || null,
        city: city || null, state: state || null, reference: reference || null,
        business_legal_name: business_legal_name || null,
        business_trade_name: business_trade_name || null,
        business_location_name: business_location_name || null,
        job_title: job_title || null, profile_completed: true,
        privacy_accepted_at: new Date().toISOString(), updated_at: new Date().toISOString()
      };
      const { error: detailsError } = await admin.from("customer_profiles").upsert(details, { onConflict: "user_id" });
      if (detailsError) return json({ error: detailsError.message }, 400);
      return json({ ok: true, message: "Cadastro atualizado com sucesso." });
    }

    const { data: me } = await admin.from("profiles").select("role,is_active").eq("id", user.id).single();
    if (!me || me.role !== "admin" || me.is_active === false) return json({ error: "Apenas administrador ativo pode gerenciar usuários." }, 403);
    if (body.action === "invite") {
      const email = String(body.email || "").trim().toLowerCase();
      const full_name = String(body.full_name || "").trim();
      const role = String(body.role || "reseller");
      if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || full_name.length < 3 || full_name.length > 120 || !["reseller", "collaborator"].includes(role)) return json({ error: "Informe nome, e-mail válido e papel permitido (revendedor ou colaborador)." }, 400);
      const appUrl = Deno.env.get("DOPAMINA_APP_URL");
      if (!appUrl) return json({ error: "Configure o secret DOPAMINA_APP_URL com a URL pública do portal (ex.: https://seusite.netlify.app/portal.html)." }, 500);
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name }, redirectTo: appUrl });
      if (error) return json({ error: error.message }, 400);
      const { error: profileError } = await admin.from("profiles").upsert({ id: data.user.id, email, full_name, role, is_active: true, must_set_password: true });
      if (profileError) return json({ error: profileError.message }, 400);
      return json({ ok: true, message: "Convite enviado.", user_id: data.user.id });
    }
    if (body.action === "set_role") {
      const id = String(body.user_id || ""); const role = String(body.role || "");
      if (!id || !["reseller", "collaborator"].includes(role)) return json({ error: "Papel inválido." }, 400);
      if (id === user.id) return json({ error: "Não é permitido alterar o próprio papel." }, 400);
      const { error } = await admin.from("profiles").update({ role, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) return json({ error: error.message }, 400); return json({ ok: true });
    }
    if (body.action === "set_active") {
      const id = String(body.user_id || ""); const active = body.active;
      if (typeof active !== "boolean") return json({ error: "Estado de ativação inválido." }, 400);
      if (!id || id === user.id) return json({ error: "Usuário inválido. Não é permitido bloquear a própria conta." }, 400);
      const { error: profileError } = await admin.from("profiles").update({ is_active: active, updated_at: new Date().toISOString() }).eq("id", id);
      if (profileError) return json({ error: profileError.message }, 400);
      const { error: authError } = await admin.auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
      if (authError) return json({ error: authError.message }, 400); return json({ ok: true });
    }
    return json({ error: "Ação não reconhecida." }, 400);
  } catch (_e) { return json({ error: "Falha interna ao processar a solicitação. Tente novamente ou contate a administração." }, 500); }
});
