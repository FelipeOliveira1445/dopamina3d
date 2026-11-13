-- Dopamina 3D — preço de atacado e edição segura de pedidos pelo revendedor
-- Executar no SQL Editor do Supabase DEPOIS de migration-edicao-pedidos.sql.
begin;

-- Preço de atacado: preenche os produtos existentes com o preço atual de varejo
-- apenas quando a coluna ainda não tinha valor. Depois o administrador ajusta cada SKU.
alter table public.products add column if not exists wholesale_price numeric(12,2);
update public.products set wholesale_price=price where wholesale_price is null;
alter table public.products alter column wholesale_price set default 0;
alter table public.products alter column wholesale_price set not null;

-- Chave de idempotência para evitar pedidos duplicados em reenvios de rede.
alter table public.orders add column if not exists request_id uuid;
create unique index if not exists orders_request_id_uidx
  on public.orders(request_id) where request_id is not null;

create or replace function public.create_reseller_order_v2(
  p_order_type text,
  p_notes text,
  p_items jsonb,
  p_request_id uuid
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_order uuid;
  v_count integer;
  v_distinct integer;
  v_units integer;
  v_subtotal numeric(12,2);
begin
  if v_uid is null then raise exception 'Faça login para enviar o pedido.'; end if;
  select role into v_role from public.profiles where id=v_uid;
  if coalesce(v_role,'') <> 'reseller' then raise exception 'Esta operação é exclusiva para revendedores.'; end if;
  if p_order_type is null or p_order_type not in ('purchase','consignment') then raise exception 'Modalidade inválida.'; end if;
  if p_request_id is null then raise exception 'Identificador da solicitação ausente.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Adicione ao menos uma peça.'; end if;

  -- Se o mesmo envio for repetido por perda de conexão, retorna o pedido já criado.
  select id into v_order from public.orders where request_id=p_request_id;
  if v_order is not null then
    if not exists(select 1 from public.orders where id=v_order and reseller_id=v_uid) then
      raise exception 'Identificador de pedido já utilizado.';
    end if;
    return v_order;
  end if;

  select count(*), count(distinct (i->>'product_id')::uuid),
         coalesce(sum((i->>'quantity')::integer),0)
    into v_count,v_distinct,v_units
    from jsonb_array_elements(p_items) i;
  if v_count<>v_distinct then raise exception 'Não repita o mesmo modelo; consolide as quantidades.'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) i
            where coalesce((i->>'quantity')::integer,0)<1 or (i->>'quantity')::integer>1000) then
    raise exception 'Quantidade inválida.';
  end if;

  if p_order_type='purchase' then
    if v_units<30 then raise exception 'Compra de peças exige no mínimo 30 unidades no pedido.'; end if;
    if exists(select 1 from jsonb_array_elements(p_items) i where (i->>'quantity')::integer<10) then
      raise exception 'Na compra, cada modelo deve ter no mínimo 10 unidades.';
    end if;
  end if;

  select count(*) into v_count
    from jsonb_array_elements(p_items) i
    join public.products p on p.id=(i->>'product_id')::uuid
   where p.active=true;
  if v_count<>jsonb_array_length(p_items) then
    raise exception 'Um ou mais produtos não estão disponíveis no catálogo.';
  end if;

  insert into public.orders(reseller_id,order_type,notes,total,request_id)
  values(v_uid,p_order_type,left(nullif(trim(p_notes),''),2000),0,p_request_id)
  on conflict (request_id) where request_id is not null do nothing
  returning id into v_order;

  if v_order is null then
    select id into v_order from public.orders where request_id=p_request_id and reseller_id=v_uid;
    if v_order is null then raise exception 'Não foi possível confirmar o pedido.'; end if;
    return v_order;
  end if;

  insert into public.order_items(order_id,product_id,quantity,unit_price)
  select v_order,p.id,(i->>'quantity')::integer,p.wholesale_price
    from jsonb_array_elements(p_items) i
    join public.products p on p.id=(i->>'product_id')::uuid
   where p.active=true;

  select coalesce(sum(quantity*unit_price),0) into v_subtotal
    from public.order_items where order_id=v_order;
  update public.orders set total=public.charm_round(v_subtotal) where id=v_order;
  return v_order;
