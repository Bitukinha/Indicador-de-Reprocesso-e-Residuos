-- Execute este script no editor SQL do Neon (ou via psql/pgAdmin conectado
-- na DATABASE_URL do projeto) para criar a tabela usada pelo app.
-- O app também aplica os "alter table ... if not exists" abaixo sozinho na
-- primeira consulta, então bancos antigos são atualizados automaticamente.

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

-- categoria: 'reprocesso' | 'residuo'
-- movimento: reprocesso -> 'gerado' | 'reprocessado'
--            residuo    -> 'gerado' | 'carregado'
alter table public.registros add column if not exists categoria text not null default 'reprocesso';
alter table public.registros add column if not exists movimento text not null default 'gerado';
