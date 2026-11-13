-- Dopamina 3D | Acerto detalhado de remessas de consignação
-- Execute no SQL Editor do Supabase antes de publicar esta versão.
-- Mantém as colunas settlement_amount / settled_at / settled_by já existentes.

alter table public.shipments
  add column if not exists settlement_date date,
  add column if not exists settlement_has_unsold boolean not null default false,
  add column if not exists settlement_unsold_details text;

-- Permite registrar acerto sem valor recebido quando nenhuma peça foi vendida.
alter table public.shipments
  drop constraint if exists shipments_settlement_amount_check;

alter table public.shipments
  add constraint shipments_settlement_amount_nonnegative_check
  check (settlement_amount is null or settlement_amount >= 0);

create index if not exists shipments_settlement_date_idx
  on public.shipments(settlement_date)
  where settled_at is not null;
