import * as schools from "../data/schools.json";
// import * as ppublic from "../data/public.json";
// import * as pprivate from "../data/private.json";
// import * as charter from "../data/charter.json";

const schoolsByName = schools.default.features.map((s) => [
  s.attributes.LEGAL_NAME,
]);

const find = (src: any[]) => {
  const schoolsByName = new Map(
    schools.default.features.map((s) => [s.attributes.LEGAL_NAME, s]),
  );
  console.log(src.length, schoolsByName.size);
  for (const s of src) {
  }
};

// find(schools.default.features);
// find(ppublic.default.features);
// find(pprivate.default.features);
// find(charter.default.features);

console.log(schools.default.features.length);
const byType = Map.groupBy(
  schools.default.features,
  (s) => s.attributes.RECORD_TYPE_DESC,
);
for (const [type, entries] of byType) {
  console.log(`${type}: ${entries.length}`);
}
