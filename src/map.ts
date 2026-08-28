import { writeFileSync, readdirSync, readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "node:child_process";
import polygonClipping from "polygon-clipping";
import type { SchoolsResponse } from "./types.js";
import schoolsJson from "../data/schools.json" with { type: "json" };

// console.log(
//   schoolsJson.features.length,
//   Map.groupBy(schoolsJson.features, (s) => s.attributes.LEGAL_NAME).size,
// );

// for (const [key, values] of Map.groupBy(
//   schoolsJson.features,
//   (s) => `${s.attributes.LEGAL_NAME}-${s.attributes.PHYSZIPCD5}`,
// )) {
//   if (values.length > 1) {
//     console.log(values.length, key);
//   }
// }

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
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function pointInMultiPolygon(
  x: number,
  y: number,
  coords: number[][][][],
): boolean {
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
      : (polygonClipping.difference(
          current,
          zoneCoords(zonesSorted[i - 1].name),
        ) as number[][][][]);
  return {
    name: z.name,
    minutes: z.minutes,
    color: ZONE_COLORS[i] ?? "#6b7280",
    entries: [{ coordinates: coords }],
  };
});


function commuteRange(
  lng: number,
  lat: number,
): { min?: number; max?: number } {
  for (let i = 0; i < zonesSorted.length; i++) {
    const { name, minutes } = zonesSorted[i];
    if (
      polygons[name].some((e) => pointInMultiPolygon(lng, lat, e.coordinates))
    ) {
      return i === 0
        ? { max: minutes }
        : { min: zonesSorted[i - 1].minutes, max: minutes };
    }
  }
  const last = zonesSorted.at(-1);
  return { min: last!.minutes };
}

const getCommuteString = ({
  min,
  max,
}: {
  min?: number;
  max?: number;
}): string => {
  if (min == undefined) return `< ${max} min`;
  if (max == undefined) return `> ${min} min`;
  return `${min}-${max} min`;
};

function parsePercent(s: string): number | null {
  const m = /^([\d.]+)%$/.exec((s ?? "").trim());
  return m ? parseFloat(m[1]) / 100 : null;
}

function avgMetric(sqr: Record<string, string>, prefix: string): number | null {
  const vals = Object.entries(sqr)
    .filter(([k]) => k.startsWith(prefix))
    .map(([, v]) => parsePercent(v))
    .filter((v): v is number => v !== null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function qualityArms(
  sqr: Record<string, string> | undefined,
): [number, number, number] {
  if (!sqr) return [0, 0, 0];
  const ela =
    avgMetric(
      sqr,
      "Metric Value - Percentage of Students at Level 3 or 4, ELA",
    ) ?? 0;
  const math =
    avgMetric(
      sqr,
      "Metric Value - Percentage of Students at Level 3 or 4, Math",
    ) ?? 0;
  const attendance = parsePercent(sqr["Average Student Attendance"] ?? "") ?? 0;
  return [ela, math, attendance];
}

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
      f.attributes.sqr as Record<string, string> | undefined,
      f.attributes.LEGAL_NAME ?? "",
    ),
    qualityArms: qualityArms(
      f.attributes.sqr as Record<string, string> | undefined,
    ),
    sqr: f.attributes.sqr as Record<string, string> | undefined,
    dbn: f.attributes.DBN as string | undefined,
  }))
  .filter((s) => !s.commuteRange.min || s.commuteRange.min != 60)
  .map((s) => ({ ...s, commute: getCommuteString(s.commuteRange) }));

const legend = Object.entries(COLORS)
  .map(
    ([label, color]) =>
      `<div class="legend-item"><span class="dot" style="background:${color}"></span>${label}</div>`,
  )
  .join("\n");

const commuteLegend = zonesSorted
  .map((z, i) => {
    const label =
      i === 0
        ? `< ${z.minutes} min`
        : `${zonesSorted[i - 1].minutes}–${z.minutes} min`;
    return `<div class="legend-item"><span class="dot" style="background:${ZONE_COLORS[i]}"></span>${label}</div>`;
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
      <div class="control-section-label">Academics (ELA &amp; Math)</div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <label class="radio-row"><input type="radio" name="academic-filter" value="any" />Any</label>
        <label class="radio-row"><input type="radio" name="academic-filter" value="Fair" />Fair+</label>
        <label class="radio-row"><input type="radio" name="academic-filter" value="Good" checked />Good+</label>
        <label class="radio-row"><input type="radio" name="academic-filter" value="Excellent" />Excellent only</label>
      </div>
      <label class="toggle-row" style="margin-top:6px"><input type="checkbox" id="hide-no-academic-data" />Hide if no data</label>
      <div class="control-section-label">Commute</div>
      <div style="display:flex;flex-direction:column;gap:6px;">
      <label class="radio-row"><input type="radio" name="commute-filter" value="30" />≤ 30 min</label>
      <label class="radio-row"><input type="radio" name="commute-filter" value="40" />≤ 40 min</label>
      <label class="radio-row"><input type="radio" name="commute-filter" value="45" checked />≤ 45 min</label>
      <label class="radio-row"><input type="radio" name="commute-filter" value="any" />Any</label>
      </div>
      <label class="toggle-row" style="margin-top:6px"><input type="checkbox" id="toggle-zones" checked />Commute zones</label>
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
      <h4>Quality Arms</h4>
      <div class="legend-item"><span style="display:inline-block;width:14px;height:3px;background:#16a34a;border-radius:2px"></span>ELA (12 o'clock)</div>
      <div class="legend-item"><span style="display:inline-block;width:14px;height:3px;background:#ea580c;border-radius:2px"></span>Math (4 o'clock)</div>
      <div class="legend-item"><span style="display:inline-block;width:14px;height:3px;background:#dc2626;border-radius:2px"></span>Attendance (8 o'clock)</div>
      <h4>Commute</h4>
      ${commuteLegend}
    </div>
  </div>
  <script>const __points = ${JSON.stringify(points)};const __polygonSets = ${JSON.stringify({ rings: ringZones })};</script>
  <script src="./map-client.js?v=${Date.now()}"></script>
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
