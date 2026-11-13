-- Dopamina 3D | Acerto detalhado de remessas de consignação (v14)
-- Execute uma vez no Supabase SQL Editor antes de publicar o pacote v14.

-- Composição da remessa: preço de atacado congelado no momento do envio.
create table if not exists public.shipment_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  product_id uuid null references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_wholesale_price numeric(12,2) not null default 0 check (unit_wholesale_price >= 0),
  created_at timestamptz not null default now()
);

-- Peças efetivamente devolvidas no acerto.
create table if not exists public.shipment_return_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  product_id uuid null references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_wholesale_price numeric(12,2) not null default 0 check (unit_wholesale_price >= 0),
  created_at timestamptz not null default now()
);

create index if not exists shipment_items_shipment_idx
  on public.shipment_items(shipment_id);
create index if not exists shipment_return_items_shipment_idx
  on public.shipment_return_items(shipment_id);

alter table public.shipments
  add column if not exists settlement_date date,
  add column if not exists settlement_has_unsold boolean not null default false,
  add column if not exists settlement_unsold_details text;

-- Permite acerto sem receita quando o total devido for zero.
alter table public.shipments
  drop constraint if exists shipments_settlement_amount_check;
alter table public.shipments
  drop constraint if exists shipments_settlement_amount_nonnegative_check;
alter table public.shipments
  add constraint shipments_settlement_amount_nonnegative_check
  check (settlement_amount is null or settlement_amount >= 0);

alter table public.shipment_items enable row level security;
alter table public.shipment_return_items enable row level security;

drop policy if exists "shipment items read own or staff" on public.shipment_items;
create policy "shipment items read own or staff"
on public.shipment_items for select to authenticated
using (
  public.is_staff() or exists (
    select 1 from public.shipments s
    where s.id = shipment_id and s.reseller_id = auth.uid()
  )
);

drop policy if exists "staff manages shipment items" on public.shipment_items;
create policy "staff manages shipment items"
on public.shipment_items for all to authenticated
using (public.is_staff()) with check (public.is_staff());

drop policy if exists "shipment returns read own or staff" on public.shipment_return_items;
create policy "shipment returns read own or staff"
on public.shipment_return_items for select to authenticated
using (
  public.is_staff() or exists (
    select 1 from public.shipments s
    where s.id = shipment_id and s.reseller_id = auth.uid()
  )
);

drop policy if exists "staff manages shipment returns" on public.shipment_return_items;
create policy "staff manages shipment returns"
on public.shipment_return_items for all to authenticated
using (public.is_staff()) with check (public.is_staff());

grant select, insert, update, delete on public.shipment_items to authenticated;
grant select, insert, update, delete on public.shipment_return_items to authenticated;

-- A política existente de financial_transactions continua exclusiva do administrador.

-- Mantém o requisito de auditoria também para as novas tabelas.
drop trigger if exists audit_capture_row on public.shipment_items;
create trigger audit_capture_row
after insert or update or delete on public.shipment_items
for each row execute function public.capture_audit_log();

drop trigger if exists audit_capture_row on public.shipment_return_items;
create trigger audit_capture_row
after insert or update or delete on public.shipment_return_items
for each row execute function public.capture_audit_log();
