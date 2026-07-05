-- Execute este script no editor SQL do Neon (ou via psql/pgAdmin conectado
-- na DATABASE_URL do projeto) para criar a tabela usada pelo app.

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
