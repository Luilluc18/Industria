# Pedidos por WhatsApp → Protheus

> Contexto do projeto para o Claude Code. Leia antes de gerar qualquer código.

## O que é
Produto B2B que recebe pedidos de representantes/clientes por WhatsApp (texto,
foto, áudio, PDF) e devolve o pedido pronto pra entrar no ERP **TOTVS Protheus**,
sem digitação manual.

**Cliente ideal (ICP):** indústria ou distribuidora de pequeno/médio porte que
roda Protheus, tem força de vendas mandando pedido por canal informal e equipe
interna que hoje digita tudo no ERP na mão.

## Escopo do MVP
- **Dentro:** canais de entrada → extração IA → de-para de produto → validação →
  roteamento por confiança → revisão humana → **geração do arquivo de importação
  do Protheus** (planilha/XML no layout do cliente).
- **Fora (v2+):** integração nativa via API REST da TOTVS ou EAI; confirmação
  automática no WhatsApp.
- **Regra de ouro do MVP:** começa com revisão humana em 100% dos pedidos. O
  automático é liberado conforme a precisão do de-para sobe.

## Princípio de arquitetura (config-ready, não config-completo)
Um único motor genérico, adaptável por cliente via configuração — NUNCA código
ramificado por ramo (nada de `if (ramo === 'alimentos')`). O código nasce
preparado para receber config; o sistema de configuração COMPLETO (UI, seeds de
vários ramos, painel admin) só é construído quando existir um 2º cliente de outro
ramo. Até lá: config-ready, não config-completo.

Dois eixos de adaptação, deliberadamente separados:
- **Vertical** (alimentos, autopeças, ...) → resolvido por **config de tenant**
  (`tenants.config`: ramo, dicionário, unidades). Sem código por setor.
- **ERP** (Protheus, SAP, Bling, ...) → NÃO é config; é um **adaptador por ERP**
  (padrão adapter). Hoje: só a interface + a implementação Protheus.

## Decisões a travar ANTES de codar
1. **Modelo de embedding.** Define a dimensão da coluna `vector(N)` em `produtos`.
   Default atual no SQL: `1536` (compatível com text-embedding-3-small). Se for
   usar Voyage (provedor de embeddings recomendado pela Anthropic), **confirme a
   dimensão do modelo escolhido e ajuste `vector(N)`** — tem que bater exatamente.
2. **`normalize()` é um contrato único, dividido em duas responsabilidades.**
   (a) Normalização UNIVERSAL e fixa (lowercase, `f_unaccent`, colapsar espaços,
   trim, separar número/unidade) — não depende de setor.
   (b) Expansão de abreviações/sinônimos via DICIONÁRIO injetado por parâmetro
   (vem de `tenants.config.dicionario`), nunca embutido no código. Os termos de
   alimentos (cx, fd, refri...) são só um SEED de exemplo (`normalize.seeds.ts`),
   não o default. A MESMA `normalize()` roda na **escrita** (registrar_apelido) e
   na **leitura** (match_produto); se divergir, o apelido salvo nunca casa com a
   busca. Módulo compartilhado, com testes.

## Stack
- **Frontend/Backend:** Next.js 15 (App Router)
- **Banco:** Supabase / PostgreSQL + `pgvector` + `pg_trgm`
- **IA:** Claude (extração multimodal; desempate de candidatos no de-para)
- **Mensageria:** WhatsApp API oficial (Meta Cloud)
- **Processamento:** fila assíncrona (o webhook não pode travar esperando a IA)

## Pipeline
```
canais → recepção/pré-processo → extração IA → de-para → validação →
roteamento por confiança → revisão humana → arquivo Protheus → confirmação
```

## Modelo de dados
Ver migrations:
- `de_para_produtos.sql` — tabelas `tenants`, `compradores`, `produtos`,
  `apelidos` + extensões + função imutável `f_unaccent` + índices (trgm GIN,
  hnsw cosine) + RLS habilitado (políticas a definir conforme o auth).
- `match_produto.sql` — funções `match_produto` (leitura/cascata) e
  `registrar_apelido` (escrita do loop de aprendizado).
- `tenant_config.sql` — `tenants.config jsonb`: `{ ramo, dicionario, unidades }`.
  Alimenta `normalize()` (dicionario) e o contexto do prompt de extração (ramo).
  É o que torna o motor multi-vertical sem código por setor.

Tudo é **multi-tenant**: toda query filtra por `tenant_id` e respeita RLS.

