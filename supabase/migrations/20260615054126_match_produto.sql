-- =====================================================================
-- Funções do de-para: match em cascata + registro de apelido
-- Depende de: de_para_produtos.sql (tabelas produtos, apelidos, f_unaccent)
-- =====================================================================

-- ---------------------------------------------------------------------
-- LEITURA: match_produto
-- Implementa a cascata. Para no primeiro tier determinístico (código /
-- apelido). Se não achar, devolve candidatos fuzzy (textual + semântico)
-- com método e score — quem decide "auto vs revisão" é a aplicação.
-- ---------------------------------------------------------------------
create or replace function match_produto(
  p_tenant_id         uuid,
  p_texto_normalizado text,
  p_comprador_id      uuid default null,
  p_embedding         vector(1536) default null,   -- AJUSTE p/ a dim do seu modelo
  p_codigo            text default null,            -- código/GTIN, se informado
  p_limite            int  default 5
)
returns table (
  produto_id uuid,
  sku        text,
  descricao  text,
  metodo     text,
  score      numeric
)
language plpgsql
stable
as $$
begin
  -- TIER 1: código/GTIN exato -> resolve e sai
  if p_codigo is not null then
    return query
      select pr.id, pr.sku, pr.descricao, 'codigo'::text, 1.0::numeric
      from produtos pr
      where pr.tenant_id = p_tenant_id and pr.ativo
        and (pr.sku = p_codigo or pr.gtin = p_codigo)
      limit 1;
    if found then return; end if;
  end if;

  -- TIER 2: apelido aprendido (específico do comprador ganha do global)
  return query
    select pr.id, pr.sku, pr.descricao, 'apelido'::text, 1.0::numeric
    from apelidos a
    join produtos pr on pr.id = a.produto_id
    where a.tenant_id = p_tenant_id
      and a.texto_normalizado = p_texto_normalizado
      and (a.comprador_id = p_comprador_id or a.comprador_id is null)
      and pr.ativo
    order by (a.comprador_id = p_comprador_id) desc nulls last,
             a.acertos desc
    limit 1;
  if found then return; end if;

  -- TIER 3 + 4: candidatos fuzzy p/ desempate (textual + semântico)
  return query
  with textual as (
    select pr.id, pr.sku, pr.descricao, 'textual'::text as metodo,
           similarity(f_unaccent(lower(pr.descricao)), p_texto_normalizado)::numeric as score
    from produtos pr
    where pr.tenant_id = p_tenant_id and pr.ativo
      and f_unaccent(lower(pr.descricao)) % p_texto_normalizado
  ),
  semantico as (
    select pr.id, pr.sku, pr.descricao, 'semantico'::text as metodo,
           (1 - (pr.embedding <=> p_embedding))::numeric as score
    from produtos pr
    where p_embedding is not null
      and pr.tenant_id = p_tenant_id and pr.ativo
      and pr.embedding is not null
    order by pr.embedding <=> p_embedding
    limit p_limite
  )
  select c.id, c.sku, c.descricao, c.metodo, c.score
  from (
    -- se o produto aparece nos dois, mantém o maior score
    select distinct on (u.id) u.id, u.sku, u.descricao, u.metodo, u.score
    from (select * from textual union all select * from semantico) u
    order by u.id, u.score desc
  ) c
  order by c.score desc
  limit p_limite;
end;
$$;

-- ---------------------------------------------------------------------
-- ESCRITA: registrar_apelido
-- O lado do loop de aprendizado. Chamado quando o humano confirma ou
-- corrige um item na revisão. Branch por causa dos dois índices parciais
-- (global x por comprador) -- um único ON CONFLICT não cobre os dois.
-- ---------------------------------------------------------------------
create or replace function registrar_apelido(
  p_tenant_id         uuid,
  p_comprador_id      uuid,    -- null = vale p/ todos os compradores do tenant
  p_texto_normalizado text,
  p_produto_id        uuid
)
returns void
language plpgsql
as $$
begin
  if p_comprador_id is null then
    insert into apelidos (tenant_id, comprador_id, texto_normalizado, produto_id)
    values (p_tenant_id, null, p_texto_normalizado, p_produto_id)
    on conflict (tenant_id, texto_normalizado) where comprador_id is null
    do update set produto_id    = excluded.produto_id,
                  acertos       = apelidos.acertos + 1,
                  atualizado_em = now();
  else
    insert into apelidos (tenant_id, comprador_id, texto_normalizado, produto_id)
    values (p_tenant_id, p_comprador_id, p_texto_normalizado, p_produto_id)
    on conflict (tenant_id, comprador_id, texto_normalizado) where comprador_id is not null
    do update set produto_id    = excluded.produto_id,
                  acertos       = apelidos.acertos + 1,
                  atualizado_em = now();
  end if;
end;
$$;
