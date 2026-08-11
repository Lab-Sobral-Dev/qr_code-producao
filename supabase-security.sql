-- Execute no SQL Editor do Supabase para endurecer as permissoes.
-- Mantem consulta publica somente por id via RPC e bloqueia acesso anonimo direto a tabela.
-- Depois de aplicar, o app administrativo precisara usar login Supabase para listar e gravar.

alter table public.alcool_registros enable row level security;

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
