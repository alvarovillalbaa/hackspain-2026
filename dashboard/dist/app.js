const root = document.querySelector("#dashboard");
const state = { mode: "demo", catalog: [], snapshots: {}, payload: null, entityId: "", interval: "monthly", periods: 12, selectedIndex: -1, asOf: "" };
const labels = {
  cash_runway_days: "Cash runway", worst_deficit_cash_coverage: "Downside cash coverage", operating_cash_margin: "Operating cash margin",
  positive_cashflow_month_fraction: "Positive cash-flow months", recurring_obligation_coverage: "Recurring obligation coverage",
  overdue_receivables_ratio: "Overdue receivables", customer_collection_delay_days: "Customer collection delay",
  overdue_payables_ratio: "Overdue payables", supplier_payment_delay_change_days: "Supplier payment delay change",
  debt_service_coverage: "Debt-service coverage", interest_burden: "Interest burden",
  top3_collection_concentration: "Top-three customer concentration", downside_cashflow_volatility: "Downside cash-flow volatility",
  liquidity: "Liquidity", cash_generation: "Cash generation", payment_behaviour: "Payment behaviour", debt_capacity: "Debt capacity", resilience: "Resilience",
};
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const label = (value) => labels[value] || String(value || "").toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
const isoDate = (value) => new Date(value).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
const shortDate = (value) => new Date(value).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
const number = (value, digits = 1) => value == null || Number.isNaN(Number(value)) ? "—" : Number(value).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
const money = (value, currency = "EUR", compact = true) => value == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "EUR", notation: compact ? "compact" : "standard", maximumFractionDigits: compact ? 1 : 0 }).format(value);
const percent = (value, digits = 0) => value == null ? "—" : `${number(Number(value) * 100, digits)}%`;
const bandColor = (band) => ({ strong: "var(--strong)", stable: "var(--stable)", vulnerable: "var(--vulnerable)", critical: "var(--critical)" }[band] || "var(--accent)");

function rawValue(entry, point) {
  const unit = point.features?.[entry.key]?.unit;
  const value = entry.raw_value;
  if (value == null) return "Unavailable";
  if (unit === "fraction" || unit === "ratio") return percent(value, 1);
  if (unit === "days") return `${number(value, 1)} days`;
  if (unit === "multiple") return `${number(value, 2)}×`;
  return number(value, 2);
}
function reasonTone(score) { return score == null ? "" : score < 40 ? "negative" : score >= 65 ? "positive" : ""; }

