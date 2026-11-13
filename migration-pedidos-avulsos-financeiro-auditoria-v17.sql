-- Dopamina 3D | Integração financeira de pedidos avulsos + auditoria em português v17
-- Execute no SQL Editor do Supabase antes de publicar a v17.

-- 1) Vínculo reversível entre lançamento financeiro e pedido avulso.
alter table public.financial_transactions
  add column if not exists manual_order_id uuid;

create unique index if not exists financial_transactions_manual_order_uidx
  on public.financial_transactions(manual_order_id)
  where manual_order_id is not null;

-- 2) Sincroniza pagamento do pedido avulso com o Financeiro.
create or replace function public.sync_manual_order_finance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_items text;
  v_description text;
  v_amount numeric(12,2);
  v_date date;
begin
  if tg_op = 'DELETE' then
    delete from public.financial_transactions
      where manual_order_id = old.id;
    return old;
  end if;

  if new.payment_status = 'paid' then
    v_amount := round(coalesce(new.total,0),2);
    select string_agg(format('%s x %s', i.quantity, i.description), ', ' order by i.description)
      into v_items
      from public.manual_order_items i
      where i.order_id = new.id;

    v_description := left(
      'Pedido avulso #' || left(new.id::text,8) ||
      ' — ' || coalesce(new.customer_name,'Cliente') ||
      case when nullif(v_items,'') is not null then ' — ' || v_items else '' end ||
      case when nullif(new.channel,'') is not null then ' — Canal: ' || new.channel else '' end,
      500
    );
    v_date := coalesce(new.created_at::date, current_date);

    if v_amount > 0 then
      insert into public.financial_transactions
        (type, amount, date, competence_month, category, description, created_by, manual_order_id)
      values
        ('income', v_amount, v_date, to_char(v_date,'YYYY-MM'), 'Pedido avulso', v_description, coalesce(new.created_by,auth.uid()), new.id)
      on conflict (manual_order_id) where manual_order_id is not null
      do update set
        amount = excluded.amount,
        date = excluded.date,
        competence_month = excluded.competence_month,
        category = excluded.category,
        description = excluded.description;
    else
      -- Pedido de valor zero não gera receita fictícia.
      delete from public.financial_transactions where manual_order_id = new.id;
    end if;
  elsif new.payment_status = 'pending' then
    delete from public.financial_transactions where manual_order_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists manual_orders_sync_finance on public.manual_orders;
create trigger manual_orders_sync_finance
after insert or update of payment_status, total, customer_name, customer_phone, customer_email, channel
or delete on public.manual_orders
for each row execute function public.sync_manual_order_finance();

-- Se itens do pedido forem alterados enquanto o pedido estiver pago,
-- atualiza a descrição do lançamento vinculado.
create or replace function public.refresh_paid_manual_order_finance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_order public.manual_orders%rowtype;
  v_items text;
begin
  v_order_id := case when tg_op='DELETE' then old.order_id else new.order_id end;
  select * into v_order from public.manual_orders where id=v_order_id;
  if not found or v_order.payment_status <> 'paid' then
    return case when tg_op='DELETE' then old else new end;
  end if;

  select string_agg(format('%s x %s', i.quantity, i.description), ', ' order by i.description)
    into v_items
    from public.manual_order_items i where i.order_id=v_order_id;

  update public.financial_transactions
  set description=left(
    'Pedido avulso #' || left(v_order.id::text,8) ||
    ' — ' || coalesce(v_order.customer_name,'Cliente') ||
    case when nullif(v_items,'') is not null then ' — ' || v_items else '' end ||
    case when nullif(v_order.channel,'') is not null then ' — Canal: ' || v_order.channel else '' end,500),
    amount=round(coalesce(v_order.total,0),2)
  where manual_order_id=v_order_id;

  return case when tg_op='DELETE' then old else new end;
end;
$$;

drop trigger if exists manual_order_items_refresh_finance on public.manual_order_items;
create trigger manual_order_items_refresh_finance
after insert or update or delete on public.manual_order_items
for each row execute function public.refresh_paid_manual_order_finance();

-- 3) Excluir o lançamento financeiro vinculado desfaz automaticamente o pagamento.
create or replace function public.revert_manual_order_payment_on_finance_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.manual_order_id is not null then
    update public.manual_orders
       set payment_status='pending'
     where id=old.manual_order_id
       and payment_status='paid';
  end if;
  return old;
end;
$$;

drop trigger if exists financial_delete_reverts_manual_order on public.financial_transactions;
create trigger financial_delete_reverts_manual_order
after delete on public.financial_transactions
for each row execute function public.revert_manual_order_payment_on_finance_delete();

-- 4) Permite ao front-end consultar o vínculo sem expor dados extras.
grant select, insert, update, delete on public.financial_transactions to authenticated;

-- Observação: os triggers são SECURITY DEFINER para manter a sincronização
-- consistente mesmo quando a ação original parte da tela administrativa.
