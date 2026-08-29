import { writeFileSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseRow(line: string): string[] {
  const fields: string[] = [];
  let cur = "",
    inQ = false;
  for (const ch of line) {
    if (ch === '"') {
      inQ = !inQ;
    } else if (ch === "," && !inQ) {
      fields.push(cur);
      cur = "";
    } else cur += ch;
  }
  fields.push(cur);
  return fields;
}

function borough(modzcta: string): string | null {
  const z = parseInt(modzcta);
  if (z >= 10001 && z <= 10282) return "Manhattan";
  if (z >= 11201 && z <= 11239) return "Brooklyn";
  if ((z >= 11004 && z <= 11109) || (z >= 11354 && z <= 11697)) return "Queens";
  return null;
}

// --- Average sale prices per zip code ---
const csvText = readFileSync(
  resolve(__dirname, "../data/sale_prices.csv"),
  "utf-8",
).replace(/^﻿/, "");
const csvLines = csvText.split("\n").filter(Boolean);
const header = parseRow(csvLines[0]);
const zipIdx = header.findIndex((h) => h.trim() === "ZIP CODE");
const priceIdx = header.findIndex((h) => h.trim() === "SALE PRICE");
const sqftIdx = header.findIndex((h) => h.trim() === "GROSS SQUARE FEET");

const pricesByZip = new Map<string, { sum: number; count: number }>();
for (let i = 1; i < csvLines.length; i++) {
  const row = parseRow(csvLines[i]);
  const zip = row[zipIdx]?.trim();
  const priceStr = row[priceIdx]?.trim().replace(/,/g, "");
  const sqftStr = row[sqftIdx]?.trim().replace(/,/g, "");
  if (!zip || !priceStr || !sqftStr) continue;
  const price = parseFloat(priceStr);
  const sqft = parseFloat(sqftStr);
  if (!isFinite(price) || price === 0) continue;
  if (!isFinite(sqft) || sqft === 0) continue;
  const psf = price / sqft;
  const entry = pricesByZip.get(zip) ?? { sum: 0, count: 0 };
  entry.sum += psf;
  entry.count++;
  pricesByZip.set(zip, entry);
}

const avgByZip = new Map<string, number>(
  [...pricesByZip.entries()].map(([zip, { sum, count }]) => [zip, sum / count]),
);

// --- Load and filter zip GeoJSON ---
const rawGeoJson = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      "../data/Modified_Zip_Code_Tabulation_Areas_(MODZCTA)_20260828.geojson",
    ),
    "utf-8",
  ),
) as any;

const features = rawGeoJson.features.flatMap((f: any) => {
  const b = borough(f.properties.modzcta);
  if (!b) return [];
  // Average across all ZCTAs in this MODZCTA group
  const zips = (f.properties.zcta as string)
    .split(",")
    .map((z: string) => z.trim());
  const priceEntries = zips
    .map((z) => avgByZip.get(z))
    .filter((p): p is number => p !== undefined);
  const avgPrice =
    priceEntries.length > 0
      ? priceEntries.reduce((a, b) => a + b, 0) / priceEntries.length
      : null;
  return [
    {
      ...f,
      properties: {
        modzcta: f.properties.modzcta,
        label: f.properties.label,
        borough: b,
        avgPrice,
      },
    },
  ];
});

const out = { type: "FeatureCollection", features };
writeFileSync(
  resolve(__dirname, "../data/zip-codes.json"),
  JSON.stringify(out),
);

const withPrice = features.filter((f: any) => f.properties.avgPrice !== null);
console.log(
  `Wrote ${features.length} zip codes (${withPrice.length} have price data)`,
);
const boroughCounts = features.reduce((acc: Record<string, number>, f: any) => {
  acc[f.properties.borough] = (acc[f.properties.borough] ?? 0) + 1;
  return acc;
}, {});
for (const [b, n] of Object.entries(boroughCounts)) console.log(`  ${b}: ${n}`);

const prices = features
  .map((f: any) => f.properties.avgPrice)
  .filter((p: any) => p !== null) as number[];
const min = Math.min(...prices);
const max = Math.max(...prices);
console.log(
  `Avg price/sqft range: $${Math.round(min).toLocaleString()} – $${Math.round(max).toLocaleString()}`,
);
