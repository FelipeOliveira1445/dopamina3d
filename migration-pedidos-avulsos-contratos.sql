-- Rode no SQL Editor do Supabase. Pedidos avulsos + gerador de contratos.
create table if not exists public.manual_orders(
 id uuid primary key default gen_random_uuid(),
 customer_name text not null check(char_length(customer_name) between 2 and 120),
 customer_phone text check(char_length(customer_phone)<=30),
 customer_email text check(char_length(customer_email)<=254),
 channel text not null default 'whatsapp' check(channel in ('whatsapp','instagram','loja','site','outro')),
 notes text check(char_length(notes)<=1000),
 total numeric(12,2) not null default 0 check(total>=0),
 status text not null default 'pending' check(status in ('pending','approved','producing','shipped','completed','cancelled')),
 payment_status text not null default 'pending' check(payment_status in ('pending','paid')),
 created_by uuid default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now());
create table if not exists public.manual_order_items(
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.manual_orders(id) on delete cascade,
 product_id uuid references public.products(id) on delete set null,
 description text not null check(char_length(description) between 1 and 160),
 availability text not null default 'ativo' check(availability in ('ativo','inativo','fora_catalogo')),
 quantity integer not null check(quantity>0),
 unit_price numeric(12,2) not null check(unit_price>=0));
create table if not exists public.contract_settings(id int primary key default 1 check(id=1), data jsonb not null default '{}', updated_at timestamptz default now());
create table if not exists public.contract_data(contract_id uuid primary key references public.contracts(id) on delete cascade, data jsonb not null, created_at timestamptz default now());
alter table public.manual_orders enable row level security; alter table public.manual_order_items enable row level security;
alter table public.contract_settings enable row level security; alter table public.contract_data enable row level security;
drop policy if exists "staff manages manual orders" on public.manual_orders;
create policy "staff manages manual orders" on public.manual_orders for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff manages manual items" on public.manual_order_items;
create policy "staff manages manual items" on public.manual_order_items for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "admin manages contract settings" on public.contract_settings;
create policy "admin manages contract settings" on public.contract_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin manages contract data" on public.contract_data;
create policy "admin manages contract data" on public.contract_data for all to authenticated using (public.is_admin()) with check (public.is_admin());
