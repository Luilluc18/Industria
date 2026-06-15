import type { AbbreviationDictionary } from "./normalize";

/**
 * EXAMPLE SEED — food vertical only. NOT a default of normalize().
 *
 * Sample data to seed `tenants.config.dicionario` for a food-industry tenant.
 * The engine itself is sector-agnostic; never import this as a built-in
 * dictionary. A tenant in another vertical (e.g. auto parts) ships its own
 * dictionary via config.
 *
 * Keys are post-universal-normalization TOKENS (lowercased, unaccented, with
 * number/unit already split), so "2l" arrives here as the tokens "2" + "l".
 */
export const FOOD_SEED_DICTIONARY: AbbreviationDictionary = {
  cx: "caixa",
  fd: "fardo",
  dz: "duzia",
  refri: "refrigerante",
  l: "litro",
  ml: "mililitro",
  kg: "quilo",
  g: "grama",
  pct: "pacote",
  un: "unidade",
};
