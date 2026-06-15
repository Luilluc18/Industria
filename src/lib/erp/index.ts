import type { ErpAdapter } from "./types";
import { ProtheusAdapter } from "./protheus";

export type { ErpAdapter, ErpImportFile, EnrichedOrder } from "./types";
export { ProtheusAdapter } from "./protheus";

const adapters: Record<string, () => ErpAdapter> = {
  protheus: () => new ProtheusAdapter(),
};

/**
 * Resolves the ERP adapter by id. Adding SAP/Bling later = register a new
 * factory here; the orchestrator stays untouched.
 */
export function getErpAdapter(id: string): ErpAdapter {
  const factory = adapters[id];
  if (!factory) {
    throw new Error(`No ERP adapter registered for "${id}".`);
  }
  return factory();
}
