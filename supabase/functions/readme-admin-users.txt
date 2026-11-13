FUNÇÃO ADMIN-USERS

Implantaçao: supabase functions deploy admin-users
A função usa SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY do ambiente Supabase. A service role permanece somente no ambiente server-side da Edge Function; nunca coloque essa chave no portal-config.js ou em arquivos públicos.

A interface de gestão por convite é entregue como backend de segurança. Configure também SMTP de produção no Supabase Auth para envio confiável dos convites e recuperação de senha.
