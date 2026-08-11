-- Execute no SQL Editor do Supabase para endurecer as permissoes.
-- Mantem consulta publica somente por id via RPC e bloqueia acesso anonimo direto a tabela.
-- Depois de aplicar, o app administrativo precisara usar login Supabase para listar e gravar.
-- Tambem cria historico de auditoria com usuario, data/hora e valores alterados.

alter table public.alcool_registros enable row level security;

revoke all on public.alcool_registros from anon;
grant select, insert, update, delete on public.alcool_registros to authenticated;

drop policy if exists "Permitir leitura publica" on public.alcool_registros;
drop policy if exists "Permitir leitura autenticada" on public.alcool_registros;
drop policy if exists "Permitir cadastro publico" on public.alcool_registros;
drop policy if exists "Permitir edicao publica" on public.alcool_registros;
drop policy if exists "Permitir exclusao publica" on public.alcool_registros;

create or replace function public.consultar_alcool_registro(registro_id uuid)
returns table (
  id uuid,
  tag text,
  endereco text,
  validade date,
  responsavel text,
  observacoes text,
  criado_em timestamptz,
  atualizado_em timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    r.id,
    r.tag,
    r.endereco,
    r.validade,
    r.responsavel,
    r.observacoes,
    r.criado_em,
    r.atualizado_em
  from public.alcool_registros r
  where r.id = registro_id
  limit 1;
$$;

revoke all on function public.consultar_alcool_registro(uuid) from public;
grant execute on function public.consultar_alcool_registro(uuid) to anon, authenticated;

create table if not exists public.alcool_registros_historico (
  id uuid primary key default gen_random_uuid(),
  registro_id uuid,
  acao text not null check (acao in ('INSERT', 'UPDATE', 'DELETE')),
  tag text,
  usuario_id uuid,
  usuario_email text,
  valor_antigo jsonb,
  valor_novo jsonb,
  alterado_em timestamptz not null default now()
);

alter table public.alcool_registros_historico enable row level security;

drop policy if exists "Permitir leitura autenticada historico" on public.alcool_registros_historico;

create policy "Permitir leitura autenticada historico"
on public.alcool_registros_historico
for select
to authenticated
using (true);

revoke insert, update, delete on public.alcool_registros_historico from anon, authenticated;
grant select on public.alcool_registros_historico to authenticated;

create or replace function public.registrar_historico_alcool_registros()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.alcool_registros_historico (
    registro_id,
    acao,
    tag,
    usuario_id,
    usuario_email,
    valor_antigo,
    valor_novo
  )
  values (
    case when tg_op = 'DELETE' then old.id else new.id end,
    tg_op,
    case when tg_op = 'DELETE' then old.tag else new.tag end,
    auth.uid(),
    auth.jwt() ->> 'email',
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists alcool_registros_auditoria on public.alcool_registros;

create trigger alcool_registros_auditoria
after insert or update or delete on public.alcool_registros
for each row execute function public.registrar_historico_alcool_registros();

create policy "Permitir leitura autenticada"
on public.alcool_registros
for select
to authenticated
using (true);

create policy "Permitir cadastro autenticado"
on public.alcool_registros
for insert
to authenticated
with check (true);

create policy "Permitir edicao autenticada"
on public.alcool_registros
for update
to authenticated
using (true)
with check (true);

create policy "Permitir exclusao autenticada"
on public.alcool_registros
for delete
to authenticated
using (true);
