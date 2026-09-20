const base = new URL(process.env.XRAY_DEMO_URL ?? "http://127.0.0.1:3000");
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) {
  throw new Error("La preparación de demo debe ejecutarse contra el servidor local.");
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(path, base), {
    ...init,
    signal: AbortSignal.timeout(300_000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: ${data.error ?? response.status}`);
  return data as T;
}

const requested = new Set(process.argv.slice(2));
const { group_id, companies } = await json<{
  group_id: string;
  companies: { company_id: string; group_id: string }[];
}>("/api/xray/companies");
const selected = companies.filter((c) => requested.size
  ? requested.has(c.company_id)
  : c.group_id === group_id);
if (!selected.length || (requested.size && selected.length !== requested.size)) {
  throw new Error("No se han encontrado las empresas solicitadas.");
}
console.log(`Preparando marketplace real para ${selected.length} empresas (${group_id}).`);
let count = 0;
let failures = 0;
for (const company of selected) {
  const actions = await json<{ id: string; kind: string }[]>(
    `/api/xray/actions/${encodeURIComponent(company.company_id)}`,
  );
  for (const action of actions.filter((a) => a.kind !== "amortize")) {
    const start = performance.now();
    try {
      const result = await json<{ source: string; cached: boolean; persisted: boolean; matches: unknown[] }>(
        "/api/xray/recommend",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_id: company.company_id, action_id: action.id }),
        },
      );
      if (result.source !== "agent" || !result.persisted || !result.matches.length) {
        throw new Error("La recomendación del agente no ha quedado guardada en disco.");
      }
      count += 1;
      console.log(`${action.id}: ${result.cached ? "caché" : "generada y guardada"}, ${result.matches.length} ofertas, ${Math.round(performance.now() - start)} ms`);
    } catch (error) {
      failures += 1;
      console.error(`${action.id}: ${error instanceof Error ? error.message : "Error"}`);
    }
  }
}
console.log(`${count} recomendaciones listas; ${failures} fallos. Repetir este comando reutiliza las guardadas.`);
if (failures || !count) process.exitCode = 1;
export {};
