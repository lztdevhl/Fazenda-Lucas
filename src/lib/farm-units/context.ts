import type { FarmUnit } from "@/lib/farm-units/types";

export function selectedFarmUnitId(value: string | string[] | undefined, units: FarmUnit[]): string | null {
  if (typeof value !== "string" || value === "all") return null;
  return units.some((unit) => unit.id === value) ? value : null;
}

export function selectedFarmUnit(units: FarmUnit[], id: string | null): FarmUnit | null {
  return id ? units.find((unit) => unit.id === id) ?? null : null;
}
