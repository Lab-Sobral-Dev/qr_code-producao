-- Execute no SQL Editor do Supabase para endurecer as permissoes.
-- Mantem a consulta publica dos QR Codes e bloqueia cadastro/edicao/exclusao anonimos.
-- Depois de aplicar, o app administrativo precisara usar login Supabase para gravar.

alter table public.alcool_registros enable row level security;

drop policy if exists "Permitir leitura publica" on public.alcool_registros;
drop policy if exists "Permitir cadastro publico" on public.alcool_registros;
drop policy if exists "Permitir edicao publica" on public.alcool_registros;
drop policy if exists "Permitir exclusao publica" on public.alcool_registros;

create policy "Permitir leitura publica"
on public.alcool_registros
for select
to anon, authenticated
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
