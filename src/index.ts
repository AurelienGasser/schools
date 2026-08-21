import type { SchoolsResponse } from "./types.js";
import schoolsJson from "../data/schools.json" with { type: "json" };
const schools = schoolsJson as unknown as SchoolsResponse;

console.log(schools.features.length);
const byType = Map.groupBy(
  schools.features,
  (s) => s.attributes.RECORD_TYPE_DESC,
);
for (const [type, entries] of byType) {
  console.log(`${type}: ${entries.length}`);
}
