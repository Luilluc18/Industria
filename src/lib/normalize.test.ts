import { describe, it, expect } from "vitest";
import {
  normalize,
  normalizeUniversal,
  expandAbbreviations,
  type AbbreviationDictionary,
} from "./normalize";
import { FOOD_SEED_DICTIONARY } from "./normalize.seeds";

describe("normalizeUniversal", () => {
  it("lowercases and strips accents (mirrors f_unaccent)", () => {
    expect(normalizeUniversal("Refrigerante AÇÚCAR Ção")).toBe(
      "refrigerante acucar cao",
    );
  });

  it("collapses whitespace and trims", () => {
    expect(normalizeUniversal("  refri   2   litros  ")).toBe("refri 2 litros");
  });

  it("separates number from unit (both directions)", () => {
    expect(normalizeUniversal("2l")).toBe("2 l");
    expect(normalizeUniversal("500ml")).toBe("500 ml");
    expect(normalizeUniversal("cx6")).toBe("cx 6");
  });

  it("is stable on already-clean input (idempotent)", () => {
    const once = normalizeUniversal("Coca 2L CX");
    expect(normalizeUniversal(once)).toBe(once);
  });
});

describe("expandAbbreviations", () => {
  const dict: AbbreviationDictionary = { cx: "caixa", l: "litro" };

  it("expands whole tokens from the injected dictionary", () => {
    expect(expandAbbreviations("2 l cx", dict)).toBe("2 litro caixa");
  });

  it("leaves unknown tokens untouched", () => {
    expect(expandAbbreviations("garrafa pet", dict)).toBe("garrafa pet");
  });

  it("does nothing with an empty dictionary", () => {
    expect(expandAbbreviations("2 l cx", {})).toBe("2 l cx");
  });
});

describe("normalize (full contract)", () => {
  it("runs universal + dictionary expansion", () => {
    expect(normalize("Refri 2L", { dictionary: FOOD_SEED_DICTIONARY })).toBe(
      "refrigerante 2 litro",
    );
  });

  it("works with an EMPTY/absent dictionary (universal only)", () => {
    expect(normalize("Refri 2L")).toBe("refri 2 l");
    expect(normalize("Refri 2L", { dictionary: {} })).toBe("refri 2 l");
  });

  it("is idempotent: normalize(normalize(x)) === normalize(x)", () => {
    const samples = ["Coca-Cola 2L CX", "FD de Refri", "  Açúcar  5KG  "];
    for (const s of samples) {
      const once = normalize(s, { dictionary: FOOD_SEED_DICTIONARY });
      expect(normalize(once, { dictionary: FOOD_SEED_DICTIONARY })).toBe(once);
    }
  });

  it("single contract: same output on write and read paths", () => {
    const dictionary = FOOD_SEED_DICTIONARY;
    const writeSide = normalize("CX de Refri 2L", { dictionary });
    const readSide = normalize("cx de refri 2l", { dictionary });
    expect(writeSide).toBe(readSide);
  });
});
