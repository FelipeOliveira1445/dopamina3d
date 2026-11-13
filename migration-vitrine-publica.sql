-- DOPAMINA 3D | Vitrine pública sincronizada com Produtos e Estoque
-- Execute no SQL Editor do Supabase antes de publicar esta versão.
-- Não concede leitura pública da tabela products nem de custos/estoque interno.

alter table public.products
  add column if not exists show_on_homepage boolean not null default true,
  add column if not exists catalog_order integer not null default 0,
  add column if not exists catalog_featured boolean not null default false,
  add column if not exists catalog_details text not null default '';

-- View pública com somente os campos comerciais necessários ao catálogo.
-- A view é criada pelo proprietário do schema e não expõe a tabela interna inteira.
create or replace view public.public_catalog_products
with (security_barrier = true)
as
select
  id,
  name,
  description,
  catalog_details,
  price,
  colors,
  image_url,
  category,
  catalog_order,
  catalog_featured
from public.products
where active = true
  and show_on_homepage = true;

revoke all on public.public_catalog_products from public;
revoke all on public.public_catalog_products from anon, authenticated;
grant select on public.public_catalog_products to anon, authenticated;

notify pgrst, 'reload schema';
