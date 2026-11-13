-- DOPAMINA 3D | Tipos de remessa e acerto de consignação
-- Execute uma vez no SQL Editor do Supabase antes de publicar o novo portal.

alter table public.shipments
  add column if not exists shipment_type text not null default 'purchase'
    check (shipment_type in ('purchase','consignment')),
  add column if not exists settlement_amount numeric(12,2)
    check (settlement_amount is null or settlement_amount > 0),
  add column if not exists settled_at timestamptz,
  add column if not exists settled_by uuid references public.profiles(id);

create index if not exists shipments_status_created_idx
  on public.shipments(status, created_at desc);
create index if not exists shipments_reseller_idx
  on public.shipments(reseller_id, created_at desc);

-- A política existente "staff manages shipments" já limita alterações à equipe.
-- A política existente "admin manages finance" limita o registro do acerto financeiro ao administrador.
-- Nenhuma política RLS é ampliada por esta migração.