end;
$$;

-- Equipe continua podendo editar pedidos; o revendedor também pode editar
-- somente os próprios pedidos enquanto aguardam análise ou estão aprovados.
-- Para revendedores, o banco ignora preços enviados pelo navegador e usa wholesale_price.
create or replace function public.edit_order(p_order uuid,p_items jsonb,p_round boolean)
returns numeric
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_owner uuid;
  v_status text;
  v_type text;
  v_is_reseller boolean;
  v_count integer;
  v_distinct integer;
  v_units integer;
  v_sub numeric(12,2);
  v_total numeric(12,2);
begin
  if v_uid is null then raise exception 'Faça login para editar o pedido.'; end if;
  select role into v_role from public.profiles where id=v_uid;
  select reseller_id,status,order_type into v_owner,v_status,v_type
    from public.orders where id=p_order for update;
  if v_status is null then raise exception 'Pedido não encontrado.'; end if;

  v_is_reseller := coalesce(v_role='reseller',false);
  if not public.is_staff() and not (v_is_reseller and v_owner=v_uid) then
    raise exception 'Sem permissão para editar este pedido.';
  end if;
  if v_is_reseller and v_owner<>v_uid then raise exception 'Você só pode editar seus próprios pedidos.'; end if;
  if v_status not in ('pending','approved') then
    raise exception 'Pedido já está em produção ou finalizado e não pode mais ser alterado.';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Informe ao menos um item.'; end if;

  select count(*),count(distinct (i->>'product_id')::uuid),
         coalesce(sum((i->>'quantity')::integer),0)
    into v_count,v_distinct,v_units from jsonb_array_elements(p_items) i;
  if v_count<>v_distinct then raise exception 'Não repita o mesmo modelo; consolide as quantidades.'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) i
            where coalesce((i->>'quantity')::integer,0)<1 or (i->>'quantity')::integer>1000) then
    raise exception 'Quantidade inválida.';
  end if;
  if v_is_reseller and v_type='purchase' then
    if v_units<30 then raise exception 'Compra de peças exige no mínimo 30 unidades no pedido.'; end if;
    if exists(select 1 from jsonb_array_elements(p_items) i where (i->>'quantity')::integer<10) then
      raise exception 'Na compra, cada modelo deve ter no mínimo 10 unidades.';
    end if;
  end if;

  select count(*) into v_count
    from jsonb_array_elements(p_items) i
    join public.products p on p.id=(i->>'product_id')::uuid
   where p.active=true;
  if v_count<>jsonb_array_length(p_items) then raise exception 'Um ou mais produtos não estão ativos no catálogo.'; end if;

  delete from public.order_items where order_id=p_order;
  insert into public.order_items(order_id,product_id,quantity,unit_price)
  select p_order,p.id,(i->>'quantity')::integer,
         case when v_is_reseller then p.wholesale_price else round((i->>'unit_price')::numeric,2) end
    from jsonb_array_elements(p_items) i
    join public.products p on p.id=(i->>'product_id')::uuid
   where p.active=true;

  select coalesce(sum(quantity*unit_price),0) into v_sub from public.order_items where order_id=p_order;
  v_total:=case when coalesce(p_round,true) then public.charm_round(v_sub) else v_sub end;
  update public.orders set total=v_total where id=p_order;
  return v_total;
end;
$$;

revoke all on function public.create_reseller_order_v2(text,text,jsonb,uuid) from public,anon;
revoke all on function public.edit_order(uuid,jsonb,boolean) from public,anon;
grant execute on function public.create_reseller_order_v2(text,text,jsonb,uuid) to authenticated;
grant execute on function public.edit_order(uuid,jsonb,boolean) to authenticated;

commit;
