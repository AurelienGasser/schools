import { writeFileSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "node:child_process";
import type { SchoolsResponse } from "./types.js";
import schoolsJson from "../data/schools.json" with { type: "json" };
import zipCodesJson from "../data/zip-codes.json" with { type: "json" };

import {
  commuteRange,
  getCommuteString,
  commuteRingZones,
  COMMUTE_ZONE_COLORS,
  commuteZonesSorted,
} from "./map/commute.js";

const schools = schoolsJson as unknown as SchoolsResponse;

const COLORS: Record<string, string> = {
  "PUBLIC SCHOOL (IMF)": "#2563eb",
  "CHARTER SCHOOLS (IMF)": "#7c3aed",
  "NON PUBLIC SCHOOL (IMF)": "#94a3b8",
  "OTHER- NON IMF": "#94a3b8",
};

const DEFAULT_COLOR = "#94a3b8";

const features = schools.features.filter(
  (f) => f.geometry?.x != null && f.geometry?.y != null,
);

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../docs");

const elementaryZonesJson = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      "../data/School_Zones_2024-2025_(Elementary_School)_20260830.geojson",
    ),
    "utf-8",
  ),
);
const middleZonesJson = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      "../data/School_Zones_2024-2025_(Middle_School)_20260830.geojson",
    ),
    "utf-8",
  ),
);

function schoolTypeFromSqr(
  sqr: Record<string, string> | undefined,
  name: string,
): "elementary" | "middle" | "k8" | "unknown" {
  const t = (sqr?.["School Type"] ?? "").trim();
  if (t === "Elementary") return "elementary";
  if (t === "Middle") return "middle";
  if (t === "K-8") return "k8";
  const n = name.toLowerCase();
  if (/\bm\.?s\.?\b|\bi\.?s\.?\b|\bj\.?h\.?s\.?\b/.test(n)) return "middle";
  if (/\belementary\b/.test(n)) return "elementary";
  return "unknown";
}

const points = features
  .map((f) => ({
    lng: f.geometry.x,
    lat: f.geometry.y,
    color: COLORS[f.attributes.RECORD_TYPE_DESC] ?? DEFAULT_COLOR,
    name: f.attributes.LEGAL_NAME,
    type: f.attributes.RECORD_TYPE_DESC,
    city: f.attributes.PHYSCITY,
    address: f.attributes.PHYSADDRLINE1,
    commuteRange: commuteRange(f.geometry.x, f.geometry.y),
    schoolType: schoolTypeFromSqr(
      f.attributes.sqr,
      f.attributes.LEGAL_NAME ?? "",
    ),
    sqr: f.attributes.sqr,
    dbn: f.attributes.DBN ?? f.attributes.sqr?.DBN,
  }))
  .filter((s) => !s.commuteRange.min || s.commuteRange.min != 60)
  .map((s) => ({ ...s, commute: getCommuteString(s.commuteRange) }));

const legend = Object.entries(COLORS)
  .map(
    ([label, color]) =>
      `<div class="legend-item"><span class="dot" style="background:${color}"></span>${label}</div>`,
  )
  .join("\n");

