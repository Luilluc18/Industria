/**
 * ERP adapter abstraction.
 *
 * ARCHITECTURE: the VERTICAL (food, auto parts, ...) is solved by tenant config;
 * the ERP (Protheus, SAP, Bling, ...) is solved by an ADAPTER. Never branch the
 * orchestrator per ERP — add a new implementation of this interface instead.
 */

// TODO(pedido-schema): replace with the real EnrichedOrder type from
// src/schemas/pedido.ts once it exists (build order item 2). Kept loose for now.
export type EnrichedOrder = unknown;

/** A ready-to-import artifact for the target ERP (spreadsheet / XML / etc.). */
export interface ErpImportFile {
  filename: string;
  contentType: string;
  /** Raw contents: string for CSV/XML, bytes for binary layouts. */
  content: string | Uint8Array;
}

export interface ErpAdapter {
  /** Stable identifier, e.g. "protheus". */
  readonly id: string;
  /** Builds the ERP-specific import file from an enriched order. */
  generateImportFile(order: EnrichedOrder): ErpImportFile;
}