## Contrato do pedido (JSON)
Dois estados. A IA produz o **bruto**; o de-para + validação produzem o
**enriquecido**. A IA NUNCA preenche SKU nem preço — só estrutura o que foi dito.

Bruto (saída da extração): `comprador`, `itens[]` (cada item com
`texto_original` cru, `produto_descricao`, `quantidade`, `unidade_informada`,
`observacao`), `observacoes_pedido`, `confianca_extracao`, `ambiguidades[]`.

Enriquecido (após de-para): cada item ganha `sku`, `descricao_erp`,
`unidade_erp`, `fator_conversao`, `preco_unitario`, `match_metodo`,
`match_confianca`, `candidatos[]`, `status_item`; o pedido ganha
`comprador_id`, `status_pedido`, `totais`.

> O prompt de extração e o schema completo devem ficar em `prompts/extracao.txt`
> e `src/schemas/pedido.ts` (tipos + Zod). Veja a ordem de construção abaixo.

## De-para (cascata)
Tenta do mais certo/barato ao mais fuzzy/caro e **para no 1º match confiável**:
1. **Código / GTIN exato** → confiança 1.0
2. **Apelido aprendido** (específico do comprador ganha do global) → 1.0
3. **Busca textual** (pg_trgm, sem acento) → score = similaridade
4. **Busca semântica** (embeddings, cosseno) → score = similaridade
5. **Desempate com IA** (Claude escolhe entre candidatos) — só quando os tiers
   3/4 retornam empate

Tiers 1-2 resolvem sozinhos. Tiers 3-4 só devolvem **candidatos**; quem decide
"auto vs revisão" é o orquestrador, pela régua de confiança. Toda correção na
revisão chama `registrar_apelido` → vira apelido aprendido (o loop que faz a
fila de revisão encolher com o uso).

## Régua de confiança → roteamento
- código/GTIN ou apelido exato → automático
- textual forte com candidato único dominante → automático
- semântico forte com folga sobre o 2º colocado → automático
- empate / score baixo → desempate IA, e se ainda incerto → revisão humana
- nada confiável → revisão humana
- (calibrar os cortes com pedidos reais; começar conservador)

## Ordem de construção
1. `normalize()` — (a) universal fixa + (b) expansão por dicionário INJETADO.
   Dicionário de alimentos só como SEED de exemplo (`normalize.seeds.ts`), nunca
   o default. Módulo compartilhado, com testes (incl. dicionário vazio = só
   universal). **[FEITO]**
2. Tipos TypeScript + Zod do contrato do pedido
3. Job que gera e popula os `embedding`s do catálogo (uma vez; cacheado)
4. Orquestrador: `extrair → normalizar → match_produto → rotear`
5. Tela de revisão humana (chama `registrar_apelido` ao confirmar/corrigir)
6. Gerador do arquivo de importação do Protheus (layout definido com o cliente)
7. Webhook do WhatsApp + fila assíncrona

## Adaptador de ERP (padrão adapter)
A geração do arquivo de importação é isolada atrás da interface `ErpAdapter`
(`src/lib/erp`). Vertical é config; ERP é adapter. Implementação atual: Protheus
(`ProtheusAdapter`). Outros ERPs (SAP, Bling) entram como novas implementações da
MESMA interface, registradas em `getErpAdapter` — nunca ifs no orquestrador.

## Camada de regras de validação (pluggável — FUTURA, não construir agora)
Regras de negócio (pedido mínimo, múltiplo de caixa, preço por cliente, regras
fiscais) NÃO viram ifs hardcoded nem cabem todas no jsonb de config. Serão uma
camada de regras pluggável: cada regra é uma unidade plugável que recebe o pedido
e devolve violações/ajustes. Apenas planejado; implementar quando necessário.

## RLS — TODO OBRIGATÓRIO antes do go-live
RLS está habilitado nas tabelas, mas SEM políticas → nega todo acesso. Em dev
operamos com a service-role key (ignora RLS), por isso funciona agora. ANTES de
qualquer go-live: criar as políticas de isolamento por `tenant_id` em `tenants`,
`compradores`, `produtos` e `apelidos`
(ex.: `using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)`).

## Convenções (não violar)
- A IA não inventa SKU; se em dúvida, sinaliza em `ambiguidades`.
- `texto_original` de cada item é guardado cru — é o combustível do aprendizado.
- Confiança baixa **nunca** vai direto pro ERP; vai pra revisão.
- Quantidade sempre convertida pra unidade do ERP via `fator_conversao`.
- Custo: tiers 1-3 são SQL puro; IA só no desempate (centavos por pedido).
