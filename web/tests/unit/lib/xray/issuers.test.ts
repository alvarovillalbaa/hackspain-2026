import { describe, expect, it } from "vitest";
import { DEFAULT_ISSUERS } from "@/lib/xray/issuers";
import { listEntities } from "@/lib/xray/catalog";

describe("DEFAULT_ISSUERS", () => {
  it("mirrors every catalog entity", () => {
    const entities = listEntities();
    expect(entities.length).toBeGreaterThan(0);
    for (const e of entities) {
      expect(DEFAULT_ISSUERS[e.id]?.name).toBe(e.name);
    }
    expect(Object.keys(DEFAULT_ISSUERS).sort()).toEqual(
      entities.map((e) => e.id).sort()
    );
  });

  it("includes known catalog entity ids", () => {
    expect(DEFAULT_ISSUERS.iss_bbva?.name).toBe("BBVA Empresas");
    expect(DEFAULT_ISSUERS.iss_santander?.name).toBe("Santander Empresas");
    expect(DEFAULT_ISSUERS.iss_sabadell?.name).toBe("Sabadell Empresas");
  });
});
