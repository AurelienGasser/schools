import { writeFileSync, readdirSync, readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "node:child_process";
import polygonClipping from "polygon-clipping";
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "..");

type PolygonEntry = {
  coordinates: number[][][][];
  color: string;
  label: string;
};

const polygonsDir = resolve(__dirname, "../data/polygons");

function loadPolygonFile(f: string): PolygonEntry[] {
  const raw = JSON.parse(readFileSync(resolve(polygonsDir, f), "utf-8"));
  const fileLabel = f.replace(/\.json$/, "");
  const features =
    raw.type === "FeatureCollection"
      ? raw.features
      : raw.type === "Feature"
        ? [raw]
        : [{ geometry: raw, properties: {} }];
  return features
    .filter(
      (feat: any) =>
        feat.geometry?.type === "MultiPolygon" ||
        feat.geometry?.type === "Polygon",
    )
    .map((feat: any) => ({
      coordinates:
        feat.geometry.type === "MultiPolygon"
          ? feat.geometry.coordinates
          : [feat.geometry.coordinates],
      color: feat.properties?.color ?? "#ef4444",
      label: feat.properties?.label ?? feat.properties?.name ?? fileLabel,
    }));
}

const polygonFiles: string[] = existsSync(polygonsDir)
  ? readdirSync(polygonsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
  : [];

const polygons: Record<string, PolygonEntry[]> = Object.fromEntries(
  polygonFiles.map((name) => [name, loadPolygonFile(`${name}.json`)]),
);

function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function pointInMultiPolygon(x: number, y: number, coords: number[][][][]): boolean {
  return coords.some(
    (polygon) =>
      pointInRing(x, y, polygon[0]) &&
      polygon.slice(1).every((hole) => !pointInRing(x, y, hole)),
  );
}

// Zones sorted ascending by minute value parsed from filename (e.g. "30-min" → 30)
const zonesSorted = polygonFiles
  .map((name) => ({ name, minutes: parseInt(name) }))
  .filter((z) => !isNaN(z.minutes))
  .sort((a, b) => a.minutes - b.minutes);

// Colors assigned in ascending order: green (close) → orange → red (far)
const ZONE_COLORS = ["#22c55e", "#16a34a", "#ca8a04", "#f97316", "#ef4444"];

type ClipCoords = [number, number][][][];

function zoneCoords(name: string): ClipCoords {
  return polygons[name].flatMap((e) => e.coordinates) as ClipCoords;
}

// Rings mode: subtract each smaller zone from the next to get non-overlapping bands
const ringZones = zonesSorted.map((z, i) => {
  const current = zoneCoords(z.name);
  const coords =
    i === 0
      ? current
      : (polygonClipping.difference(current, zoneCoords(zonesSorted[i - 1].name)) as number[][][][]);
  return {
    name: z.name,
    minutes: z.minutes,
    color: ZONE_COLORS[i] ?? "#6b7280",
    entries: [{ coordinates: coords }],
  };
});

// Cumulative mode: raw polygons largest-first so each smaller zone paints on top
const cumulativeZones = [...zonesSorted]
  .map((z, i) => ({
    name: z.name,
    minutes: z.minutes,
    color: ZONE_COLORS[i] ?? "#6b7280",
    entries: polygons[z.name].map((e) => ({ coordinates: e.coordinates })),
  }))
  .reverse();

function commuteLabel(lng: number, lat: number): string {
  for (let i = 0; i < zonesSorted.length; i++) {
    const { name, minutes } = zonesSorted[i];
    if (polygons[name].some((e) => pointInMultiPolygon(lng, lat, e.coordinates))) {
      return i === 0 ? `< ${minutes} min` : `${zonesSorted[i - 1].minutes}–${minutes} min`;
    }
  }
  const last = zonesSorted.at(-1);
  return last ? `> ${last.minutes} min` : "";
}

const points = features.map((f) => ({
  lng: f.geometry.x,
  lat: f.geometry.y,
  color: COLORS[f.attributes.RECORD_TYPE_DESC] ?? DEFAULT_COLOR,
  name: f.attributes.LEGAL_NAME,
  type: f.attributes.RECORD_TYPE_DESC,
  city: f.attributes.PHYSCITY,
  address: f.attributes.PHYSADDRLINE1,
  commute: zonesSorted.length ? commuteLabel(f.geometry.x, f.geometry.y) : "",
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
    .toggle-row { display: flex; align-items: center; gap: 8px; color: #444; cursor: pointer; }
    .toggle-row input[type=checkbox] { accent-color: #3b82f6; width: 14px; height: 14px; cursor: pointer; }
    .radio-row { display: flex; align-items: center; gap: 8px; color: #444; cursor: pointer; }
    .radio-row input[type=radio] { accent-color: #3b82f6; width: 14px; height: 14px; cursor: pointer; }
    .control-section-label { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #888; margin-top: 10px; margin-bottom: 4px; }
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
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">
        <label class="toggle-row"><input type="checkbox" id="toggle-pins" checked />Pins</label>
        <label class="toggle-row"><input type="checkbox" id="toggle-circles" />Coverage circles</label>
      </div>
      <div class="control-section-label">Commute zones</div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <label class="radio-row"><input type="radio" name="zone-mode" value="none" />None</label>
        <label class="radio-row"><input type="radio" name="zone-mode" value="rings" checked />Rings</label>
        <label class="radio-row"><input type="radio" name="zone-mode" value="cumulative" />Overlapping</label>
      </div>
    </div>
  </div>
  <div id="legend">
    <h4>Record Type</h4>
    ${legend}
  </div>
  <script>const __points = ${JSON.stringify(points)};const __polygonSets = ${JSON.stringify({ rings: ringZones, cumulative: cumulativeZones })};</script>
  <script src="./map-client.js"></script>
</body>
</html>`;

const outPath = resolve(outDir, "map.html");
writeFileSync(outPath, html, "utf-8");

const clientSrc = resolve(__dirname, "map-client.ts");
execSync(
  `pnpm exec tsc --target ES2022 --module ESNext --outDir ${outDir} --skipLibCheck --ignoreConfig ${clientSrc}`,
  { stdio: "inherit" },
);

console.log(`Written to ${outPath} + map-client.js`);
