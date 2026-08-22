import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "node:child_process";
import type { SchoolsResponse } from "./types.js";
import schoolsJson from "../data/schools.json" with { type: "json" };

const schools = schoolsJson as unknown as SchoolsResponse;

const COLORS: Record<string, string> = {
  "PUBLIC SCHOOL (IMF)": "#3b82f6",
  "NON PUBLIC SCHOOL (IMF)": "#f97316",
  "CHARTER SCHOOLS (IMF)": "#a855f7",
  "OTHER- NON IMF": "#6b7280",
};

const DEFAULT_COLOR = "#ef4444";

const features = schools.features.filter(
  (f) => f.geometry?.x != null && f.geometry?.y != null,
);

const points = features.map((f) => ({
  lng: f.geometry.x,
  lat: f.geometry.y,
  color: COLORS[f.attributes.RECORD_TYPE_DESC] ?? DEFAULT_COLOR,
  name: f.attributes.LEGAL_NAME,
  type: f.attributes.RECORD_TYPE_DESC,
  city: f.attributes.PHYSCITY,
  address: f.attributes.PHYSADDRLINE1,
}));

const legend = Object.entries(COLORS)
  .map(
    ([label, color]) =>
      `<div class="legend-item"><span class="dot" style="background:${color}"></span>${label}</div>`,
  )
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>NY Schools Map</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
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
      padding: 12px 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      font-family: sans-serif;
      font-size: 13px;
    }
    #legend h4 { margin-bottom: 8px; font-size: 12px; text-transform: uppercase; color: #555; letter-spacing: .05em; }
    .legend-item { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
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
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="panel">
    <div id="panel-header">
      Controls <span id="panel-toggle">▼</span>
    </div>
    <div id="panel-body">
      <div class="control-row">
        <label class="control-label">
          <span>Coverage radius</span><span id="radius-value">0.5 mi</span>
        </label>
        <input type="range" id="radius-slider" min="0.1" max="1.5" value="0.3" step="0.05" />
      </div>
    </div>
  </div>
  <div id="legend">
    <h4>Record Type</h4>
    ${legend}
  </div>
  <script>const __points = ${JSON.stringify(points)};</script>
  <script src="./map-client.js"></script>
</body>
</html>`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "..");

const outPath = resolve(outDir, "map.html");
writeFileSync(outPath, html, "utf-8");

const clientSrc = resolve(__dirname, "map-client.ts");
execSync(
  `pnpm exec tsc --target ES2022 --module ESNext --outDir ${outDir} --skipLibCheck --ignoreConfig ${clientSrc}`,
  { stdio: "inherit" },
);

console.log(`Written to ${outPath} + map-client.js`);