function timelineSvg(history, forecast, selectedIndex) {
  const width = 900, height = 264, margin = { top: 18, right: 38, bottom: 38, left: 42 };
  const horizons = Object.keys(forecast.horizons || {}).map(Number).sort((a, b) => a - b);
  const points = history.map((item, index) => ({ type: "actual", index, date: item.as_of, score: item.score }));
  horizons.forEach((horizon) => {
    const raw = forecast.horizons[String(horizon)]?.score?.score;
    const calibrated = forecast.calibrated_medians?.[String(horizon)];
    points.push({ type: "forecast", horizon, date: forecast.horizons[String(horizon)]?.target_date, score: calibrated ?? raw });
  });
  const innerWidth = width - margin.left - margin.right, innerHeight = height - margin.top - margin.bottom;
  const x = (index) => margin.left + (points.length === 1 ? innerWidth / 2 : index * innerWidth / (points.length - 1));
  const y = (score) => margin.top + (100 - Number(score)) * innerHeight / 100;
  const bandRects = [[75,100,"#5ce1a2","strong"],[60,75,"#71b8ff","stable"],[40,60,"#f6bd55","vulnerable"],[0,40,"#ff6f78","critical"]]
    .map(([low, high, color, name]) => `<rect x="${margin.left}" y="${y(high)}" width="${innerWidth}" height="${y(low)-y(high)}" fill="${color}" opacity=".035"/><text x="${width-4}" y="${(y(high)+y(low))/2+4}" text-anchor="end">${name}</text>`).join("");
  const grid = [0,20,40,60,75,100].map((tick) => `<line class="gridline" x1="${margin.left}" x2="${width-margin.right}" y1="${y(tick)}" y2="${y(tick)}"/><text x="${margin.left-9}" y="${y(tick)+4}" text-anchor="end">${tick}</text>`).join("");
  const actual = points.filter((item) => item.type === "actual");
  const actualPath = actual.map((item, index) => `${index ? "L" : "M"}${x(index)},${y(item.score)}`).join(" ");
  const forecastStart = Math.max(0, actual.length - 1);
  const forecastPath = points.slice(forecastStart).map((item, index) => `${index ? "L" : "M"}${x(forecastStart+index)},${y(item.score)}`).join(" ");
  const actualDots = actual.map((item, index) => `<circle class="actual-point ${index === selectedIndex ? "selected" : ""}" data-history-index="${index}" tabindex="0" role="button" aria-label="Score ${number(item.score)} on ${isoDate(item.date)}" cx="${x(index)}" cy="${y(item.score)}" r="${index === selectedIndex ? 6 : 4.5}"/>`).join("");
  const forecastDots = points.slice(actual.length).map((item, offset) => {
    const index = actual.length + offset, interval = forecast.intervals?.[String(item.horizon)];
    const whisker = interval ? `<line x1="${x(index)}" x2="${x(index)}" y1="${y(interval[1])}" y2="${y(interval[0])}" stroke="#a5b8d0" opacity=".55"/><line x1="${x(index)-5}" x2="${x(index)+5}" y1="${y(interval[1])}" y2="${y(interval[1])}" stroke="#a5b8d0"/><line x1="${x(index)-5}" x2="${x(index)+5}" y1="${y(interval[0])}" y2="${y(interval[0])}" stroke="#a5b8d0"/>` : "";
    return `${whisker}<circle class="forecast-point" cx="${x(index)}" cy="${y(item.score)}" r="4"/><text x="${x(index)}" y="${y(item.score)-11}" text-anchor="middle">${number(item.score,0)}</text>`;
  }).join("");
  const dateLabels = points.map((item, index) => {
    const show = item.type === "forecast" || index === 0 || index === actual.length - 1 || index % Math.ceil(actual.length / 5) === 0;
    return show ? `<text x="${x(index)}" y="${height-12}" text-anchor="middle">${item.type === "forecast" ? `+${item.horizon}d` : shortDate(item.date)}</text>` : "";
  }).join("");
  return `<svg class="timeline-svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="timelineTitle timelineDesc"><title id="timelineTitle">Score history and forecast</title><desc id="timelineDesc">Historical scores followed by forecast scores and calibrated ranges.</desc>${bandRects}${grid}<path class="actual-line" d="${actualPath}"/><path class="forecast-line" d="${forecastPath}"/>${actualDots}${forecastDots}${dateLabels}</svg>`;
}

function cashSvg(weekly) {
  if (!weekly?.length) return `<div class="empty">No weekly forecast data.</div>`;
  const width = 430, height = 215, left = 14, right = 12, top = 15, bottom = 28, innerW = width-left-right, innerH = height-top-bottom;
  const values = weekly.flatMap((row) => [Number(row.net_cashflow || 0), Number(row.closing_balance || 0)]);
  const min = Math.min(0, ...values), max = Math.max(1, ...values), y = (value) => top + (max-value)*innerH/(max-min || 1), step = innerW/weekly.length, zero = y(0);
  const bars = weekly.map((row,index) => { const value = Number(row.net_cashflow || 0), barY = value >= 0 ? y(value) : zero; return `<rect class="${value >= 0 ? "net-positive" : "net-negative"}" x="${left+index*step+step*.18}" y="${barY}" width="${Math.max(2,step*.42)}" height="${Math.max(1,Math.abs(y(value)-zero))}" opacity=".72"/>`; }).join("");
  const balance = weekly.map((row,index) => `${index ? "L" : "M"}${left+index*step+step/2},${y(row.closing_balance)}`).join(" ");
  const ticks = [0,Math.floor(weekly.length/2),weekly.length-1].map((index) => `<text x="${left+index*step+step/2}" y="${height-9}" text-anchor="middle">${new Date(weekly[index].week_start).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</text>`).join("");
  return `<svg class="cash-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Weekly net cash flow bars and projected closing balance"><line class="zero" x1="${left}" x2="${width-right}" y1="${zero}" y2="${zero}"/><path class="balance-line" d="${balance}"/>${bars}${ticks}</svg>`;
}

