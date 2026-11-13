-- DOPAMINA 3D | Auditoria administrativa
-- Execute uma vez no SQL Editor do Supabase.
-- Registra INSERT, UPDATE e DELETE nas tabelas públicas com coluna id.
-- Somente administradores podem consultar os registros.

create extension if not exists pgcrypto;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid null references public.profiles(id) on delete set null,
  actor_role text,
  table_name text not null,
  record_id text,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_fields text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);
create index if not exists audit_logs_table_record_idx
  on public.audit_logs (table_name, record_id);
create index if not exists audit_logs_actor_idx
  on public.audit_logs (actor_id);

alter table public.audit_logs enable row level security;

drop policy if exists "admin reads audit logs" on public.audit_logs;
create policy "admin reads audit logs"
  on public.audit_logs
  for select
  to authenticated
  using (public.is_admin());

revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

create or replace function public.capture_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $audit$
declare
  v_old jsonb;
  v_new jsonb;
  v_record_id text;
  v_fields text[];
  v_actor uuid;
  v_role text;
begin
  v_actor := auth.uid();

  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_record_id := coalesce(v_new->>'id', v_new->>'uuid');
    select role into v_role from public.profiles where id = v_actor;
    select coalesce(array_agg(field order by field), '{}')
      into v_fields from jsonb_object_keys(v_new) as keys(field);
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_record_id := coalesce(v_new->>'id', v_old->>'id', v_new->>'uuid');
    select role into v_role from public.profiles where id = v_actor;
    select coalesce(array_agg(k order by k), '{}')
      into v_fields
      from (
        select field as k from jsonb_object_keys(v_old) as old_keys(field)
        union
        select field as k from jsonb_object_keys(v_new) as new_keys(field)
      ) keys
     where v_old->k is distinct from v_new->k;
    if coalesce(array_length(v_fields,1),0) = 0 then
      return new;
    end if;
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_record_id := coalesce(v_old->>'id', v_old->>'uuid');
    select role into v_role from public.profiles where id = v_actor;
    select coalesce(array_agg(field order by field), '{}')
      into v_fields from jsonb_object_keys(v_old) as keys(field);
  end if;

  insert into public.audit_logs (
    actor_id, actor_role, table_name, record_id,
    operation, old_data, new_data, changed_fields
  ) values (
    v_actor, coalesce(v_role, case when v_actor is null then 'system' else 'unknown' end),
    tg_table_name, v_record_id, tg_op, v_old, v_new, coalesce(v_fields,'{}')
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$audit$;

revoke all on function public.capture_audit_log() from public, anon, authenticated;

-- Instala o gatilho em todas as tabelas públicas de negócio que possuem coluna id.
do $install$
declare
  t record;
begin
  for t in
    select c.table_schema, c.table_name
      from information_schema.columns c
      join information_schema.tables tb
        on tb.table_schema=c.table_schema and tb.table_name=c.table_name
     where c.table_schema='public'
       and c.column_name='id'
       and tb.table_type='BASE TABLE'
       and c.table_name <> 'audit_logs'
  loop
    execute format(
      'drop trigger if exists audit_capture_row on %I.%I',
      t.table_schema, t.table_name
    );
    execute format(
      'create trigger audit_capture_row after insert or update or delete on %I.%I for each row execute function public.capture_audit_log()',
      t.table_schema, t.table_name
    );
  end loop;
end;
$install$;

notify pgrst, 'reload schema';
