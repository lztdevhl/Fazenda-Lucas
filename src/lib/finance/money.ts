const DECIMAL = /^(-?)(\d{1,16})\.(\d{2})$/;

export function centsFromDecimal(value: string): bigint {
  const match = DECIMAL.exec(value);
  if (!match) throw new Error("Valor monetário inválido.");
  const cents = BigInt(match[2]) * 100n + BigInt(match[3]);
  return match[1] ? -cents : cents;
}

export function decimalFromCents(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  return `${negative ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

export function parseBRLInput(value: string): string {
  const cleaned = value.trim().replace(/^(-?)R\$\s*/, "$1").replace(/\s/g, "");
  if (!/^-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(cleaned)) {
    throw new Error("Informe um valor com duas casas decimais.");
  }
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  centsFromDecimal(normalized);
  return normalized;
}

export function formatBRL(value: string): string {
  const cents = centsFromDecimal(value);
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const integer = String(absolute / 100n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}R$ ${integer},${String(absolute % 100n).padStart(2, "0")}`;
}

export function maskBRLInput(value: string): string {
  const negative = value.trim().startsWith("-");
  const digits = value.replace(/\D/g, "").slice(0, 18);
  return formatBRL(decimalFromCents((negative ? -1n : 1n) * BigInt(digits || "0")));
}

export function sumMoney(values: string[]): string {
  return decimalFromCents(values.reduce((sum, value) => sum + centsFromDecimal(value), 0n));
}
