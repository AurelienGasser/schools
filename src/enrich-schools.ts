import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, "../data");

// 1. Read selected column names
const selectedColumns = new Set(
  readFileSync(resolve(dataDir, "school-quality-results-columns.txt"), "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean),
);

// 2. Parse CSV (handles BOM, quoted fields, embedded commas)
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, "").replace(/\r/g, "").split("\n");
  const headers = parseCsvLine(lines[0]);
  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const values = parseCsvLine(line);
      const row: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++)
        row[headers[i]] = values[i] ?? "";
      return row;
    });
}

const allRows = parseCsv(
  readFileSync(
    resolve(dataDir, "school-quality-results-2026-all.csv"),
    "utf-8",
  ),
);

// Normalize: lowercase, strip non-alphanumeric, collapse spaced abbreviations, remove leading zeros
function normalize(name: string): string {
  let s = name.replace(/^the /i, "");
  s = s.replace(/\([^\)]+\)/gi, "");
  s = s.replace(
    /^([MPI]\.?S\.? [IM]?[0-9]{1,3} )?(.*) \(THE\)( \(.+\))?$/g,
    "$1 $2",
  );
  s = s.replace(/^M\.?\S.? /g, "PS ");
  s = s.replace(/^I\.?\S.? /g, "PS ");
  s = s.replace(/P\.\S. 0/g, "PS ");
  s = s.replace(/P\.?S\.?\/[IM]\.?S\.?/g, "PS");
  s = s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ") // punctuation/symbols → space
    .replace(/\s+/g, " ")
    .trim();
  // Collapse sequences of space-separated single letters: "p s" → "ps", "j h s" → "jhs"
  s = s.replace(/\b([a-z])(?: ([a-z]))+\b/g, (m) => m.replace(/ /g, ""));
  // Strip borough letter suffix from school numbers: "81q" → "81", "184m" → "184"
  s = s.replace(/\b(\d+)[a-z]\b/g, "$1");
  // Remove leading zeros in numbers: 081 → 81
  s = s.replace(/\b0+(\d+)/g, "$1");
  s = s.replace(/^(ps [0-9]{1,3}).*$/g, "$1");
  s = s.replace(/school$/g, "");
  return s;
}

// 3. Keep only selected columns; index by normalized name
const csvByBoroughAndName = new Map<string, Record<string, string>>();
const csvByDbn = new Map<string, Record<string, string>>();
const csvOriginalName = new Map<string, string>(); // normalized key → original name
for (const row of allRows) {
  const name = row["School Name"]?.trim();
  if (!name) continue;
  const filtered: Record<string, string> = {};
  for (const col of selectedColumns) {
    if (col in row) filtered[col] = row[col];
  }
  const key = `${row["DBN"][2]}-${normalize(name)}`;
  csvByBoroughAndName.set(key, filtered);
  csvByDbn.set(row["DBN"], filtered);
  csvOriginalName.set(key, name);
}

// 4. Load schools.json, wipe any existing sqr, match by name, add sqr property
const schoolsJson = JSON.parse(
  readFileSync(resolve(dataDir, "schools.json"), "utf-8"),
);

for (const feature of schoolsJson.features) {
  delete feature.attributes?.sqr;
}

let jsonMatched = 0;
const jsonUnmatchedByType = new Map<string, number>();
const jsonUnmatchedPublic: string[] = [];
const csvMatchedNames = new Set<string>();
let matchedByDbn = 0;

for (const feature of schoolsJson.features) {
  const name: string = feature.attributes?.LEGAL_NAME ?? "";
  const type: string = feature.attributes?.RECORD_TYPE_DESC ?? "UNKNOWN";
  const normalizedName = normalize(name);
  const rowByDbn = csvByDbn.get(feature.attributes?.DBN ?? "UNKNOWN");
  if (rowByDbn) {
    matchedByDbn++;
    feature.attributes.sqr = rowByDbn;
    csvMatchedNames.add(normalizedName);
    jsonMatched++;
  } else {
    const rowByBoroughAndName = csvByBoroughAndName.get(
      `${getBoroughCodeFromAttrs(feature.attributes)}-${normalizedName}`,
    );
    if (rowByBoroughAndName) {
      feature.attributes.sqr = rowByBoroughAndName;
      csvMatchedNames.add(normalizedName);
      jsonMatched++;
    } else {
      jsonUnmatchedByType.set(type, (jsonUnmatchedByType.get(type) ?? 0) + 1);
      if (type === "PUBLIC SCHOOL (IMF)" && !probablyHighSchool(name))
        jsonUnmatchedPublic.push(name);
    }
  }
}

function getBoroughCodeFromAttrs(attributes: any) {
  if (!attributes) throw new Error("no attributes");
  const COUNTY_DESC = attributes.COUNTY_DESC;
  switch (COUNTY_DESC) {
    case "NEW YORK":
      return "M";
    case "KINGS":
      return "K";
    case "QUEENS":
      return "Q";
    default:
      throw new Error(`unknown borough: ${COUNTY_DESC}`);
  }
}

const csvUnmatchedNames = [...csvByBoroughAndName.keys()]
  .filter((k) => !csvMatchedNames.has(k))
  .map((k) => csvOriginalName.get(k)!);

const csvMatched = csvMatchedNames.size;
const csvUnmatched = csvUnmatchedNames.length;
const jsonUnmatched = schoolsJson.features.length - jsonMatched;

console.log(`Matched by DBN: ${matchedByDbn}`);
console.log(
  `\nCSV rows:     ${csvByBoroughAndName.size} total  |  ${csvMatched} matched  |  ${csvUnmatched} unmatched`,
);
console.log(
  `JSON records: ${schoolsJson.features.length} total  |  ${jsonMatched} matched  |  ${jsonUnmatched} unmatched`,
);
if (jsonUnmatchedByType.size) {
  console.log("\nJSON unmatched by type:");
  for (const [type, count] of [...jsonUnmatchedByType].sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${count.toString().padStart(4)} ${type}`);
  }
}

function probablyHighSchool(name: string) {
  return (
    name.toLowerCase().includes("high school") &&
    !name.toLowerCase().includes("junior") &&
    !name.toLowerCase().includes("middle")
  );
}

// 5. Write enriched schools.json
writeFileSync(
  resolve(dataDir, "schools.json"),
  JSON.stringify(schoolsJson, null, 2),
  "utf-8",
);
console.log("\nWritten to data/schools.json");

// 6. Write unmatched CSV
const unmatchedCsvPath = resolve(dataDir, "unmatched-schools.csv");
const csvLines = [
  "source,name",
  ...csvUnmatchedNames
    .sort()
    .map((n) => `csv,${n.includes(",") ? `"${n.replace(/"/g, '""')}"` : n}`),
  ...jsonUnmatchedPublic
    .sort()
    .map((n) => `json,${n.includes(",") ? `"${n.replace(/"/g, '""')}"` : n}`),
];
writeFileSync(unmatchedCsvPath, csvLines.join("\n"), "utf-8");
console.log(
  `Written ${csvUnmatchedNames.length} CSV + ${jsonUnmatchedPublic.length} JSON unmatched to unmatched-schools.csv`,
);
