# Dopamina 3D — Área do Cliente

Pacote inicial para integrar uma área autenticada ao catálogo atual, mantendo a hospedagem estática no Netlify e usando Supabase para autenticação, banco e arquivos privados.

## O que está incluído

- `index.html`: cópia do catálogo enviado, com link **Área do Cliente** no rodapé.
- `portal.html` / `portal.js`: login e ambientes por papel.
- `criar-senha.html`: destino exclusivo dos convites e primeiro acesso.
- `redefinir-senha.html`: destino exclusivo dos e-mails de recuperação de senha.
- `auth-flow.js`: validação dos códigos/tokens de autenticação e gravação da senha.
- `definir-senha.html`: redirecionamento de compatibilidade para convites antigos.
- `portal-config.js`: configuração pública do projeto Supabase.
- `supabase/schema.sql`: tabelas, funções e políticas RLS.
- `assets/`: reservado para imagens adicionais do portal.

## Papéis e permissões

- **Admin:** catálogo, pedidos, remessas, contratos, usuários e financeiro.
- **Colaborador:** catálogo, pedidos, remessas e consulta de contratos. Sem acesso ao financeiro e à gestão de papéis.
- **Revendedor:** visualiza seu contrato, solicita peças (compra ou consignação), acompanha seus pedidos e remessas. As políticas RLS restringem os dados ao próprio revendedor.

## Instalação

1. Crie um projeto em https://supabase.com/.
2. No painel do Supabase, abra **SQL Editor** e execute `supabase/schema.sql`.
3. Em **Authentication > Providers**, mantenha Email habilitado. Configure confirmação de e-mail e recuperação de senha conforme sua operação.
4. Em **Project Settings > API**, copie Project URL e `anon`/publishable key para `portal-config.js`.
   - Não use a chave `service_role` no navegador ou no Netlify.
5. Crie a primeira conta de administrador em **Authentication > Users**.
6. Execute no SQL Editor, substituindo o e-mail:
   ```sql
   update public.profiles
   set role='admin', full_name='Administrador Dopamina 3D'
   where email='SEU_EMAIL';
   ```
7. Publique `index.html`, `portal.html`, `portal.js`, `portal-config.js` e a pasta `supabase/` na mesma pasta publicada pelo Netlify. O catálogo existente deve continuar como página inicial (`index.html`).
8. Cadastre usuários de colaboradores e revendedores em **Authentication > Users**. O trigger cria o perfil inicial como `reseller`. Depois, atribua os papéis de equipe pelo SQL Editor:
   ```sql
   update public.profiles set role='collaborator' where email='colaborador@exemplo.com';
   ```
   Para novos revendedores, mantenha `role='reseller'`.
9. Para liberar contratos, o administrador anexa PDFs na área de Contratos. Os arquivos ficam em bucket privado e são apresentados por URL temporária.

## Observações importantes antes de produção

- O portal é um ponto de partida funcional, mas requer configuração do projeto Supabase e testes com contas reais antes de divulgar.
- O formulário de pedido registra solicitação e itens. A aprovação, cobrança, emissão fiscal, baixa de estoque e integração com meios de pagamento não estão automatizadas.
- A tela de remessas permite cadastrar e acompanhar status; a lista de itens por remessa e comprovante de entrega podem ser adicionados em uma próxima etapa.
- O catálogo do portal e o catálogo público ainda não estão sincronizados automaticamente. Para refletir preço/cores no site público, será necessário substituir os cards estáticos por consulta ao Supabase ou criar uma rotina de publicação.
- Para o colaborador, o acesso é limitado por RLS às funções de equipe previstas. O financeiro é exclusivo do administrador.
- O primeiro administrador deve ser promovido manualmente, pois o cadastro público nunca pode escolher o próprio papel.
- Configure backups, MFA para administradores, política de privacidade/LGPD, retenção documental e limites de upload.
- A tela financeira mostra totais dos lançamentos retornados e o resumo mensal no dashboard. Ela não substitui escrituração contábil nem conciliação bancária.

## Próxima evolução recomendada

1. Sincronizar catálogo público e painel.
2. Adicionar linhas de itens às remessas, histórico de entregas e aceite do revendedor.
3. Incluir fluxo de aprovação de pedidos e cálculo automático de repasse/consignação.
4. Adicionar filtros por período, categorias, exportação CSV/PDF e gráficos ao financeiro.
5. Implementar recuperação de senha e convite de usuários pelo painel administrativo com Edge Function (sem expor chaves privilegiadas no navegador).


## Fluxos de senha (versão atualizada)

- Convites enviados pelo painel administrativo usam o secret `DOPAMINA_APP_URL` e devem apontar para `https://SEU-SITE/criar-senha.html`.
- O botão “Esqueci minha senha” em `portal.html` envia o link para `https://SEU-SITE/redefinir-senha.html`.
- Cadastre ambas as URLs em Supabase > Authentication > URL Configuration > Redirect URLs.
- Publique `criar-senha.html`, `redefinir-senha.html`, `auth-flow.js`, `definir-senha.html`, `portal.html` e `portal.js`, preservando o `portal-config.js` real.
- As páginas processam explicitamente PKCE (`code`), `token_hash` e tokens no fragmento, evitando depender de um único formato de link.
