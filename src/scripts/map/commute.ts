import { resolve } from "path";
import { readdirSync, readFileSync, existsSync } from "fs";
import polygonClipping from "polygon-clipping";
import { pointInMultiPolygon } from "../../common/geometry.js";
const __dirname = resolve();

type PolygonEntry = {
  coordinates: number[][][][];
  color: string;
  label: string;
};

type ClipCoords = [number, number][][][];

const polygonsDir = resolve(__dirname, "data/commute");

const polygonFiles: string[] = existsSync(polygonsDir)
  ? readdirSync(polygonsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
  : [];

const polygons: Record<string, PolygonEntry[]> = Object.fromEntries(
  polygonFiles.map((name) => [name, loadPolygonFile(`${name}.json`)]),
);

// Zones sorted ascending by minute value parsed from filename (e.g. "30-min" → 30)
export const commuteZonesSorted = polygonFiles
  .map((name) => ({ name, minutes: parseInt(name) }))
  .filter((z) => !isNaN(z.minutes))
  .sort((a, b) => a.minutes - b.minutes);

// Colors assigned in ascending order: green (close) → orange → red (far)
export const COMMUTE_ZONE_COLORS = [
  "#22c55e",
  "#16a34a",
  "#ca8a04",
  "#f97316",
  "#ef4444",
];

export const commuteLegend = commuteZonesSorted
  .map((z, i) => {
    const label =
      i === 0
        ? `< ${z.minutes} min`
        : `${commuteZonesSorted[i - 1].minutes}–${z.minutes} min`;
    return `<div class="legend-item"><span class="dot" style="background:${COMMUTE_ZONE_COLORS[i]}"></span>${label}</div>`;
  })
  .join("\n");

// Rings mode: subtract each smaller zone from the next to get non-overlapping bands
export const commuteRingZones = commuteZonesSorted.map((z, i) => {
  const current = zoneCoords(z.name);
  const coords =
    i === 0
      ? current
      : (polygonClipping.difference(
          current,
          zoneCoords(commuteZonesSorted[i - 1].name),
        ) as number[][][][]);
  return {
    name: z.name,
    minutes: z.minutes,
    color: COMMUTE_ZONE_COLORS[i] ?? "#6b7280",
    entries: [{ coordinates: coords }],
  };
});

export const getCommuteString = ({
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

export function commuteRange(
  lng: number,
  lat: number,
): { min?: number; max?: number } {
  for (let i = 0; i < commuteZonesSorted.length; i++) {
    const { name, minutes } = commuteZonesSorted[i];
    if (
      polygons[name].some((e) => pointInMultiPolygon(lng, lat, e.coordinates))
    ) {
      return i === 0
        ? { max: minutes }
        : { min: commuteZonesSorted[i - 1].minutes, max: minutes };
    }
  }
  const last = commuteZonesSorted.at(-1);
  return { min: last!.minutes };
}

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

function zoneCoords(name: string): ClipCoords {
  return polygons[name].flatMap((e) => e.coordinates) as ClipCoords;
}
