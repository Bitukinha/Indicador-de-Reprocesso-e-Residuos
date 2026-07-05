-- Execute este script no SQL Editor do Supabase (https://supabase.com/dashboard/project/_/sql)
-- Cria a tabela usada pelo app para registrar reprocesso e resíduos.

create table if not exists public.registros (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  turno text not null,
  hora text not null,
  produto text not null,
  peso numeric not null default 0,
  local text not null,
  linha text not null,
  observacoes text not null default '',
  created_at timestamptz not null default now()
);

alter table public.registros enable row level security;

-- App público sem autenticação: libera leitura/escrita para a chave anônima (publishable key).
create policy if not exists "registros_select_anon"
  on public.registros for select
  to anon
  using (true);

create policy if not exists "registros_insert_anon"
  on public.registros for insert
  to anon
  with check (true);

create policy if not exists "registros_delete_anon"
  on public.registros for delete
  to anon
  using (true);
