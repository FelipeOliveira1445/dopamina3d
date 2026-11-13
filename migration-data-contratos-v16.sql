-- Dopamina 3D | Data de criação/última modificação dos contratos v16
-- Execute no Supabase SQL Editor antes de publicar a v16.

alter table public.contracts
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_contract_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists contracts_set_updated_at on public.contracts;
create trigger contracts_set_updated_at
before update on public.contracts
for each row execute function public.set_contract_updated_at();

-- Assinados: exibe signed_at (fallback: digital_signature_checked_at).
-- Não assinados: exibe updated_at (fallback: created_at).
