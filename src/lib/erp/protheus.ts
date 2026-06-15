import type { ErpAdapter, ErpImportFile, EnrichedOrder } from "./types";

/**
 * Protheus (TOTVS) adapter — the only ERP implementation for the MVP.
 *
 * The concrete import layout (spreadsheet / XML) is defined WITH the client
 * (build order item 6), so this is a conforming skeleton: the seam is in place;
 * the format is filled in once the client's layout is known.
 */
export class ProtheusAdapter implements ErpAdapter {
  readonly id = "protheus";

  generateImportFile(order: EnrichedOrder): ErpImportFile {
    void order; // TODO(item-6): implement the agreed Protheus import layout.
    throw new Error(
      "ProtheusAdapter.generateImportFile not implemented yet (build order item 6).",
    );
  }
}
