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
// ===========================
// MAPA DE BOGOTÁ CON LEAFLET
// ===========================

// 3.1 Límites de Bogotá (solo se ve Bogotá)
const BOG_BOUNDS = L.latLngBounds(
  // Suroeste (lat, lon), Noreste (lat, lon)
  [4.45, -74.25],
  [4.85, -73.95]
);

// 3.2 Inicializa el mapa dentro del <div id="map">
const map = L.map("map", {
  zoomControl: true,
  maxBounds: BOG_BOUNDS.pad(0.02),   // un poquito de margen
  maxBoundsViscosity: 1.0,           // “pared pegajosa” en los bordes
  minZoom: 11,
  maxZoom: 16,
  worldCopyJump: false
});
map.fitBounds(BOG_BOUNDS);

// 3.3 Capa base (OpenStreetMap) con atribución
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  detectRetina: true,
}).addTo(map);

// 3.4 Estaciones (usa exactamente los nombres de tu CSV de datos)
const STATIONS = [
  { name: "Usaquen",                 lat: 4.710350, lon: -74.030417 },
  { name: "Carvajal - Sevillana",   lat: 4.595617, lon: -74.148583 },
  { name: "Tunal",                   lat: 4.576225, lon: -74.130956 },
  { name: "Centro de Alto Rendimiento", lat: 4.658467, lon: -74.083967 },
  { name: "Las Ferias",             lat: 4.690700, lon: -74.082483 },
  { name: "Guaymaral",              lat: 4.783756, lon: -74.044183 },
  { name: "Kennedy",                 lat: 4.625050, lon: -74.161333 },
  { name: "Suba",                    lat: 4.761247, lon: -74.093461 },
  { name: "Puente Aranda",           lat: 4.631767, lon: -74.117483 },
  { name: "MinAmbiente",             lat: 4.625486, lon: -74.066981 },
  { name: "San Cristobal",           lat: 4.572553, lon: -74.083814 },
  { name: "Movil 7ma",               lat: 4.642431, lon: -74.083967 },
  { name: "Bolivia",                 lat: 4.735867, lon: -74.125883 },
  { name: "Fontibon",                lat: 4.678242, lon: -74.143819 },
  { name: "Usme",                    lat: 4.532000, lon: -74.116000 },
  { name: "Jazmin",                  lat: 4.608000, lon: -74.115000 },
  { name: "Ciudad Bolivar",          lat: 4.574000, lon: -74.166000 },
  { name: "Colina",                  lat: 4.736000, lon: -74.070000 },
  { name: "Movil Fontibon",          lat: 4.689000, lon: -74.148000 },
];

// 3.5 Helpers de colores por valor (igual que en tu GIF)
function colorForValue(val) {
  if (val == null || Number.isNaN(val)) return "#bdbdbd";
  if (val < 50)  return "#4caf50"; // verde
  if (val < 100) return "#f2c037"; // amarillo
  return "#e53935";                // rojo
}

// 3.6 Capa de marcadores (la mantenemos para actualizar colores)
let stationLayer = L.layerGroup().addTo(map);

// 3.7 Pinta marcadores (puede recibir un mapa {nombreEstacion: valor} para colorear)
function drawStations(valueByName = {}) {
  stationLayer.clearLayers();
  STATIONS.forEach(s => {
    const v = valueByName[s.name];                 // valor (por contaminante elegido)
    const marker = L.circleMarker([s.lat, s.lon], {
      radius: 9,
      color: "#333",
      weight: 1,
      fillColor: colorForValue(v),
      fillOpacity: 0.8
    });
    const valText = (v == null || Number.isNaN(v)) ? "sin dato" : v;
    marker.bindTooltip(`<b>${s.name}</b><br/>${valText}`);
    marker.addTo(stationLayer);
  });
}

// 3.8 Carga el snapshot más reciente y colorea según el contaminante seleccionado
async function loadLatestAndColor() {
  try {
    // Tu pipeline guarda este CSV con separador ';'
    const res = await fetch(`./data/Datos_Aire_latest.csv?ts=${Date.now()}`);
    if (!res.ok) { drawStations(); return; }
    const txt = await res.text();

    // Parseo MUY sencillo del CSV con ';'
    const lines = txt.trim().split(/\r?\n/);
    const headers = lines[0].split(";").map(h => h.trim());
    const rows = lines.slice(1).map(line => {
      const cols = line.split(";").map(c => c.trim());
      const obj = {};
      headers.forEach((h,i)=> obj[h] = cols[i]);
      return obj;
    });

    // contaminante elegido en tu UI existente
    const pol = document.getElementById("pollutant")?.value || "PM25";

    // Construye { name -> valorNum } para ese contaminante
    const mapVals = {};
    rows.forEach(r => {
      const name = r["name"];
      const raw  = r[pol];
      const num  = raw === undefined ? NaN : Number(String(raw).replace(",", "."));
      mapVals[name] = num;
    });

    drawStations(mapVals);
  } catch (e) {
    // si falla, dibuja sin colores
    drawStations();
  }
}

// 3.9 Inicializa y conecta con tu UI
drawStations();          // dibuja una vez (grises)
loadLatestAndColor();    // intenta colorear con último snapshot

// Cuando cambias de contaminante en tu selector, recolorea marcadores
const pollutantSel = document.getElementById("pollutant");
if (pollutantSel) {
  pollutantSel.addEventListener("change", () => {
    loadLatestAndColor();
  });
}

// Si ya tienes un botón "Cargar" que refresca el gráfico, aprovechamos para refrescar mapa
const loadBtn = document.getElementById("load");
if (loadBtn) {
  loadBtn.addEventListener("click", () => {
    loadLatestAndColor();
  });
}

