import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const appUrl = Deno.env.get("DOPAMINA_APP_URL") || "https://dopamina3d.netlify.app";
  const configuredOrigins = (Deno.env.get("DOPAMINA_ALLOWED_ORIGINS") || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  let appOrigin = "https://dopamina3d.netlify.app";
  try { appOrigin = new URL(appUrl).origin; } catch { /* mantém domínio padrão */ }
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
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) return json({ error: "Configuração do servidor incompleta." }, 500);

    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "Não autenticado." }, 401);

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Sessão inválida ou expirada." }, 401);

    // Service role is used only to verify the caller's active profile. Data mutations below
    // use userClient (the caller JWT), preserving RLS and auth.uid() attribution in audit triggers.
    const admin = createClient(url, service);
    const { data: profile, error: profileError } = await admin
      .from("profiles").select("id,role,is_active").eq("id", user.id).maybeSingle();
    if (profileError || !profile || profile.is_active !== true ||
        !["admin", "collaborator"].includes(profile.role)) {
      return json({ error: "Acesso restrito à equipe ativa da Dopamina 3D." }, 403);
    }

    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 20000) return json({ error: "Requisição muito grande." }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return json({ error: "JSON inválido." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Formato inválido." }, 400);

    const finiteNonNegative = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
    if (body.action === "update_stock") {
      const id = String(body.product_id || "");
      const qty = body.stock_quantity;
      if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(qty) || Number(qty) < 0 || Number(qty) > 1000000) {
        return json({ error: "Produto ou quantidade de estoque inválidos." }, 400);
      }
      const { data, error } = await userClient.from("products")
        .update({ stock_quantity: qty }).eq("id", id).select("id,stock_quantity").maybeSingle();
      if (error) return json({ error: "Não foi possível atualizar o estoque." }, 400);
      if (!data) return json({ error: "Produto não encontrado." }, 404);
      return json({ ok: true, product_id: data.id, stock_quantity: data.stock_quantity });
    }

    if (body.action === "set_product_active") {
      const id = String(body.product_id || "");
      const active = body.active;
      if (!/^[0-9a-f-]{36}$/i.test(id) || typeof active !== "boolean") {
        return json({ error: "Produto ou situação inválida." }, 400);
      }
      const { data, error } = await userClient.from("products")
        .update({ active }).eq("id", id).select("id,active").maybeSingle();
      if (error) return json({ error: "Não foi possível alterar a situação do produto." }, 400);
      if (!data) return json({ error: "Produto não encontrado." }, 404);
      return json({ ok: true, product_id: data.id, active: data.active });
    }

    if (body.action === "set_catalog_visibility") {
      const id = String(body.product_id || "");
      const visible = body.show_on_homepage;
      if (!/^[0-9a-f-]{36}$/i.test(id) || typeof visible !== "boolean") {
        return json({ error: "Produto ou configuração de vitrine inválida." }, 400);
      }
      const { data, error } = await userClient.from("products")
        .update({ show_on_homepage: visible }).eq("id", id)
        .select("id,show_on_homepage").maybeSingle();
      if (error) return json({ error: "Não foi possível alterar a publicação na vitrine." }, 400);
      if (!data) return json({ error: "Produto não encontrado." }, 404);
      return json({ ok: true, product_id: data.id, show_on_homepage: data.show_on_homepage });
    }

    if (body.action === "delete_product") {
      const id = String(body.product_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Identificador de produto inválido." }, 400);
      const { data: product, error: productError } = await userClient.from("products")
        .select("id,image_url").eq("id", id).maybeSingle();
      if (productError) return json({ error: "Não foi possível localizar o produto." }, 400);
      if (!product) return json({ error: "Produto não encontrado." }, 404);
      const { count, error: usageError } = await userClient.from("order_items")
        .select("id", { count: "exact", head: true }).eq("product_id", id);
      if (usageError) return json({ error: "Não foi possível verificar o histórico de pedidos." }, 400);
      if ((count || 0) > 0) return json({ error: "Este produto já aparece em pedidos e não pode ser excluído sem comprometer o histórico. Desative-o no catálogo em vez disso." }, 409);
      await admin.from("product_internal_data").delete().eq("product_id", id);
      const { error: deleteError } = await userClient.from("products").delete().eq("id", id);
      if (deleteError) return json({ error: "Não foi possível excluir o produto." }, 400);
      if (product.image_url) {
        try {
          const imageUrl = new URL(String(product.image_url));
          const marker = "/storage/v1/object/public/product-images/";
          const pos = imageUrl.pathname.indexOf(marker);
          if (pos >= 0) {
            const objectPath = decodeURIComponent(imageUrl.pathname.slice(pos + marker.length));
            if (objectPath && objectPath.startsWith("products/")) {
              const { error: storageError } = await userClient.storage.from("product-images").remove([objectPath]);
              if (storageError) console.warn("Produto excluído, mas a imagem não foi removida do Storage.");
            }
          }
        } catch { /* URL externa ou inválida: o produto já foi removido; não apagar arquivos fora do bucket. */ }
      }
      return json({ ok: true, product_id: id });
    }

    if (body.action === "save_product") {
      const p = body.product as Record<string, unknown>;
      if (!p || typeof p !== "object" || Array.isArray(p)) return json({ error: "Dados do produto inválidos." }, 400);
      const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
      const name = clean(p.name, 160);
      const price = p.price;
      const wholesalePrice = p.wholesale_price;
      const stock = p.stock_quantity;
      const category = clean(p.category || "Geral", 80);
      const imageUrl = p.image_url ? clean(p.image_url, 1000) : null;
      const colors = Array.isArray(p.colors) ? p.colors.slice(0, 30).map((v) => clean(v, 50)).filter(Boolean) : [];
      if (!name || typeof price !== "number" || !finiteNonNegative(price) ||
          typeof wholesalePrice !== "number" || !finiteNonNegative(wholesalePrice) ||
          !Number.isInteger(stock) || Number(stock) < 0 || Number(stock) > 1000000) {
        return json({ error: "Nome, preço ou estoque inválido." }, 400);
      }
      if (imageUrl) {
        try { if (new URL(imageUrl).protocol !== "https:") throw new Error(); }
        catch { return json({ error: "A URL da imagem deve ser HTTPS válida." }, 400); }
      }
      if (typeof p.active !== "boolean") return json({ error: "Situação do produto inválida." }, 400);
      const catalogOrder = p.catalog_order === undefined ? 0 : p.catalog_order;
      const showOnHomepage = p.show_on_homepage === undefined ? true : p.show_on_homepage;
      const catalogFeatured = p.catalog_featured === undefined ? false : p.catalog_featured;
      if (!Number.isInteger(catalogOrder) || Number(catalogOrder) < 0 || Number(catalogOrder) > 1000000 ||
          typeof showOnHomepage !== "boolean" || typeof catalogFeatured !== "boolean") {
        return json({ error: "Configurações de exibição do catálogo inválidas." }, 400);
      }
      const productPayload = {
        name, sku: clean(p.sku, 80) || null, category, image_url: imageUrl,
        price: Number(price), wholesale_price: Number(wholesalePrice), stock_quantity: Number(stock), colors,
        description: clean(p.description, 3000), catalog_details: clean(p.catalog_details, 3000),
        show_on_homepage: showOnHomepage, catalog_order: catalogOrder, catalog_featured: catalogFeatured,
        active: p.active
      };
      const productId = body.product_id ? String(body.product_id) : "";
      let saved;
      if (productId) {
        if (!/^[0-9a-f-]{36}$/i.test(productId)) return json({ error: "Identificador de produto inválido." }, 400);
        const { data, error } = await userClient.from("products").update(productPayload)
          .eq("id", productId).select("id").maybeSingle();
        if (error) return json({ error: "Não foi possível atualizar o produto." }, 400);
        if (!data) return json({ error: "Produto não encontrado." }, 404);
        saved = data;
      } else {
        const { data, error } = await userClient.from("products").insert(productPayload).select("id").single();
        if (error) return json({ error: "Não foi possível cadastrar o produto." }, 400);
        saved = data;
      }

      // Custo é informação interna e somente o administrador pode alterá-lo.
      if (profile.role === "admin" && body.cost_price !== null && body.cost_price !== undefined) {
        if (!finiteNonNegative(body.cost_price)) return json({ error: "Custo unitário inválido." }, 400);
        const { error } = await userClient.from("product_internal_data").upsert({
          product_id: saved.id, cost_price: Number(body.cost_price), updated_at: new Date().toISOString()
        }, { onConflict: "product_id" });
        if (error) return json({ error: "Produto salvo, mas não foi possível atualizar o custo interno." }, 400);
      }
      return json({ ok: true, product_id: saved.id });
    }

    return json({ error: "Ação não reconhecida." }, 400);
  } catch (_error) {
    return json({ error: "Erro interno ao processar a operação." }, 500);
  }
});
