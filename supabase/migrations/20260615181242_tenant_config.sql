-- =====================================================================
-- Migration: per-tenant config (multi-vertical, config-ready)
-- Adds tenants.config jsonb: { ramo, dicionario, unidades }
-- Feeds normalize() (dicionario) and the extraction prompt context (ramo).
-- =====================================================================

alter table tenants
  add column if not exists config jsonb not null default '{}'::jsonb;

comment on column tenants.config is
  'Per-tenant config: { ramo: text, dicionario: {abrev->termo}, unidades: text[] }. Drives normalize() and the extraction prompt. See CLAUDE.md.';
