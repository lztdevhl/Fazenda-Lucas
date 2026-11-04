import { describe, expect, it } from "vitest";
import { selectedFarmUnit, selectedFarmUnitId } from "./context";
import type { FarmUnit } from "./types";

const units: FarmUnit[] = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Núcleo 01", code: "N01", description: null, is_active: true, created_at: "2026-01-01T00:00:00Z" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Núcleo antigo", code: null, description: null, is_active: false, created_at: "2026-01-01T00:00:00Z" },
];

describe("farm unit context", () => {
  it("resolves all, valid and invalid selections", () => {
    expect(selectedFarmUnitId(undefined, units)).toBeNull();
    expect(selectedFarmUnitId("all", units)).toBeNull();
    expect(selectedFarmUnitId(units[0].id, units)).toBe(units[0].id);
    expect(selectedFarmUnitId("not-a-unit", units)).toBeNull();
  });

  it("finds inactive units for historical views", () => {
    expect(selectedFarmUnit(units, units[1].id)?.is_active).toBe(false);
  });
});