function metricRows(point) {
  return (point.point_ledger || []).filter((entry) => !entry.key.endsWith("_missing_data_neutral") && !["display_rounding","score_boundary_adjustment"].includes(entry.key)).map((entry) => {
    const tone = reasonTone(entry.feature_score), contributionTone = entry.feature_score == null ? "" : entry.feature_score < 40 ? "low" : entry.feature_score >= 65 ? "high" : "";
    return `<tr><td><span class="metric-name">${esc(label(entry.key))}</span><span class="metric-component">${esc(label(entry.component))}</span></td><td class="mono">${esc(rawValue(entry,point))}</td><td class="mono">${entry.feature_score == null ? "—" : number(entry.feature_score,1)}</td><td><div class="reliability"><span class="mono">${percent(entry.reliability)}</span><span class="reliability-track"><span style="width:${Math.max(0,Math.min(100,entry.reliability*100))}%"></span></span></div></td><td class="contribution ${contributionTone} mono">${entry.contribution >= 0 ? "+" : ""}${number(entry.contribution,2)}</td><td><span class="reason ${tone}">${esc(label(entry.reason_code))}</span></td></tr>`;
  }).join("");
}

function render() {
  const payload = state.payload, history = payload.history || [];
  if (state.selectedIndex < 0 || state.selectedIndex >= history.length) state.selectedIndex = history.length - 1;
  const point = history[state.selectedIndex], previous = history[state.selectedIndex-1], delta = previous ? point.score-previous.score : 0;
  const entity = payload.entity, forecast = payload.forecast || {}, horizons = Object.keys(forecast.horizons || {}).map(Number).sort((a,b) => a-b), currency = entity.currency || "EUR";
  const components = Object.entries(point.component_scores || {}).map(([name,score]) => { const reliability = point.component_reliability?.[name] ?? 0; return `<div class="component-row"><span class="component-name">${esc(label(name))}</span><span class="component-value">${number(score,1)}</span><div class="bar"><span style="width:${score}%"></span><i style="left:${reliability*100}%" title="Reliability ${percent(reliability)}"></i></div><div class="component-note"><span>score</span><span>reliability ${percent(reliability)}</span></div></div>`; }).join("");
  const positive = point.top_positive_drivers || [], negative = point.top_negative_drivers || [], actions = payload.explanation?.actions || [];
  const forecastCards = horizons.map((horizon) => { const item = forecast.horizons[String(horizon)], calibrated = forecast.calibrated_medians?.[String(horizon)], score = calibrated ?? item.score.score, interval = forecast.intervals?.[String(horizon)], risk = forecast.threshold_probabilities?.[String(horizon)] || {}, riskBelow = risk.score_below_40 ?? risk.below_40 ?? null; return `<article class="forecast-card"><div class="forecast-horizon">${horizon} days</div><div class="forecast-score">${number(score,1)}</div><div class="forecast-range">${interval ? `${number(interval[0],1)}–${number(interval[1],1)} calibrated range` : "Point forecast"}</div><div class="forecast-risk"><strong>${percent(riskBelow)}</strong><br/>probability below 40</div><div class="forecast-risk"><strong>${money(item.projected_balance,currency)}</strong><br/>projected balance</div></article>`; }).join("");
  const weekly = forecast.weekly_ledger || [], lastWeekly = weekly.at(-1), minBalance = weekly.length ? Math.min(...weekly.map((row) => row.closing_balance)) : null;
  const selectedReconstructed = Number(point.audit?.backward_reconstructed_products || 0) > 0;
  const intervalOptions = state.mode === "live" ? [["weekly","Weekly"],["monthly","Monthly"],["quarterly","Quarterly"]] : [["monthly","Monthly snapshot"]];
  root.innerHTML = `<section class="toolbar" aria-label="Dashboard controls"><div class="control"><label for="entity-select">Company or group</label><div class="select-wrap"><select id="entity-select">${state.catalog.map((item) => `<option value="${esc(item.entity_id)}" ${item.entity_id === state.entityId ? "selected" : ""}>${esc(item.entity_id)} · ${esc(item.entity_type)}</option>`).join("")}</select></div></div><div class="control"><label for="interval-select">Score interval</label><div class="select-wrap"><select id="interval-select">${intervalOptions.map(([value,text]) => `<option value="${value}" ${value === state.interval ? "selected" : ""}>${text}</option>`).join("")}</select></div></div><div class="control"><label>Reporting date</label><div class="asof">${isoDate(payload.as_of)}</div></div><div class="method-chip">${state.mode === "live" ? "Live package data" : "Validated demo snapshot"}</div></section>
  <section class="grid">
  <article class="panel score-panel"><div class="entity-line"><div><p class="eyebrow">Selected period</p><h1 class="panel-title">${esc(entity.entity_id)}</h1></div><span class="entity-type">${esc(entity.entity_type)}</span></div><div class="score-ring" style="--score:${point.score};--score-color:${bandColor(point.band)}"><div class="score-value">${number(point.score,1)}</div><div class="score-outof">out of 100</div></div><div class="score-meta"><span class="pill band-${esc(point.band)}">${esc(label(point.band))}</span><span class="pill">Confidence ${esc(point.confidence)} · ${percent(point.confidence_score)}</span></div><p class="delta ${delta > 0 ? "up" : delta < 0 ? "down" : ""}">${previous ? `${delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} ${number(Math.abs(delta),1)} points vs previous interval` : "First available interval"}</p></article>
  <article class="panel timeline-panel"><div class="panel-head"><div><p class="eyebrow">Trajectory</p><h2 class="panel-title">Score history & calibrated outlook</h2></div><div class="muted micro mono">${history.length} observations · ${horizons.length} horizons</div></div><div class="timeline-wrap">${timelineSvg(history,forecast,state.selectedIndex)}</div><div class="legend"><span>Historical score</span><span class="forecast-key">Forecast median & range</span><span class="selected-key">Selected interval</span></div></article>
  <article class="panel components-panel"><div class="panel-head"><div><p class="eyebrow">Composition</p><h2 class="panel-title">Component scores</h2></div><span class="muted micro">white marker = reliability</span></div><div class="component-list">${components}</div></article>
  <article class="panel drivers-panel"><div class="panel-head"><div><p class="eyebrow">Explanation</p><h2 class="panel-title">Reasons behind ${number(point.score,1)}</h2></div><span class="muted micro">${isoDate(point.as_of)}</span></div><div class="drivers"><div class="driver-column"><h3 class="driver-heading">Support</h3>${positive.length ? positive.map((item) => `<div class="driver">${esc(label(item))}</div>`).join("") : `<div class="muted micro">No strong positive drivers.</div>`}</div><div class="driver-column"><h3 class="driver-heading">Pressure</h3>${negative.length ? negative.map((item) => `<div class="driver negative">${esc(label(item))}</div>`).join("") : `<div class="muted micro">No strong negative drivers.</div>`}</div></div>${state.selectedIndex === history.length-1 && actions.length ? `<div class="actions"><p class="driver-heading">Observable next steps</p>${actions.slice(0,3).map((action) => `<div class="action"><strong>${esc(action.action)}</strong><span>Target ${number(action.target_value,2)} · estimated +${number(action.estimated_point_gain,1)} score points</span></div>`).join("")}</div>` : ""}</article>
  <article class="panel forecast-summary"><div class="panel-head"><div><p class="eyebrow">Outlook</p><h2 class="panel-title">Forecast score</h2></div><span class="pill">${esc(forecast.calibration_status || "not fitted")}</span></div><div class="forecast-cards">${forecastCards}</div><p class="calibration-note">${String(forecast.calibration_status || "").startsWith("calibrated") ? "Ranges and threshold probabilities use the horizon-specific retrospective calibration artifact." : "No fitted calibration artifact was available; only deterministic point forecasts are shown."}</p></article>
  <article class="panel metrics-panel"><div class="panel-head"><div><p class="eyebrow">Point ledger</p><h2 class="panel-title">Underlying metrics</h2></div><div class="muted micro">Contributions reconcile to ${number(point.point_ledger_sum,2)}</div></div><div class="table-wrap"><table><thead><tr><th>Metric</th><th>Raw value</th><th>Feature score</th><th>Reliability</th><th>Contribution</th><th>Reason code</th></tr></thead><tbody>${metricRows(point)}</tbody></table></div></article>
  <article class="panel cash-panel"><div class="panel-head"><div><p class="eyebrow">Cash forecast</p><h2 class="panel-title">Weekly liquidity path</h2></div></div><div class="cash-content">${cashSvg(weekly)}<div class="cash-stats"><div class="cash-stat"><small>Ending balance</small><strong>${money(lastWeekly?.closing_balance,currency)}</strong></div><div class="cash-stat"><small>Lowest projected</small><strong>${money(minBalance,currency)}</strong></div></div></div></article>
  <div class="disclosure"><strong>How to read this view:</strong> the score is financial health, not probability of default. ${selectedReconstructed ? "This selected historical point uses a later balance anchor reconstructed backward at reduced reliability; transactions, invoices, and debt remain cut off at the displayed date." : "This selected point uses an observed balance anchor."} Confidence measures data coverage independently from the score. Forecast bands are score-level calibrated ranges, not uncertainty bands for each cash-flow primitive.</div></section>`;
  bindEvents();
}

