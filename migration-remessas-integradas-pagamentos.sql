-- Dopamina 3D | Remessas integradas, confirmação de entrega e comprovantes de compra
-- Execute no Supabase SQL Editor DEPOIS das migrações anteriores de pedidos e remessas.

begin;

-- Relaciona cada remessa à origem operacional (pedido de consignação ou contrato).
alter table public.shipments
  add column if not exists order_id uuid references public.orders(id) on delete set null,
  add column if not exists contract_id uuid references public.contracts(id) on delete set null;

create unique index if not exists shipments_order_id_uidx
  on public.shipments(order_id) where order_id is not null;
create index if not exists shipments_contract_id_idx
  on public.shipments(contract_id) where contract_id is not null;

-- Guarda o caminho do comprovante de pagamento de pedidos de compra.
alter table public.orders
  add column if not exists payment_attachment_path text,
  add column if not exists payment_attached_at timestamptz;

-- Cada item inserido em pedido de consignação cria/atualiza uma única remessa.
create or replace function public.sync_consignment_order_shipment()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_order public.orders%rowtype;
  v_description text;
begin
  select * into v_order from public.orders where id=new.order_id;
  if not found or v_order.order_type <> 'consignment' then return new; end if;

  select string_agg(oi.quantity::text || '× ' || coalesce(p.name,'Peça'), '; ' order by p.name)
    into v_description
    from public.order_items oi
    left join public.products p on p.id=oi.product_id
   where oi.order_id=new.order_id;

  insert into public.shipments(reseller_id,shipment_date,status,description,shipment_type,order_id)
  values(v_order.reseller_id,current_date,'preparing',coalesce(v_description,'Remessa de consignação'),'consignment',v_order.id)
  on conflict (order_id) where order_id is not null
  do update set description=excluded.description;
  return new;
end;
$function$;

drop trigger if exists trg_sync_consignment_order_shipment on public.order_items;
create trigger trg_sync_consignment_order_shipment
after insert on public.order_items
for each row execute function public.sync_consignment_order_shipment();

-- Revendedor pode apenas confirmar a entrega de remessa própria de consignação.
-- Não existe operação de regressão de status disponível ao revendedor.
create or replace function public.reseller_confirm_shipment_delivery(p_shipment uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $function$
declare v_count integer;
begin
  if auth.uid() is null or public.current_role() <> 'reseller' then
    raise exception 'Apenas o revendedor vinculado pode confirmar o recebimento.';
  end if;
  update public.shipments
     set status='delivered'
   where id=p_shipment
     and reseller_id=auth.uid()
     and shipment_type='consignment'
     and status in ('preparing','sent');
  get diagnostics v_count = row_count;
  if v_count=0 then
    if exists(select 1 from public.shipments where id=p_shipment and reseller_id=auth.uid() and shipment_type='consignment' and status='delivered') then
      return true;
    end if;
    raise exception 'Remessa não encontrada ou não autorizada.';
  end if;
  return true;
end;
$function$;
revoke all on function public.reseller_confirm_shipment_delivery(uuid) from public,anon;
grant execute on function public.reseller_confirm_shipment_delivery(uuid) to authenticated;

-- Anexa comprovante apenas a pedido de compra próprio e aprovado.
create or replace function public.attach_order_payment(p_order uuid,p_path text)
returns boolean
language plpgsql
security definer
set search_path=public
as $function$
declare v_count integer;
begin
  if auth.uid() is null or public.current_role() <> 'reseller' then
    raise exception 'Operação exclusiva para revendedores.';
  end if;
  if p_path is null or p_path !~ ('^' || auth.uid()::text || '/' || p_order::text || '/[^/]+$') then
    raise exception 'Caminho do comprovante inválido.';
  end if;
  update public.orders
     set payment_attachment_path=p_path,payment_attached_at=now()
   where id=p_order and reseller_id=auth.uid() and order_type='purchase' and status='approved';
  get diagnostics v_count = row_count;
  if v_count=0 then raise exception 'O pedido não está aprovado ou não pertence a esta conta.'; end if;
  return true;
end;
$function$;
revoke all on function public.attach_order_payment(uuid,text) from public,anon;
grant execute on function public.attach_order_payment(uuid,text) to authenticated;

-- Bucket privado para comprovantes. O revendedor só grava na própria pasta;
-- leitura fica restrita à equipe por política, sem URL pública.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('order-payments','order-payments',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=10485760,
  allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/webp'];

drop policy if exists "reseller uploads own order payment" on storage.objects;
create policy "reseller uploads own order payment" on storage.objects
for insert to authenticated
with check (bucket_id='order-payments' and (storage.foldername(name))[1]=auth.uid()::text and public.current_role()='reseller');

drop policy if exists "staff reads order payments" on storage.objects;
create policy "staff reads order payments" on storage.objects
for select to authenticated
using (bucket_id='order-payments' and public.is_staff());

drop policy if exists "reseller reads own order payments" on storage.objects;
create policy "reseller reads own order payments" on storage.objects
for select to authenticated
using (bucket_id='order-payments' and (storage.foldername(name))[1]=auth.uid()::text);

commit;
