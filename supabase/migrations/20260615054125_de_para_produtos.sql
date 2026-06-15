-- =====================================================================
-- Migration: de-para de produtos (catálogo + apelidos aprendidos)
-- Stack: Supabase / PostgreSQL
-- =====================================================================

-- 1. Extensões -------------------------------------------------------
create extension if not exists vector;     -- embeddings (pgvector)
create extension if not exists pg_trgm;    -- busca textual fuzzy
create extension if not exists unaccent;   -- remover acentos

-- 2. unaccent IMUTÁVEL (necessário p/ índice de expressão) -----------
-- unaccent() nativo é STABLE; índice de expressão exige IMMUTABLE.
-- No Supabase as extensões vivem no schema "extensions", por isso o
-- set search_path. Este é o padrão consagrado p/ usar unaccent em índice.
create or replace function f_unaccent(text)
  returns text
  language sql
  immutable
  parallel safe
  strict
  set search_path = extensions, public
as $$ select unaccent($1) $$;

-- 3. Tenants (uma indústria por tenant) ------------------------------
create table tenants (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  created_at  timestamptz not null default now()
);

-- 4. Compradores (clientes da indústria) -----------------------------
create table compradores (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  nome        text not null,
  cnpj        text,
  telefone    text,
  created_at  timestamptz not null default now(),
  unique (tenant_id, cnpj)
);

-- 5. Catálogo de produtos (o que existe no Protheus) -----------------
create table produtos (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  sku              text not null,              -- código do produto no ERP
  descricao        text not null,              -- descrição oficial
  unidade          text not null default 'UN', -- unidade do ERP (UN, CX, FD)
  fator_conversao  numeric not null default 1, -- ex: 1 CX = 6 UN -> 6
  gtin             text,                        -- código de barras
  embedding        vector(1536),                -- AJUSTE p/ a dim do seu modelo
                                                -- (1536 = OpenAI; voyage usa outras)
  ativo            boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (tenant_id, sku)
);

-- índice fuzzy na descrição (sem acento, minúscula)
create index produtos_descricao_trgm
  on produtos using gin (f_unaccent(lower(descricao)) gin_trgm_ops);

-- match exato por código de barras
create index produtos_gtin_idx on produtos (tenant_id, gtin);

-- índice semântico (cosseno) p/ busca por embedding
create index produtos_embedding_hnsw
  on produtos using hnsw (embedding vector_cosine_ops);

-- 6. Apelidos aprendidos (a memória do de-para) ----------------------
create table apelidos (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  comprador_id      uuid references compradores(id) on delete cascade, -- null = vale p/ todos
  texto_normalizado text not null,             -- já passou pela normalização
  produto_id        uuid not null references produtos(id) on delete cascade,
  acertos           integer not null default 1,
  atualizado_em     timestamptz not null default now()
);

-- 1 apelido por comprador (NULL é distinto no Postgres, daí os 2 índices)
create unique index apelidos_por_comprador
  on apelidos (tenant_id, comprador_id, texto_normalizado)
  where comprador_id is not null;

-- 1 apelido global por tenant
create unique index apelidos_global
  on apelidos (tenant_id, texto_normalizado)
  where comprador_id is null;

-- lookup rápido no momento do match
create index apelidos_lookup
  on apelidos (tenant_id, texto_normalizado);

-- 7. RLS (isola cada tenant) -----------------------------------------
-- ATENÇÃO: habilitar RLS sem política bloqueia TUDO. Defina as políticas
-- conforme seu auth (ex.: claim tenant_id no JWT) antes de subir.
alter table tenants     enable row level security;
alter table compradores enable row level security;
alter table produtos    enable row level security;
alter table apelidos    enable row level security;

-- exemplo p/ produtos (replicar nas demais tabelas):
-- create policy tenant_isolation on produtos
--   using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