const commuteLegend = commuteZonesSorted
  .map((z, i) => {
    const label =
      i === 0
        ? `< ${z.minutes} min`
        : `${commuteZonesSorted[i - 1].minutes}–${z.minutes} min`;
    return `<div class="legend-item"><span class="dot" style="background:${COMMUTE_ZONE_COLORS[i]}"></span>${label}</div>`;
  })
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NY Schools Map</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/OverlappingMarkerSpiderfier-Leaflet/0.2.6/oms.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { height: 100%; width: 100%; }
    #legend {
      position: absolute;
      bottom: 32px;
      right: 12px;
      z-index: 1000;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      font-family: sans-serif;
      font-size: 13px;
      overflow: hidden;
      max-width: calc(100vw - 24px);
    }
    #legend-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      cursor: pointer;
      user-select: none;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .05em;
      color: #555;
    }
    #legend-header:hover { background: #f5f5f5; }
    #legend-toggle { font-size: 10px; transition: transform .2s; }
    #legend.collapsed #legend-toggle { transform: rotate(-90deg); }
    #legend-body { padding: 4px 14px 14px; border-top: 1px solid #eee; }
    #legend.collapsed #legend-body { display: none; }
    #legend h4 { margin-top: 10px; margin-bottom: 6px; font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: .05em; }
    .legend-item { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
    .dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
    #panel {
      position: absolute;
      top: 12px;
      left: 12px;
      z-index: 1000;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      font-family: sans-serif;
      font-size: 13px;
      min-width: 200px;
      max-width: calc(100vw - 24px);
      overflow: hidden;
    }
    #panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      cursor: pointer;
      user-select: none;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .05em;
      color: #555;
    }
    #panel-header:hover { background: #f5f5f5; }
    #panel-toggle { font-size: 10px; transition: transform .2s; }
    #panel.collapsed #panel-toggle { transform: rotate(-90deg); }
    #panel-body { padding: 10px 14px 14px; border-top: 1px solid #eee; }
    #panel.collapsed #panel-body { display: none; }
    .control-row { display: flex; flex-direction: column; gap: 6px; }
    .control-label { display: flex; justify-content: space-between; color: #444; }
    input[type=range] { width: 100%; accent-color: #3b82f6; }
    .toggle-row { display: flex; align-items: center; gap: 8px; color: #444; cursor: pointer; }
    .toggle-row input[type=checkbox] { accent-color: #3b82f6; width: 14px; height: 14px; cursor: pointer; }
    .radio-row { display: flex; align-items: center; gap: 8px; color: #444; cursor: pointer; }
    .radio-row input[type=radio] { accent-color: #3b82f6; width: 14px; height: 14px; cursor: pointer; }
    .control-section-label { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #888; margin-top: 10px; margin-bottom: 4px; }
    #search-box {
      position: absolute;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      display: flex;
      background: white;
      border-radius: 6px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
      overflow: hidden;
      width: 280px;
    }
    #search-input {
      flex: 1;
      border: none;
      outline: none;
      padding: 8px 10px;
      font-size: 13px;
      font-family: sans-serif;
      min-width: 0;
    }
    #search-btn {
      border: none;
      background: #2563eb;
      color: white;
      padding: 0 12px;
      cursor: pointer;
      font-size: 15px;
      flex-shrink: 0;
    }
    #search-btn:hover { background: #1d4ed8; }
@media (max-width: 640px) {
      #search-box { width: calc(100vw - 24px); top: 8px; }
    }
    @media (max-width: 640px) {
      #panel, #legend { font-size: 16px; }
      #panel { min-width: 220px; }
      #panel-header, #legend-header { padding: 14px 16px; font-size: 14px; }
      #panel-body { padding: 14px 16px 18px; }
      #legend-body { padding: 6px 16px 18px; }
      #legend h4 { font-size: 13px; margin-top: 14px; margin-bottom: 8px; }
      .legend-item { gap: 10px; margin-bottom: 8px; }
      .dot { width: 16px; height: 16px; }
      .toggle-row, .radio-row { padding: 5px 0; gap: 12px; }
      .toggle-row input[type=checkbox], .radio-row input[type=radio] { width: 20px; height: 20px; }
      .control-section-label { font-size: 13px; margin-top: 14px; }
      .leaflet-popup-content-wrapper { font-size: 15px !important; }
      .leaflet-popup-content { font-size: 15px !important; }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="search-box">
    <input id="search-input" type="text" autocomplete="off" spellcheck="false" />
    <button id="search-btn">&#x2192;</button>
  </div>
  <div id="panel">
    <div id="panel-header">
      Controls <span id="panel-toggle">▼</span>
    </div>
    <div id="panel-body">
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">
        <label class="radio-row"><input type="radio" name="overlay" value="zipcodes" checked />Real estate price</label>
        <label class="radio-row"><input type="radio" name="overlay" value="zones" />Commute zones</label>
        <label class="radio-row"><input type="radio" name="overlay" value="none" />None</label>
      </div>
      <div class="control-section-label">Academics (ELA &amp; Math)</div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <label class="radio-row"><input type="radio" name="academic-filter" value="any" />Any</label>
        <label class="radio-row"><input type="radio" name="academic-filter" value="Fair" />Fair+</label>
        <label class="radio-row"><input type="radio" name="academic-filter" value="Good" checked />Good+</label>
        <label class="radio-row"><input type="radio" name="academic-filter" value="Excellent" />Excellent only</label>
      </div>
      <label class="toggle-row" style="margin-top:6px"><input type="checkbox" id="hide-no-academic-data" checked />Hide if no data</label>
      <div class="control-section-label">Commute</div>
      <div style="display:flex;flex-direction:column;gap:6px;">
      <label class="radio-row"><input type="radio" name="commute-filter" value="30" />≤ 30 min</label>
      <label class="radio-row"><input type="radio" name="commute-filter" value="40" checked />≤ 40 min</label>
      <label class="radio-row"><input type="radio" name="commute-filter" value="45"/>≤ 45 min</label>
      <label class="radio-row"><input type="radio" name="commute-filter" value="any" />Any</label>
      </div>
    </div>
  </div>
  <div id="legend">
    <div id="legend-header">Legend <span id="legend-toggle">▼</span></div>
    <div id="legend-body">
      <h4>Record Type</h4>
      ${legend}
      <h4>School Level</h4>
      <div class="legend-item"><svg width="18" height="18" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="#2563eb" stroke="#fff" stroke-width="1.5"/></svg>Elementary</div>
      <div class="legend-item"><svg width="18" height="18" viewBox="0 0 20 20"><polygon points="10,2 12.1,7.1 17.6,7.5 13.4,11.1 14.7,16.5 10,13.6 5.3,16.5 6.6,11.1 2.4,7.5 7.9,7.1" fill="#2563eb" stroke="#fff" stroke-width="1"/></svg>Middle</div>
      <div class="legend-item"><svg width="18" height="18" viewBox="0 0 20 20" overflow="visible"><path d="M 10 2 C 12.8 2 12.2 7.8 12.2 7.8 C 12.2 7.8 20.8 10 18 10 C 18 12.8 12.2 12.2 12.2 12.2 C 12.2 12.2 10 15.2 10 18 C 7.2 18 7.8 12.2 7.8 12.2 C 7.8 12.2 -0.8 10 2 10 C 2 7.2 7.8 7.8 7.8 7.8 C 7.8 7.8 10 4.8 10 2 Z" fill="#2563eb" stroke="#fff" stroke-width="1"/></svg>K-8</div>
      <div class="legend-item"><svg width="18" height="18" viewBox="0 0 20 20"><polygon points="10,2 18,10 10,18 2,10" fill="#94a3b8" stroke="#fff" stroke-width="1.5"/></svg>Unknown</div>
<h4>Commute</h4>
      ${commuteLegend}
    </div>
  </div>
  <script>const __points = ${JSON.stringify(points)};const __commutePolygonSets = ${JSON.stringify({ rings: commuteRingZones })};const __zipCodes = ${JSON.stringify(zipCodesJson)};const __elementaryZones = ${JSON.stringify(elementaryZonesJson)};const __middleZones = ${JSON.stringify(middleZonesJson)};</script>
  <script src="./map-client.js?v=${Date.now()}"></script>
  <script src="./search-client.js?v=${Date.now()}"></script>
</body>
</html>`;

const outPath = resolve(outDir, "map.html");
writeFileSync(outPath, html, "utf-8");

const tscFlags = `--target ES2022 --module ESNext --outDir ${outDir} --skipLibCheck --ignoreConfig`;
for (const src of ["map-client.ts", "search-client.ts"]) {
  execSync(`pnpm exec tsc ${tscFlags} ${resolve(__dirname, src)}`, {
    stdio: "inherit",
  });
}

console.log(`Written to ${outPath} + map-client.js`);
