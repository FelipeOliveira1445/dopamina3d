-- DOPAMINA 3D | STORAGE DE IMAGENS DE PRODUTOS
-- Execute uma vez no SQL Editor do Supabase.
-- Imagens de produtos são públicas para exibição no catálogo.
-- Upload, substituição e exclusão ficam restritos à equipe (admin/colaborador).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  8388608,
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do update
set public = true,
    file_size_limit = 8388608,
    allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif'];

drop policy if exists "public can view product images" on storage.objects;
create policy "public can view product images"
on storage.objects for select
to public
using (bucket_id = 'product-images');

drop policy if exists "staff upload product images" on storage.objects;
create policy "staff upload product images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'product-images' and public.is_staff());

drop policy if exists "staff update product images" on storage.objects;
create policy "staff update product images"
on storage.objects for update
to authenticated
using (bucket_id = 'product-images' and public.is_staff())
with check (bucket_id = 'product-images' and public.is_staff());

drop policy if exists "staff delete product images" on storage.objects;
create policy "staff delete product images"
on storage.objects for delete
to authenticated
using (bucket_id = 'product-images' and public.is_staff());
