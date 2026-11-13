-- DOPAMINA 3D | Supabase schema inicial
-- Execute no SQL Editor do Supabase. Depois crie os buckets privados finance-files e contracts.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null,
 full_name text,
 role text not null default 'reseller' check (role in ('admin','collaborator','reseller')),
 created_at timestamptz not null default now()
);
create table if not exists public.products (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 sku text unique,
 description text,
 price numeric(12,2) not null default 0 check(price>=0),
 colors text[] not null default '{}',
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.orders (
 id uuid primary key default gen_random_uuid(),
 reseller_id uuid not null references public.profiles(id),
 order_type text not null check(order_type in ('purchase','consignment')),
 notes text,
 total numeric(12,2) not null default 0,
 status text not null default 'pending' check(status in ('pending','approved','producing','shipped','completed','cancelled')),
 created_at timestamptz not null default now()
);
create table if not exists public.order_items (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete cascade,
 product_id uuid not null references public.products(id),
 quantity integer not null check(quantity>0),
 unit_price numeric(12,2) not null check(unit_price>=0)
);
create table if not exists public.shipments (
 id uuid primary key default gen_random_uuid(),
 reseller_id uuid not null references public.profiles(id),
 shipment_date date not null default current_date,
 description text,
 status text not null default 'preparing' check(status in ('preparing','sent','delivered')),
 created_at timestamptz not null default now()
);
create table if not exists public.contracts (
 id uuid primary key default gen_random_uuid(),
 reseller_id uuid not null references public.profiles(id),
 title text not null,
 signed_at date,
 file_path text not null,
 status text not null default 'signed',
 created_at timestamptz not null default now()
);
create table if not exists public.financial_transactions (
 id uuid primary key default gen_random_uuid(),
 type text not null check(type in ('income','expense')),
 amount numeric(12,2) not null check(amount>0),
 date date not null default current_date,
 competence_month text not null,
 category text,
 description text not null,
 attachment_path text,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create or replace function public.current_role()
returns text language sql stable security definer set search_path=public
as $$ select role from public.profiles where id=auth.uid() $$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select coalesce(public.current_role()='admin',false) $$;
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path=public
as $$ select coalesce(public.current_role() in ('admin','collaborator'),false) $$;

-- Criar automaticamente um perfil de revendedor após cadastro via Auth.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 insert into public.profiles(id,email,full_name,role)
 values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',''), 'reseller')
 on conflict(id) do nothing;
 return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.shipments enable row level security;
alter table public.contracts enable row level security;
alter table public.financial_transactions enable row level security;

-- Profiles: o usuário lê o próprio perfil; equipe lê perfis para operar; somente admin gerencia papéis.
create policy "profile self or staff read" on public.profiles for select to authenticated
using (id=auth.uid() or public.is_staff());
create policy "admin manages profiles" on public.profiles for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Catálogo: leitura para autenticados; edição por equipe.
create policy "authenticated read products" on public.products for select to authenticated using (true);
create policy "staff manages products" on public.products for all to authenticated
using (public.is_staff()) with check (public.is_staff());

-- Pedidos: revendedor acessa os próprios; equipe acessa todos.
create policy "orders read own or staff" on public.orders for select to authenticated
using (reseller_id=auth.uid() or public.is_staff());
create policy "reseller creates own order" on public.orders for insert to authenticated
with check (reseller_id=auth.uid() and public.current_role()='reseller');
create policy "staff updates orders" on public.orders for update to authenticated
using (public.is_staff()) with check (public.is_staff());
create policy "order items read own or staff" on public.order_items for select to authenticated
using (exists(select 1 from public.orders o where o.id=order_id and (o.reseller_id=auth.uid() or public.is_staff())));
create policy "reseller adds own order items" on public.order_items for insert to authenticated
with check (exists(select 1 from public.orders o where o.id=order_id and o.reseller_id=auth.uid() and public.current_role()='reseller'));

-- Remessas e contratos: cada revendedor vê apenas os próprios; equipe administra.
create policy "shipments read own or staff" on public.shipments for select to authenticated
using (reseller_id=auth.uid() or public.is_staff());
create policy "staff manages shipments" on public.shipments for all to authenticated
using (public.is_staff()) with check (public.is_staff());
create policy "contracts read own or staff" on public.contracts for select to authenticated
using (reseller_id=auth.uid() or public.is_staff());
create policy "admin manages contracts" on public.contracts for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Financeiro é exclusivo do administrador.
create policy "admin manages finance" on public.financial_transactions for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Storage: buckets privados. Acesso a comprovantes somente admin.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('finance-files','finance-files',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('contracts','contracts',false,20971520,array['application/pdf'])
on conflict(id) do nothing;

create policy "admin reads finance files" on storage.objects for select to authenticated
using (bucket_id='finance-files' and public.is_admin());
create policy "admin uploads finance files" on storage.objects for insert to authenticated
with check (bucket_id='finance-files' and public.is_admin());
create policy "admin updates finance files" on storage.objects for update to authenticated
using (bucket_id='finance-files' and public.is_admin()) with check (bucket_id='finance-files' and public.is_admin());
create policy "admin reads contracts" on storage.objects for select to authenticated
using (bucket_id='contracts' and (public.is_staff() or (storage.foldername(name))[1]=auth.uid()::text));
create policy "admin uploads contracts" on storage.objects for insert to authenticated
with check (bucket_id='contracts' and public.is_admin());
create policy "admin updates contracts" on storage.objects for update to authenticated
using (bucket_id='contracts' and public.is_admin()) with check (bucket_id='contracts' and public.is_admin());

-- ATENÇÃO: configure o primeiro administrador manualmente após criar a conta no Supabase Auth:
-- update public.profiles set role='admin', full_name='Nome do administrador' where email='SEU_EMAIL';
-- Nunca permita alteração de role pelo próprio usuário.
