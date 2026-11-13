-- Dopamina 3D | Status de verificação de assinatura digital dos contratos
-- O site NÃO deve inferir assinatura a partir de signed_at, status ou imagem manuscrita.
-- Somente um verificador eletrônico/criptográfico confiável deve marcar "verified".

alter table public.contracts
  add column if not exists digital_signature_status text not null default 'not_verified',
  add column if not exists digital_signature_checked_at timestamptz,
  add column if not exists digital_signature_provider text,
  add column if not exists digital_signature_details text;

alter table public.contracts
  drop constraint if exists contracts_digital_signature_status_check;

alter table public.contracts
  add constraint contracts_digital_signature_status_check
  check (digital_signature_status in ('not_verified','verified','invalid'));

-- Não transforma registros antigos em assinados: exige verificação real.
update public.contracts
set digital_signature_status='not_verified',
    digital_signature_checked_at=null
where digital_signature_status is null;