function bindEvents() {
  document.querySelector("#entity-select")?.addEventListener("change", async (event) => { state.entityId = event.target.value; state.selectedIndex = -1; await loadPayload(); });
  document.querySelector("#interval-select")?.addEventListener("change", async (event) => { state.interval = event.target.value; state.selectedIndex = -1; await loadPayload(); });
  document.querySelectorAll("[data-history-index]").forEach((element) => { const select = () => { state.selectedIndex = Number(element.dataset.historyIndex); render(); }; element.addEventListener("click",select); element.addEventListener("keydown",(event) => { if (["Enter"," "].includes(event.key)) { event.preventDefault(); select(); } }); });
}
function loading(message = "Refreshing the score history…") { root.innerHTML = `<section class="loading-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-chart"></div><p>${esc(message)}</p></section>`; }
async function loadPayload() {
  loading();
  try {
    if (state.mode === "live") { const url = `/entities/${encodeURIComponent(state.entityId)}/dashboard?as_of=${encodeURIComponent(state.asOf)}&interval=${encodeURIComponent(state.interval)}&periods=${state.periods}`; const response = await fetch(url,{headers:{Accept:"application/json"}}); if (!response.ok) throw new Error(`Dashboard request failed (${response.status})`); state.payload = await response.json(); }
    else { state.payload = state.snapshots[state.entityId]; if (!state.payload) throw new Error("No demo snapshot exists for that entity"); }
    state.selectedIndex = state.payload.history.length-1; render();
  } catch (error) { showError(error); }
}
function showError(error) { root.innerHTML = `<section class="error-card"><p class="eyebrow">Unable to load results</p><h1>Dashboard data is unavailable</h1><p>${esc(error.message || error)}</p><p>Start the X-Ray API with its normalized data cache, then reload this page.</p></section>`; }
async function init() {
  try { const response = await fetch("/entities",{headers:{Accept:"application/json"}}); if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) throw new Error("No live API"); const catalog = await response.json(); state.mode = "live"; state.catalog = catalog.entities; state.asOf = catalog.as_of; }
  catch { const response = await fetch("./data/snapshot.json"); if (!response.ok) return showError(new Error("The packaged dashboard snapshot could not be loaded")); const snapshot = await response.json(); state.mode = "demo"; state.catalog = snapshot.entities; state.snapshots = snapshot.payloads; state.asOf = snapshot.as_of; }
  state.entityId = state.catalog.some((item) => item.entity_id === "COMP_0001") ? "COMP_0001" : state.catalog[0]?.entity_id;
  if (!state.entityId) return showError(new Error("No companies were found"));
  await loadPayload();
  registerWebMcp();
}
function registerWebMcp() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const allowedIntervals = new Set(state.mode === "live" ? ["weekly","monthly","quarterly"] : ["monthly"]);
  Promise.resolve(context.registerTool({
    name: "inspect_company_score",
    title: "Inspect company score",
    description: "Open an entity's X-Ray score history at a regular interval and optionally select one historical observation.",
    inputSchema: { type: "object", properties: { entity_id: { type: "string" }, interval: { type: "string", enum: [...allowedIntervals] }, history_index: { type: "integer", minimum: 0 } }, required: ["entity_id"], additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    async execute(input) {
      if (!state.catalog.some((item) => item.entity_id === input.entity_id)) throw new Error("Unknown entity_id");
      if (input.interval && !allowedIntervals.has(input.interval)) throw new Error("Unsupported interval");
      state.entityId = input.entity_id;
      state.interval = input.interval || state.interval;
      await loadPayload();
      if (input.history_index != null) {
        if (input.history_index >= state.payload.history.length) throw new Error("history_index is outside the available history");
        state.selectedIndex = input.history_index;
        render();
      }
      const point = state.payload.history[state.selectedIndex];
      return { entity_id: state.entityId, interval: state.interval, as_of: point.as_of, score: point.score, band: point.band, confidence: point.confidence };
    },
  })).catch(() => {});
}
init();
