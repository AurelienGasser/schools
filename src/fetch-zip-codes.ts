import { writeFileSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { sumBy } from "lodash";

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
  // Average across all ZCTAs in this MODZCTA group
  const zips = (f.properties.zcta as string)
    .split(",")
    .map((z: string) => z.trim());
  const priceEntries = zips
    .map((z) => pricesByZip.get(z) ?? { sum: 0, count: 0 })
    .filter((e) => e.count > 0);
  const avgPrice =
    priceEntries.length > 0
      ? sumBy(priceEntries, (e) => e.sum) / sumBy(priceEntries, (e) => e.count)
      : null;
  return [
    {
      ...f,
      properties: {
        modzcta: f.properties.modzcta,
        label: f.properties.label,
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

const prices = features
  .map((f: any) => f.properties.avgPrice)
  .filter((p: any) => p !== null) as number[];
const min = Math.min(...prices);
const max = Math.max(...prices);
console.log(
  `Avg price/sqft range: $${Math.round(min).toLocaleString()} – $${Math.round(max).toLocaleString()}`,
);
