/**
 * normalize() — the SINGLE normalization contract.
 *
 * The exact same function must produce `texto_normalizado` on the WRITE path
 * (registrar_apelido) and on the READ path (match_produto). If the two diverge,
 * a saved alias will never match the lookup. See CLAUDE.md.
 *
 * Two deliberately separate responsibilities:
 *   (a) normalizeUniversal  — fixed, sector-agnostic text cleanup.
 *   (b) expandAbbreviations — sector-specific, driven by an INJECTED dictionary.
 *
 * The food terms (cx, fd, refri, ...) are NOT a default of this module — they
 * are an example seed for food-vertical tenants (see normalize.seeds.ts). Real
 * dictionaries come from `tenants.config.dicionario` at runtime.
 */

export type AbbreviationDictionary = Record<string, string>;

export interface NormalizeOptions {
  /** Per-tenant abbreviation/synonym map. Omitted/empty → only universal pass. */
  dictionary?: AbbreviationDictionary;
}

/**
 * Mirrors the SQL `f_unaccent(lower(...))`: lowercases and strips diacritics
 * via Unicode NFD decomposition (Latin/Portuguese parity with `unaccent`).
 */
function stripAccentsAndLower(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * Inserts a space at digit↔letter boundaries so quantities and units split
 * into separate tokens: "2l" → "2 l", "cx6" → "cx 6", "500ml" → "500 ml".
 */
function separateNumberUnit(input: string): string {
  return input
    .replace(/(\d)(\p{L})/gu, "$1 $2")
    .replace(/(\p{L})(\d)/gu, "$1 $2");
}

/** Collapses any run of whitespace to a single space and trims the ends. */
function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

/**
 * (a) UNIVERSAL, fixed normalization — no dictionary, no sector knowledge.
 * lowercase → strip accents → separate number/unit → collapse spaces → trim.
 */
export function normalizeUniversal(input: string): string {
  return collapseWhitespace(separateNumberUnit(stripAccentsAndLower(input)));
}

/**
 * (b) Abbreviation/synonym expansion driven by an INJECTED dictionary.
 * Replaces whole tokens only (token = run separated by spaces). Single pass:
 * dictionary VALUES must not themselves be keys, otherwise idempotence breaks.
 * Assumes `input` is already universally normalized (lowercased/unaccented).
 */
export function expandAbbreviations(
  input: string,
  dictionary: AbbreviationDictionary,
): string {
  if (!input) return input;
  if (Object.keys(dictionary).length === 0) return input;

  return input
    .split(" ")
    .map((token) => (token in dictionary ? dictionary[token] : token))
    .join(" ");
}

/**
 * The full contract: universal pass → dictionary expansion → final cleanup.
 * With no dictionary it degrades gracefully to `normalizeUniversal`.
 */
export function normalize(
  input: string,
  options: NormalizeOptions = {},
): string {
  const universal = normalizeUniversal(input);
  const expanded = expandAbbreviations(universal, options.dictionary ?? {});
  // Expansion can introduce multi-word values; re-clean for a stable result.
  return collapseWhitespace(expanded);
}
