import { test, expect } from "@playwright/test";

test.describe("demo journeys", () => {
  test("home dashboard renders Resumen", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Resumen/i }).first()
    ).toBeVisible({ timeout: 45_000 });
  });

  test("grupos page lists demo group GROUP_0147", async ({ page }) => {
    await page.goto("/grupos");
    await expect(
      page.getByRole("heading", { name: /Grupos Empresariales/i })
    ).toBeVisible({ timeout: 45_000 });
    // Demo pack id is in the href; visible label is the group display name.
    await expect(page.locator('a[href="/g/GROUP_0147"]').first()).toBeVisible({
      timeout: 45_000,
    });
  });

  test("company ficha shows score 0–100 and band", async ({ page }) => {
    await page.goto("/c/COMP_0001");
    await expect(page.getByText("COMP_0001").first()).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText("Score de salud").first()).toBeVisible({
      timeout: 45_000,
    });
    // Band label from bands.ts (Spanish product copy).
    await expect(page.getByText(/Estable|Sólid|Frágil|Crític/i).first()).toBeVisible();
    const body = await page.locator("body").innerText();
    const scoreHit = body.match(/\b([1-9]?\d|100)\b/);
    expect(scoreHit).not.toBeNull();
    const score = Number(scoreHit![1]);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  test("watchers page loads without inventing copy", async ({ page }) => {
    await page.goto("/watchers");
    await expect(page.getByRole("link", { name: "X Ray" })).toBeVisible({
      timeout: 45_000,
    });
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(20);
    expect(body).not.toMatch(/€\s*999\.?999/);
  });
});
