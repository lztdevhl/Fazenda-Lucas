import { describe, expect, it } from "vitest";
import { centsFromDecimal, decimalFromCents, formatBRL, parseBRLInput, sumMoney } from "./money";

describe("valores monetários", () => {
  it("preserva centavos em somas sem ponto flutuante", () => {
    expect(sumMoney(["0.10", "0.20", "999999999999.99"])).toBe("1000000000000.29");
    expect(centsFromDecimal("-1.01")).toBe(-101n);
    expect(decimalFromCents(123456n)).toBe("1234.56");
  });

  it("interpreta e formata valores brasileiros", () => {
    expect(parseBRLInput("R$ 1.234,56")).toBe("1234.56");
    expect(formatBRL("1234.56")).toBe("R$ 1.234,56");
    expect(formatBRL("-10.05")).toBe("-R$ 10,05");
    expect(() => parseBRLInput("1,2")).toThrow();
  });
});
