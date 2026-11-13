-- Rode no SQL Editor do Supabase (depois de migration-pedidos-avulsos-contratos.sql).
-- Edição de pedidos ANTES da produção + arredondamento do total (,50 / ,99).

-- Arredondamento: centavos 01–50 viram ,50; 51–99 viram ,99; valores inteiros ficam como estão.
create or replace function public.charm_round(n numeric) returns numeric language sql immutable as $$
  select case when n<=0 then 0
              when round(n*100)%100=0 then round(n*100)/100
              when round(n*100)%100<=50 then floor(round(n*100)/100)+0.50
              else floor(round(n*100)/100)+0.99 end $$;

alter table public.manual_orders add column if not exists subtotal numeric(12,2);
alter table public.manual_orders add column if not exists round_total boolean not null default true;

-- Itens do pedido avulso só mudam pela função abaixo (que trava depois de "Em produção").
drop policy if exists "staff manages manual items" on public.manual_order_items;
drop policy if exists "staff reads manual items" on public.manual_order_items;
drop policy if exists "staff adds manual items" on public.manual_order_items;
create policy "staff reads manual items" on public.manual_order_items for select to authenticated using (public.is_staff());
create policy "staff adds manual items" on public.manual_order_items for insert to authenticated with check (public.is_staff());

create or replace function public.edit_manual_order(p_order uuid, p_fields jsonb, p_items jsonb, p_round boolean)
returns numeric language plpgsql security definer set search_path=public as $$
declare st text; sub numeric; tot numeric;
begin
  if not public.is_staff() then raise exception 'Sem permissão.'; end if;
  select status into st from public.manual_orders where id=p_order for update;
  if st is null then raise exception 'Pedido não encontrado.'; end if;
  if st not in ('pending','approved') then raise exception 'Pedido já está em produção ou finalizado e não pode mais ser alterado.'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Informe ao menos um item.'; end if;
  delete from public.manual_order_items where order_id=p_order;
  insert into public.manual_order_items(order_id,product_id,description,availability,quantity,unit_price)
    select p_order, nullif(i->>'product_id','')::uuid, left(i->>'description',160),
           coalesce(nullif(i->>'availability',''),'fora_catalogo'), (i->>'quantity')::int, round((i->>'unit_price')::numeric,2)
    from jsonb_array_elements(p_items) i;
  select coalesce(sum(quantity*unit_price),0) into sub from public.manual_order_items where order_id=p_order;
  tot := case when p_round then public.charm_round(sub) else sub end;
  update public.manual_orders set
    customer_name=coalesce(nullif(p_fields->>'customer_name',''),customer_name),
    customer_phone=nullif(p_fields->>'customer_phone',''), customer_email=nullif(p_fields->>'customer_email',''),
    channel=coalesce(nullif(p_fields->>'channel',''),channel), notes=nullif(p_fields->>'notes',''),
    subtotal=sub, round_total=p_round, total=tot where id=p_order;
  return tot;
end $$;

-- Pedidos de revendedores (tabela orders): staff altera itens e total enquanto pendente/aprovado.
create or replace function public.edit_order(p_order uuid, p_items jsonb, p_round boolean)
returns numeric language plpgsql security definer set search_path=public as $$
declare st text; sub numeric; tot numeric;
begin
  if not public.is_staff() then raise exception 'Sem permissão.'; end if;
  select status into st from public.orders where id=p_order for update;
  if st is null then raise exception 'Pedido não encontrado.'; end if;
  if st not in ('pending','approved') then raise exception 'Pedido já está em produção ou finalizado e não pode mais ser alterado.'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Informe ao menos um item.'; end if;
  delete from public.order_items where order_id=p_order;
  insert into public.order_items(order_id,product_id,quantity,unit_price)
    select p_order, (i->>'product_id')::uuid, (i->>'quantity')::int, round((i->>'unit_price')::numeric,2)
    from jsonb_array_elements(p_items) i;
  select coalesce(sum(quantity*unit_price),0) into sub from public.order_items where order_id=p_order;
  tot := case when p_round then public.charm_round(sub) else sub end;
  update public.orders set total=tot where id=p_order;
  return tot;
end $$;

revoke all on function public.edit_manual_order(uuid,jsonb,jsonb,boolean) from public, anon;
revoke all on function public.edit_order(uuid,jsonb,boolean) from public, anon;
grant execute on function public.edit_manual_order(uuid,jsonb,jsonb,boolean) to authenticated;
grant execute on function public.edit_order(uuid,jsonb,boolean) to authenticated;
