import { z } from "zod";
import type { AbbreviationDictionary } from "./normalize";

/**
 * Minimal per-tenant configuration, stored in `tenants.config jsonb`.
 *
 * This is the "config-ready" seam that makes the engine multi-vertical WITHOUT
 * any sector-branched code. Intentionally tiny — the full configuration system
 * (UI, multi-vertical seeds, admin panel) is only built once a 2nd client in
 * another vertical exists. See CLAUDE.md.
 */
export const TenantConfigSchema = z.object({
  /** Vertical/industry, injected into the extraction prompt context. */
  ramo: z.string().optional(),
  /** Abbreviation/synonym map fed to normalize(). */
  dicionario: z.record(z.string(), z.string()).optional(),
  /** ERP units accepted for this tenant (e.g. ["UN", "CX", "FD"]). */
  unidades: z.array(z.string()).optional(),
});

export type TenantConfig = z.infer<typeof TenantConfigSchema>;

/** Safe-parses an unknown `tenants.config` value into a typed config. */
export function parseTenantConfig(raw: unknown): TenantConfig {
  return TenantConfigSchema.parse(raw ?? {});
}

/** Extracts the dictionary to hand to normalize(); empty map if unset. */
export function buildNormalizeDictionary(
  config: TenantConfig,
): AbbreviationDictionary {
  return config.dicionario ?? {};
}

/*
 * Runtime consumption (illustrative — the orchestrator is build order item 4):
 *
 *   const config = parseTenantConfig(tenant.config);
 *   // (1) normalize() reads the per-tenant dictionary:
 *   const key = normalize(item.texto_original, {
 *     dictionary: buildNormalizeDictionary(config),
 *   });
 *   // (2) the extraction prompt reads the vertical:
 *   //   `Ramo do cliente: ${config.ramo ?? "genérico"}` → injected into context.
 */
