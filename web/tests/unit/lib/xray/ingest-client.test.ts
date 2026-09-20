import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import {
  ingestCanonicalTables,
  xrayApiUrl,
} from "@/lib/xray/ingest-client";
import type { Tables } from "@/lib/xray/facts-builder";

describe("xrayApiUrl", () => {
  const prev = process.env.XRAY_API_URL;
  afterEach(() => {
    if (prev === undefined) delete process.env.XRAY_API_URL;
    else process.env.XRAY_API_URL = prev;
  });

  it("defaults to localhost:8000", () => {
    delete process.env.XRAY_API_URL;
    expect(xrayApiUrl()).toBe("http://127.0.0.1:8000");
  });

  it("strips a trailing slash", () => {
    process.env.XRAY_API_URL = "https://xray.example.com/";
    expect(xrayApiUrl()).toBe("https://xray.example.com");
  });
});

describe("ingestCanonicalTables", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const tables = {
    companies: [
      {
        company_id: "COMP_T",
        group_id: "G1",
        country: "ES",
        currency: "EUR",
      },
    ],
    groups: [{ group_id: "G1" }],
    banking_products: [],
    debt_products: [],
    debt_schedule_config: [],
    transactions: [],
    invoices: [],
    balances: [],
  } as unknown as Tables;

  it("posts multipart and returns the JSON body", async () => {
    const payload = {
      companies: [],
      scores: [],
      summary: {},
      warnings: ["ok"],
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 })
    );
    const out = await ingestCanonicalTables({
      tables,
      target: {
        company_id: "COMP_T",
        group_id: "G1",
        name: "Test",
        country: "ES",
        currency: "EUR",
        n_companies_in_group: 1,
      },
    });
    expect(out.warnings).toEqual(["ok"]);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toMatch(/\/ingest$/);
    expect(init?.method ?? "POST").toBeTruthy();
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it("throws with status text when the API errors", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("boom", { status: 503 })
    );
    await expect(
      ingestCanonicalTables({
        tables,
        target: {
          company_id: "COMP_T",
          group_id: "G1",
          name: "Test",
          country: "ES",
          currency: "EUR",
          n_companies_in_group: 1,
        },
      })
    ).rejects.toThrow(/503/);
  });
});
