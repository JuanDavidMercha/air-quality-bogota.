import { Chart } from "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";

const els = {
  gif: document.getElementById("gif"),
  refreshGif: document.getElementById("refreshGif"),
  agg: document.getElementById("agg"),
  pollutant: document.getElementById("pollutant"),
  fromDate: document.getElementById("fromDate"),
  toDate: document.getElementById("toDate"),
  load: document.getElementById("load"),
  chart: document.getElementById("chart"),
  downloadLink: document.getElementById("downloadLink"),
  kpis: document.getElementById("kpis"),
};

let chart;

function bust(url) {
  const u = new URL(url, location.origin);
  u.searchParams.set("t", Date.now().toString());
  return u.toString();
}

els.refreshGif.onclick = () => (els.gif.src = bust("./gifs/latest.gif"));

async function fetchJSON(kind) {
  const url = kind === "daily" ? "./data/daily.json" : "./data/weekly.json";
  els.downloadLink.href = url;
  const res = await fetch(bust(url));
  if (!res.ok) throw new Error(`No se pudo cargar ${url}`);
  return res.json();
}

function dateISO(d) { return d.toISOString().slice(0, 10); }
function parseDate(s) { return new Date(s); }
const unique = (arr) => Array.from(new Set(arr));

function setupPollutants(df) {
  const pols = unique(df.map(r => r.pollutant)).sort();
  els.pollutant.innerHTML = "";
  for (const p of pols) {
    const opt = document.createElement("option");
    opt.value = p; opt.textContent = p;
    els.pollutant.appendChild(opt);
  }
  if (pols.includes("PM25")) els.pollutant.value = "PM25";
}

function setupDates(df, kind) {
  const col = kind === "daily" ? "date" : "week";
  const dates = df.map(r => r[col]).map(parseDate).filter(d => !isNaN(+d));
  if (!dates.length) return;
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  els.fromDate.value = dateISO(min);
  els.toDate.value = dateISO(max);
}

function filterData(df, kind, pollutant, fromStr, toStr) {
  const col = kind === "daily" ? "date" : "week";
  const from = fromStr ? new Date(fromStr) : null;
  const to   = toStr ? new Date(toStr)   : null;

  return df
    .filter(r => r.pollutant === pollutant)
    .filter(r => {
      const t = parseDate(r[col]);
      if (isNaN(+t)) return false;
      const okFrom = !from || t >= from;
      const okTo   = !to   || t <= to;
      return okFrom && okTo;
    })
    .map(r => ({
      t: parseDate(r[col]),
      mean: Number(r.mean),
      max: Number(r.max),
      min: Number(r.min),
      name: r.name
    }))
    .sort((a,b) => a.t - b.t);
}

function seriesByDateAvg(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = r.t.toISOString().slice(0,10);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r.mean);
  }
  const labels = Array.from(map.keys()).sort();
  const values = labels.map(k => {
    const arr = map.get(k).filter(x => !Number.isNaN(x));
    if (!arr.length) return null;
    return arr.reduce((a,b) => a+b, 0) / arr.length;
  });
  return { labels, values };
}

function renderKPIs(rows) {
  if (!rows.length) { els.kpis.innerHTML = ""; return; }
  const valid = rows.map(r => r.mean).filter(x => !Number.isNaN(x));
  const avg = valid.reduce((a,b)=>a+b,0) / valid.length;
  const mx  = Math.max(...valid);
  const mn  = Math.min(...valid);
  els.kpis.innerHTML = `
    <div class="kpi"><b>Observaciones</b><div>${valid.length}</div></div>
    <div class="kpi"><b>Promedio</b><div>${avg.toFixed(1)}</div></div>
    <div class="kpi"><b>Mínimo</b><div>${mn.toFixed(1)}</div></div>
    <div class="kpi"><b>Máximo</b><div>${mx.toFixed(1)}</div></div>
  `;
}

function drawChart(kind, pollutant, rows) {
  const { labels, values } = seriesByDateAvg(rows);
  if (chart) chart.destroy();
  chart = new Chart(els.chart.getContext("2d"), {
    type: "line",
    data: { labels, datasets: [{ label: `${pollutant} (${kind})`, data: values }] },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { title: { display: true, text: "Fecha" } },
        y: { title: { display: true, text: "Concentración (promedio estaciones)" } }
      }
    }
  });
}

async function bootstrap() {
  const kind = els.agg.value;
  const df = await fetchJSON(kind);
  setupPollutants(df);
  setupDates(df, kind);
}
bootstrap();

els.load.onclick = async () => {
  const kind = els.agg.value;
  const pollutant = els.pollutant.value;
  const df = await fetchJSON(kind);
  const rows = filterData(df, kind, pollutant, els.fromDate.value, els.toDate.value);
  renderKPIs(rows);
  drawChart(kind, pollutant, rows);
};

els.load.click();
