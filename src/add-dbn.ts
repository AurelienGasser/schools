import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const path = resolve(__dirname, "../data/schools.json");

const BOROUGH: Record<string, string> = {
  KINGS: "K",
  "NEW YORK": "M",
  BRONX: "X",
  QUEENS: "Q",
  RICHMOND: "R",
};

// Matches abbreviations like: PS, P.S., MS, M.S., IS, I.S., JHS, J.H.S., HS, H.S.
// One or more joined by optional-space / optional-space, then the school number.
// Examples: "PS 81", "P.S. 081", "PS/MS 123", "P.S./I.S. 123", "P.S. / I.S. 123"
const SCHOOL_NUM_RE =
  /^(?:[PMIJHS]\.?){1,3}(?:\s*\/\s*(?:[PMIJHS]\.?){1,3})*[\s.]+(\d+)/i;

function extractSchoolNumber(name: string): string | null {
  const m = SCHOOL_NUM_RE.exec(name);
  if (!m) {
    const m2 = /([0-9])+/.exec(name);
    return m2?.[0] ?? null;
  }
  return parseInt(m[1]).toString().padStart(3, "0");
}

function extractDistrict(sdlDesc: string): string | null {
  // Works for "NYC GEOG DIST 21", "NYC D75 PROGRAMS", "NYC CHARTER DIST 84"
  const m = /\d+/.exec(sdlDesc);
  return m ? m[0] : null;
}

const schoolsJson = JSON.parse(readFileSync(path, "utf-8"));

let assigned = 0;
let notPublic = 0;
const noSchoolNum = [];
const noBorough = [];
const noDistrict = [];

for (const feature of schoolsJson.features) {
  const attrs = feature.attributes;

  if (attrs.RECORD_TYPE_DESC !== "PUBLIC SCHOOL (IMF)") {
    notPublic++;
    continue;
  }

  const borough = BOROUGH[attrs.COUNTY_DESC?.toUpperCase?.() ?? ""];
  const district = extractDistrict(attrs.SDL_DESC ?? "");
  const schoolNum = extractSchoolNumber(attrs.LEGAL_NAME ?? "");

  if (district) {
    attrs.district = district;
  }

  if (!schoolNum) noSchoolNum.push(attrs);
  else if (!borough) noBorough.push(attrs);
  else if (!district) noDistrict.push(attrs);

  if (!borough || !district || !schoolNum) {
    continue;
  }

  attrs.DBN = `${district}${borough}${schoolNum}`;
  assigned++;
}

console.log("NO SCHOOL NUM:");
for (const attrs of noSchoolNum) {
  console.log(
    `  Skipped — name: "${attrs.LEGAL_NAME}"  county: ${attrs.COUNTY_DESC}  sdl: ${attrs.SDL_DESC}`,
  );
}
console.log("NO BOROUGH:");
for (const attrs of noBorough) {
  console.log(
    `  Skipped — name: "${attrs.LEGAL_NAME}"  county: ${attrs.COUNTY_DESC}  sdl: ${attrs.SDL_DESC}`,
  );
}
console.log("NO DISTRICT:");
for (const attrs of noDistrict) {
  console.log(
    `  Skipped — name: "${attrs.LEGAL_NAME}"  county: ${attrs.COUNTY_DESC}  sdl: ${attrs.SDL_DESC}`,
  );
}

console.log("No school num:", noSchoolNum.length);
console.log("No borough:", noBorough.length);
console.log("No district:", noDistrict.length);
console.log(`Assigned DBN: ${assigned} `);

writeFileSync(path, JSON.stringify(schoolsJson), "utf-8");
console.log("Written to data/schools.json");
