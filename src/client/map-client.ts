import { pointInGeom } from "../common/geometry.js";
import { parseDbns } from "../common/helpers.js";
import { updateEligibleZonesLayer } from "./eligible-zones.js";

declare const L: any;
declare const OverlappingMarkerSpiderfier: any;
declare const __schoolPoints: Array<{
  lat: number;
  lng: number;
  color: string;
  name: string;
  type: string;
  city: string;
  address: string;
  commute: string;
  commuteRange: { min?: number; max?: number };
  schoolType: "elementary" | "middle" | "k8" | "unknown";

  sqr?: Record<string, string>;
  dbn?: string;
}>;
type ZoneSet = Array<{
  name: string;
  minutes: number;
  color: string;
  entries: Array<{ coordinates: number[][][][] }>;
}>;
declare const __commutePolygonSets: { rings: ZoneSet };
declare const __realEstatePriceZipCodes: {
  type: string;
  features: Array<{
    type: string;
    geometry: any;
    properties: { modzcta: string; label: string; avgPrice: number | null };
  }>;
};
declare const __elementaryZones: any;
declare const __middleZones: any;

export const map = L.map("map").setView([40.6928, -73.956], 13);

L.tileLayer(
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  [{ header: "X-Requested-With", value: "aureliengasser-schools" }],
  null,
).addTo(map);

export const schoolPinsLayer = L.layerGroup().addTo(map);

function buildLayer(zones: ZoneSet): any {
  const layer = L.layerGroup();
  for (const zone of zones) {
    for (const entry of zone.entries) {
      L.geoJSON(
        { type: "MultiPolygon", coordinates: entry.coordinates },
        {
          style: {
            color: zone.color,
            weight: 1.5,
            opacity: 0.6,
            fillColor: zone.color,
            fillOpacity: 0.25,
          },
          interactive: false,
        },
      ).addTo(layer);
    }
  }
  return layer;
}

const ringsLayer = buildLayer(__commutePolygonSets.rings);

const zipPrices = __realEstatePriceZipCodes.features
  .map((f) => f.properties.avgPrice)
  .filter((p): p is number => p !== null);
const zipMinPrice = Math.min(...zipPrices);
const zipMaxPrice = Math.max(...zipPrices);

function zipPriceColor(price: number | null): {
  fillColor: string;
  fillOpacity: number;
} {
  if (price === null) return { fillColor: "#000", fillOpacity: 0 };
  const t = Math.log(price / zipMinPrice) / Math.log(zipMaxPrice / zipMinPrice);
  const hue = Math.round(60 - t * 60);
  const lightness = Math.round(70 - t * 30);
  return { fillColor: `hsl(${hue}, 100%, ${lightness}%)`, fillOpacity: 0.55 };
}

const zipLayer = L.geoJSON(__realEstatePriceZipCodes, {
  style(feature: any) {
    const { fillColor, fillOpacity } = zipPriceColor(
      feature.properties.avgPrice,
    );
    return {
      stroke: false,
      fillColor,
      fillOpacity,
    };
  },
  onEachFeature(feature: any, layer: any) {
    const price = feature.properties.avgPrice as number | null;
    const priceStr =
      price !== null ? ` — $${Math.round(price).toLocaleString()}/sqft` : "";
    layer.bindTooltip(feature.properties.label + priceStr, {
      permanent: false,
      sticky: true,
      className: "zip-tooltip",
    });
  },
}).addTo(map);

const schoolZoneStyle = (_color: string) => ({
  opacity: 0,
  fill: false,
  interactive: false,
});

const schoolZoneHighlight = (color: string) => ({
  color,
  weight: 3.5,
  opacity: 0.95,
  fillColor: color,
  fillOpacity: 0.25,
});

export type ZoneEntry = {
  feature: any;
  layer: any;
  color: string;
  zoneType: "elementary" | "middle";
};
export const allZones: ZoneEntry[] = [];

function findZonesForPoint(lng: number, lat: number): ZoneEntry[] {
  const found: ZoneEntry[] = [];
  for (const z of allZones) {
    if (found.some((f) => f.zoneType === z.zoneType)) continue;
    if (pointInGeom(lng, lat, z.feature.geometry)) found.push(z);
    if (found.length === 2) break;
  }
  return found;
}

function schoolsInZone(zone: ZoneEntry): typeof __schoolPoints {
  const relevantTypes =
    zone.zoneType === "elementary" ? ["elementary", "k8"] : ["middle", "k8"];
  return __schoolPoints.filter(
    (p) =>
      relevantTypes.includes(p.schoolType) &&
      pointInGeom(p.lng, p.lat, zone.feature.geometry),
  );
}

function makeZoneGeoJSON(
  data: any,
  color: string,
  zoneType: "elementary" | "middle",
): any {
  return L.geoJSON(data, {
    style: () => schoolZoneStyle(color),
    onEachFeature(feature: any, layer: any) {
      allZones.push({ feature, layer, color, zoneType });
    },
  });
}

L.layerGroup([
  makeZoneGeoJSON(__middleZones, "#ea580c", "middle"),
  makeZoneGeoJSON(__elementaryZones, "#2563eb", "elementary"),
]).addTo(map);

let selectedSchoolZones: ZoneEntry[] = [];
let selectedMainSchoolCircles: any[] = [];
let selectedFadedMarkers: any[] = [];

export const deselect = () => {
  for (const z of selectedSchoolZones)
    z.layer.setStyle(schoolZoneStyle(z.color));
  selectedSchoolZones = [];
  for (const c of selectedMainSchoolCircles) map.removeLayer(c);
  selectedMainSchoolCircles = [];
  for (const m of selectedFadedMarkers) {
    map.removeLayer(m);
    m.setOpacity(1);
  }
  selectedFadedMarkers = [];
};

// SVG pin helpers — 40x40 viewbox, shape centered at (20,20)
const R = 10; // shape radius
const CX = 20;
const CY = 20;

function starPoints(
  cx: number,
  cy: number,
  r: number,
  points: number,
  innerRatio = 0.45,
): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * innerRatio;
    pts.push(
      `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`,
    );
  }
  return pts.join(" ");
}

function roundedStarPath(cx: number, cy: number, r: number): string {
  // 4-pointed star with rounded lobes using cubic bezier
  const o = r * 0.35; // control point offset
  const ir = r * 0.28; // inner radius
  const pts = [
    [cx, cy - r],
    [cx + r, cy],
    [cx, cy + r],
    [cx - r, cy],
  ];
  const inners = [
    [cx + ir, cy - ir],
    [cx + ir, cy + ir],
    [cx - ir, cy + ir],
    [cx - ir, cy - ir],
  ];
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < 4; i++) {
    const next = pts[(i + 1) % 4];
    const inner = inners[i];
    d += ` C ${pts[i][0] + (i === 0 ? o : i === 2 ? -o : 0)} ${pts[i][1] + (i === 1 ? o : i === 3 ? -o : 0)}`;
    d += ` ${inner[0]} ${inner[1]}`;
    d += ` ${inner[0]} ${inner[1]}`;
    d += ` C ${inner[0]} ${inner[1]}`;
    d += ` ${next[0] + (i === 0 ? o : i === 2 ? -o : 0)} ${next[1] + (i === 1 ? -o : i === 3 ? o : 0)}`;
    d += ` ${next[0]} ${next[1]}`;
  }
  d += " Z";
  return d;
}

function makePinSvg(
  schoolType: "elementary" | "middle" | "k8" | "unknown",
  color: string,
): string {
  const shapeEl =
    schoolType === "elementary"
      ? `<circle cx="${CX}" cy="${CY}" r="${R}" fill="${color}" stroke="#fff" stroke-width="1.5"/>`
      : schoolType === "middle"
        ? `<polygon points="${starPoints(CX, CY, R, 5)}" fill="${color}" stroke="#fff" stroke-width="1.5"/>`
        : schoolType === "k8"
          ? `<path d="${roundedStarPath(CX, CY, R)}" fill="${color}" stroke="#fff" stroke-width="1.5"/>`
          : `<polygon points="${CX},${CY - R} ${CX + R},${CY} ${CX},${CY + R} ${CX - R},${CY}" fill="${color}" stroke="#fff" stroke-width="1.5"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">${shapeEl}</svg>`;
}

function makePinIcon(p: (typeof __schoolPoints)[0]): any {
  return L.divIcon({
    html: makePinSvg(p.schoolType, p.color),
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22],
  });
}

const RATING_COLORS: Record<string, string> = {
  Excellent: "#15803d",
  Good: "#65a30d",
  Fair: "#ca8a04",
  "Needs Improvement": "#dc2626",
};

function ratingBadge(rating: string): string {
  const bg = RATING_COLORS[rating] ?? "#6b7280";
  return `<span style="background:${bg};color:#fff;padding:1px 5px;border-radius:3px;font-size:11px;white-space:nowrap">${rating}</span>`;
}

function pctBar(pct: number, raw: string, invert = false): string {
  const hue = Math.pow((invert ? 100 - pct : pct) / 100, 3) * 120;
  const color = `hsl(${hue.toFixed(1)},75%,38%)`;
  const p = pct.toFixed(1);
  const bg = `linear-gradient(to right,${color} ${p}%,#e5e7eb ${p}%)`;
  return `<div style="display:flex;align-items:center;gap:6px"><div style="width:80px;height:5px;background:${bg};border-radius:2px;flex-shrink:0"></div><span style="color:#555;font-size:11px">${raw}</span></div>`;
}

function renderValue(value: string, isRating: boolean, invert = false): string {
  if (isRating) return value ? ratingBadge(value) : "—";
  if (!value) return "—";
  const m = /^([\d.]+)%$/.exec(value.trim());
  if (m)
    return pctBar(
      Math.min(100, Math.max(0, parseFloat(m[1]))),
      value.trim(),
      invert,
    );
  return value;
}

function fmtRow(
  label: string,
  value: string,
  isRating = false,
  ratingValue?: string,
  scoreRange?: [number, number],
  invert = false,
): string {
  let cell: string;
  if (ratingValue !== undefined && scoreRange) {
    const score = parseFloat(value);
    const [min, max] = scoreRange;
    const pct = isNaN(score) ? 0 : ((score - min) / (max - min)) * 100;
    const color = RATING_COLORS[ratingValue] ?? "#6b7280";
    const bg = `linear-gradient(to right,${color} ${pct.toFixed(1)}%,#e5e7eb ${pct.toFixed(1)}%)`;
    const bar = `<div style="width:80px;height:5px;background:${bg};border-radius:2px;flex-shrink:0"></div>`;
    const scoreText = value
      ? `<span style="color:#555;font-size:11px">${score.toFixed(2)}</span>`
      : "";
    const badge = ratingValue ? ratingBadge(ratingValue) : "";
    cell = `<div style="display:flex;align-items:center;gap:6px">${bar}${scoreText}${badge}</div>`;
  } else if (ratingValue !== undefined) {
    const badge = ratingValue ? ratingBadge(ratingValue) : "";
    cell = `<div style="display:flex;align-items:center;gap:6px">${renderValue(value, false, invert)}${badge}</div>`;
  } else {
    cell = renderValue(value, isRating, invert);
  }
  return `<tr><td style="color:#555;padding-right:8px;white-space:nowrap;vertical-align:middle">${label}</td><td style="vertical-align:middle">${cell}</td></tr>`;
}

const POPUP_FIELDS: Array<{
  label: string;
  key: string;
  isRating?: boolean;
  ratingKey?: string;
  scoreRange?: [number, number];
  invert?: boolean;
}> = [
  { label: "School Type", key: "School Type" },
  { label: "Enrollment", key: "Enrollment" },
  { label: "Temp Housing", key: "Percent in Temp Housing", invert: true },
  {
    label: "Principal Yrs.",
    key: "Years of principal experience at this school",
  },
  { label: "Attendance", key: "Average Student Attendance" },
  {
    label: "Teachers w/ 3+ Yrs",
    key: "Percent of teachers with 3 or more years of experience",
  },
  {
    label: "Instr. and Perf.",
    key: "Instruction and Performance - Score",
    ratingKey: "Instruction and Performance - Rating",
    scoreRange: [1, 5],
  },
  {
    label: "Safety",
    key: "Safety and School Climate - Rating",
    isRating: true,
  },
  {
    label: "Relationships w/ Families",
    key: "Relationships with Families - Rating",
    isRating: true,
  },
];

const RATING_TO_PCT: Record<string, number> = {
  Excellent: 100,
  Good: 66,
  Fair: 33,
  "Needs Improvement": 0,
};

function academicSection(s: Record<string, string>): string {
  type Subject = {
    label: string;
    fullName: string;
    ratingKey: string;
    scoreKey: string;
    nKey: string;
  };
  const mk = (label: string, metric: string): Subject => ({
    label,
    fullName: metric,
    ratingKey: `Metric Rating - ${metric}`,
    scoreKey: `Metric Score - ${metric}`,
    nKey: `N count - ${metric}`,
  });

  const mainSubjects: Subject[] = [
    mk("ELA", "Average Student Proficiency, ELA"),
    mk("Math", "Average Student Proficiency, Math"),
  ];

  const detailSubjects: Subject[] = [
    mk("ELA Core Pass", "ELA Core Course Pass Rate"),
    mk("Math Core Pass", "Math Core Course Pass Rate"),
    mk("Science Pass", "Science Core Course Pass Rate"),
    mk("Soc. Stud. Pass", "Social Studies Core Course Pass Rate"),
    mk("MS Adj. Pass", "MS Adjusted Core Course Pass Rate of Former Students"),
    mk("8th → HS Cred.", "Percent of 8th Graders Earning HS Credit"),
    mk("Lvl 3-4 ELA", "Percentage of Students at Level 3 or 4, ELA"),
    mk("Lvl 3-4 Math", "Percentage of Students at Level 3 or 4, Math"),
  ];

  const renderRow = ({
    label,
    fullName,
    ratingKey,
    scoreKey,
    nKey,
  }: Subject): string => {
    const rating = s[ratingKey] ?? "";
    const scoreRaw = s[scoreKey];
    const nRaw = s[nKey];
    if (!rating && !scoreRaw) return "";
    let pct: number;
    let scoreText = "";
    if (scoreRaw) {
      const score = parseFloat(scoreRaw);
      pct = ((score - 1) / 4) * 100;
      const nText = nRaw ? ` (N=${nRaw})` : "";
      scoreText = `<span style="color:#555;font-size:11px">${score.toFixed(2)}${nText}</span>`;
    } else {
      pct = RATING_TO_PCT[rating] ?? 50;
    }
    const color = RATING_COLORS[rating] ?? "#6b7280";
    const bg = `linear-gradient(to right,${color} ${pct.toFixed(1)}%,#e5e7eb ${pct.toFixed(1)}%)`;
    const bar = `<div style="width:80px;height:5px;background:${bg};border-radius:2px;flex-shrink:0"></div>`;
    const badge = rating ? ratingBadge(rating) : "";
    return `<tr title="${fullName}"><td style="color:#555;padding-right:8px;white-space:nowrap;vertical-align:middle">${label}</td><td style="vertical-align:middle"><div style="display:flex;align-items:center;gap:6px">${bar}${scoreText}${badge}</div></td></tr>`;
  };

  const mainRows = mainSubjects.map(renderRow).join("");
  if (!mainRows) return "";

  const detailRows = detailSubjects.map(renderRow).filter(Boolean).join("");
  const detailSection = detailRows
    ? `<details style="margin-top:4px"><summary style="font-size:11px;color:#888;cursor:pointer;list-style:none;padding:2px 0">&#9654; More metrics</summary><table style="font-size:12px;border-collapse:collapse;margin-top:4px">${detailRows}</table></details>`
    : "";

  return `<div style="margin-top:8px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#888;margin-bottom:4px">Academics</div><table style="font-size:12px;border-collapse:collapse">${mainRows}</table>${detailSection}</div>`;
}

const ETHNICITY_GROUPS = [
  { label: "Hispanic", key: "Student Percent - Hispanic", color: "#c2703e" },
  { label: "Black", key: "Student Percent - Black", color: "#5c3317" },
  { label: "Asian", key: "Student Percent - Asian", color: "#e8b84b" },
  { label: "White", key: "Student Percent - White", color: "#e8e0d0" },
  {
    label: "Native Am.",
    key: "Student Percent - Native American",
    color: "#9a3412",
  },
  {
    label: "Pacific Isl.",
    key: "Student Percent - Native Hawaiian or Pacific Islander",
    color: "#0e7490",
  },
];

const SURVEY_FIELDS: Array<{ label: string; key: string; isRating?: boolean }> =
  [
    { label: "Safety", key: "Safety - School Percent Positive" },
    { label: "Leadership", key: "School Leadership - School Percent Positive" },
    {
      label: "Student Support",
      key: "Student Support - School Percent Positive",
    },
    {
      label: "Teaching Env",
      key: "Teaching Environment - School Percent Positive",
    },
    {
      label: "Advising",
      key: "Advising and Planning - School Percent Positive",
    },
    {
      label: "Family Inv.",
      key: "Family Involvement - School Percent Positive",
    },
    {
      label: "Family Trust",
      key: "Family-School Trust - School Percent Positive",
    },
    { label: "Communication", key: "Communication - School Percent Positive" },
    {
      label: "Learning Env",
      key: "Instruction/Learning Environment - School Percent Positive",
    },
  ];

function surveySection(s: Record<string, string>): string {
  const parentRate = s["Parent Survey Response Rate"] ?? "";
  const teacherRate = s["Teacher Survey Response Rate"] ?? "";
  const hasRates = parentRate || teacherRate;
  const rows = SURVEY_FIELDS.map(({ label, key, isRating }) => {
    const val = s[key] ?? "";
    if (!val) return "";
    return fmtRow(label, val, isRating);
  })
    .filter(Boolean)
    .join("");
  if (!rows && !hasRates) return "";
  const rateBar = hasRates
    ? `<div style="font-size:11px;color:#555;margin-bottom:4px">Resp. rate. Teachers: <b>${teacherRate || "—"}</b>&ensp;Parents: <b>${parentRate || "—"}</b></div>`
    : "";
  return `<details style="margin-top:8px"><summary style="cursor:pointer;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#888;user-select:none">Survey</summary>${rateBar}<table style="font-size:12px;border-collapse:collapse;margin-top:4px">${rows}</table></details>`;
}

function ethnicityBar(s: Record<string, string>): string {
  const vals = ETHNICITY_GROUPS.map((g) => ({
    ...g,
    pct: parseFloat(s[g.key]?.replace("%", "") ?? "") || 0,
  })).filter((g) => g.pct > 0);
  if (!vals.length) return "";
  const total = vals.reduce((sum, g) => sum + g.pct, 0);
  const segments = vals
    .map((g) => {
      const w = ((g.pct / total) * 100).toFixed(1);
      const border =
        g.color === "#e8e0d0" ? "box-shadow:inset 0 0 0 1px #bbb;" : "";
      return `<div style="width:${w}%;background:${g.color};${border}" title="${g.label}: ${g.pct.toFixed(1)}%"></div>`;
    })
    .join("");
  const labels = vals
    .map(
      (g) =>
        `<span style="display:flex;align-items:center;gap:2px;font-size:10px;white-space:nowrap"><span style="display:inline-block;width:8px;height:8px;background:${g.color};border-radius:1px;flex-shrink:0;${g.color === "#e8e0d0" ? "box-shadow:inset 0 0 0 1px #bbb;" : ""}"></span>${g.label} ${g.pct.toFixed(0)}%</span>`,
    )
    .join("");
  return `<div style="margin-top:6px"><div style="font-size:11px;color:#555;margin-bottom:3px">Ethnicity</div><div style="display:flex;border-radius:3px;overflow:hidden;height:10px;border:1px solid #e5e5e5">${segments}</div><div style="display:flex;flex-wrap:wrap;gap:4px 8px;margin-top:4px">${labels}</div></div>`;
}

const LINK_STYLE = `color:#2563eb;font-size:12px;text-decoration:none;display:inline-flex;align-items:center;gap:4px;margin-top:6px;margin-right:12px`;

function zoneInfo(zone: ZoneEntry): string {
  const props = zone.feature.properties;
  const label = props.label ? `Zone ${props.label}` : "";
  const district = props.schooldist
    ? `District ${parseInt(props.schooldist)}`
    : "";
  const remarks = props.remarks ?? "";
  const dbns = parseDbns(props.dbn).join(", ");
  return [label, district, remarks, dbns].filter(Boolean).join(" · ");
}

export function schoolZoneSection(zones: ZoneEntry[]): string {
  const elem = zones.find((z) => z.zoneType === "elementary");
  const mid = zones.find((z) => z.zoneType === "middle");
  if (!elem && !mid) return "";
  const row = (label: string, color: string, zone: ZoneEntry | undefined) =>
    `<div style="font-size:11px;margin-top:3px"><span style="color:${color}">●</span> <b>${label}:</b> ${zone ? zoneInfo(zone) : "—"}</div>`;
  return `<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;font-weight:600;color:#374151;user-select:none">School zones</summary><div style="margin-top:4px">${row("Elementary", "#2563eb", elem)}${row("Middle", "#ea580c", mid)}</div></details>`;
}

function buildPopup(
  p: (typeof __schoolPoints)[0],
  zones: ZoneEntry[] = [],
): string {
  const s = p.sqr;
  const dbnStr = p.dbn
    ? ` <span style="color:#94a3b8;font-size:10px;font-weight:normal">${p.dbn}</span>`
    : "";
  const header = `<b style="font-size:14px">${p.name}</b>${dbnStr}<br><span style="color:#555;font-size:12px">${p.type}</span><br><span style="color:#777;font-size:11px">${p.address}, ${p.city}</span>`;
  const commute = p.commute
    ? `<div style="margin-top:4px;font-size:12px">Commute: <b>${p.commute}</b></div>`
    : "";

  const dashboardLink = p.sqr
    ? `<a href="https://tools.nycenet.edu/dashboard/#dbn=${encodeURIComponent(p.dbn ?? "")}&report_type=EMS&view=City" target="_blank" rel="noopener" style="${LINK_STYLE}">&#x1F4CA; NYC Dashboard</a>`
    : "";

  const googleLink = !p.sqr
    ? `<a href="https://www.google.com/search?q=${encodeURIComponent(p.name + " NYC school")}" target="_blank" rel="noopener" style="${LINK_STYLE}">&#x1F50D; Search on Google</a>`
    : "";

  const links =
    googleLink || dashboardLink
      ? `<div style="margin-top:4px">${googleLink}${dashboardLink}</div>`
      : "";

  const closeLink = `<div style="text-align:right;margin-top:6px"><a href="#" onclick="document.querySelector('.leaflet-popup-close-button').click();return false;" style="font-size:11px;color:#94a3b8;text-decoration:none">close</a></div>`;

  if (!s)
    return `<div style="max-width:280px">${header}${commute}${links}${schoolZoneSection(zones)}${closeLink}</div>`;

  const rows = POPUP_FIELDS.map(
    ({ label, key, isRating, ratingKey, scoreRange, invert }) =>
      fmtRow(
        label,
        s[key] ?? "",
        isRating,
        ratingKey !== undefined ? (s[ratingKey] ?? "") : undefined,
        scoreRange,
        invert,
      ),
  ).join("");

  const table = `<table style="margin-top:6px;font-size:12px;border-collapse:collapse">${rows}</table>`;
  return `<div>${header}${commute}${links}${table}${academicSection(s)}${surveySection(s)}${ethnicityBar(s)}${schoolZoneSection(zones)}${closeLink}</div>`;
}

// Spiderifier for overlapping pins
const oms = new OverlappingMarkerSpiderfier(map, {
  nearbyDistance: 20,
  keepSpiderfied: true,
  legWeight: 2,
  legColors: { usual: "#94a3b8", highlighted: "#3b82f6" },
});

export function selectZonesForPoint(lat: number, lng: number): ZoneEntry[] {
  selectedSchoolZones = findZonesForPoint(lng, lat);
  for (const zone of selectedSchoolZones) {
    zone.layer.setStyle(schoolZoneHighlight(zone.color));
    const dbns = parseDbns(zone.feature.properties.dbn);
    const mainSchools = __schoolPoints.filter(
      (pt) => pt.dbn && dbns.includes(pt.dbn),
    );
    for (const mainSchool of mainSchools) {
      selectedMainSchoolCircles.push(
        L.circleMarker([mainSchool.lat, mainSchool.lng], {
          radius: 22,
          color: zone.color,
          weight: 3,
          fillOpacity: 0,
          interactive: false,
        }).addTo(map),
      );
    }
    for (const toShow of [...mainSchools, ...schoolsInZone(zone)]) {
      const entry = allMarkers.find((m) => m.p === toShow);
      if (entry && !schoolPinsLayer.hasLayer(entry.marker)) {
        if (!academicPassingMarkers.has(toShow)) entry.marker.setOpacity(0.45);
        entry.marker.addTo(map);
        selectedFadedMarkers.push(entry.marker);
      }
    }
  }
  return selectedSchoolZones;
}

oms.addListener("click", (marker: any) => {
  deselect();
  const p = marker._p;
  if (p) {
    const zones = selectZonesForPoint(p.lat, p.lng);
    marker.setPopupContent(buildPopup(p, zones));
  }
  marker.openPopup();
});

const RATING_RANK: Record<string, number> = {
  "Needs Improvement": 0,
  Fair: 1,
  Good: 2,
  Excellent: 3,
};

export const allMarkers: Array<{ marker: any; p: (typeof __schoolPoints)[0] }> =
  [];
export const passingDbns = new Set<string>();
const academicPassingMarkers = new Set<(typeof __schoolPoints)[0]>();

// Pins using SVG divIcon
__schoolPoints.forEach((p) => {
  const isMobile = window.innerWidth <= 640;
  const marker = L.marker([p.lat, p.lng], { icon: makePinIcon(p) }).bindPopup(
    buildPopup(p),
    isMobile
      ? { maxWidth: window.innerWidth - 24 }
      : { minWidth: 370, maxWidth: 420 },
  );
  marker._p = p;
  oms.addMarker(marker);
  marker.addTo(schoolPinsLayer);
  allMarkers.push({ marker, p });
});

function applyFilters(): void {
  academicPassingMarkers.clear();
  const academicValue =
    (
      document.querySelector(
        'input[name="academic-filter"]:checked',
      ) as HTMLInputElement
    )?.value ?? "any";
  const minRank =
    academicValue === "any" ? -1 : (RATING_RANK[academicValue] ?? -1);
  const hideNoData =
    (document.getElementById("hide-no-academic-data") as HTMLInputElement)
      ?.checked ?? false;

  const commuteValue =
    (
      document.querySelector(
        'input[name="commute-filter"]:checked',
      ) as HTMLInputElement
    )?.value ?? "any";
  const maxCommute = commuteValue === "any" ? Infinity : parseInt(commuteValue);
  const hideSchools =
    (document.getElementById("hide-schools") as HTMLInputElement)?.checked ??
    false;

  for (const { marker, p } of allMarkers) {
    // Commute filter
    const commuteMax = p.commuteRange.max ?? Infinity;
    const passesCommute = commuteMax <= maxCommute;

    // Academic filter
    const sqr = p.sqr;
    const elaRating =
      sqr?.["Metric Rating - Average Student Proficiency, ELA"] ?? "";
    const mathRating =
      sqr?.["Metric Rating - Average Student Proficiency, Math"] ?? "";
    const safetyRating = sqr?.["Safety and School Climate - Rating"] ?? "";
    const msPassRating =
      sqr?.[
        "Metric Rating - MS Adjusted Core Course Pass Rate of Former Students"
      ] ?? "";
    const hasData = Boolean(elaRating || mathRating);
    let passesAcademic: boolean;
    if (!hasData) {
      passesAcademic = !hideNoData;
    } else if (minRank < 0) {
      passesAcademic = true;
    } else {
      const ranks = [elaRating, mathRating, safetyRating, msPassRating]
        .filter(Boolean)
        .map((r) => RATING_RANK[r] ?? -1);
      passesAcademic = Math.min(...ranks) >= minRank;
    }

    if (passesAcademic) academicPassingMarkers.add(p);
    const passesFilters = passesCommute && passesAcademic;
    const visible = !hideSchools && passesFilters;
    if (visible && !schoolPinsLayer.hasLayer(marker)) {
      schoolPinsLayer.addLayer(marker);
    } else if (!visible && schoolPinsLayer.hasLayer(marker)) {
      schoolPinsLayer.removeLayer(marker);
    }
    if (p.dbn) {
      if (passesFilters) passingDbns.add(p.dbn);
      else passingDbns.delete(p.dbn);
    }
  }
  updateEligibleZonesLayer();
}

const searchBox = document.getElementById("search-box")!;
map.on("popupopen", () => { searchBox.style.visibility = "hidden"; });
map.on("popupclose", () => { searchBox.style.visibility = ""; });

map.on("click", (e: any) => {
  deselect();
  const overlayVal = (
    document.querySelector('input[name="overlay"]:checked') as HTMLInputElement
  )?.value;
  if (overlayVal !== "zipcodes") return;
  const zones = selectZonesForPoint(e.latlng.lat, e.latlng.lng);
  if (zones.length === 0) return;
  const closeLink = `<div style="text-align:right;margin-top:6px"><a href="#" onclick="document.querySelector('.leaflet-popup-close-button').click();return false;" style="font-size:11px;color:#94a3b8;text-decoration:none">close</a></div>`;
  L.popup()
    .setLatLng(e.latlng)
    .setContent(`<div>${schoolZoneSection(zones)}${closeLink}</div>`)
    .openOn(map);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    map.closePopup();
    deselect();
  }
});

const isMobile = window.innerWidth <= 640;

// Collapsible panel
const panel = document.getElementById("panel")!;
if (isMobile) panel.classList.add("collapsed");
document.getElementById("panel-header")!.addEventListener("click", () => {
  panel.classList.toggle("collapsed");
});

// Collapsible legend
const legendEl = document.getElementById("legend")!;
if (isMobile) legendEl.classList.add("collapsed");
document.getElementById("legend-header")!.addEventListener("click", () => {
  legendEl.classList.toggle("collapsed");
});

// Layer toggles
document.querySelectorAll('input[name="overlay"]').forEach((el) => {
  el.addEventListener("change", () => {
    const val = (
      document.querySelector(
        'input[name="overlay"]:checked',
      ) as HTMLInputElement
    ).value;
    if (val === "zipcodes") {
      map.addLayer(zipLayer);
      map.removeLayer(ringsLayer);
    } else if (val === "zones") {
      map.removeLayer(zipLayer);
      map.addLayer(ringsLayer);
    } else {
      map.removeLayer(zipLayer);
      map.removeLayer(ringsLayer);
    }
  });
});

// Filters
applyFilters();

document.querySelectorAll('input[name="academic-filter"]').forEach((el) => {
  el.addEventListener("change", applyFilters);
});
document
  .getElementById("hide-no-academic-data")!
  .addEventListener("change", applyFilters);
document.querySelectorAll('input[name="commute-filter"]').forEach((el) => {
  el.addEventListener("change", applyFilters);
});
document
  .getElementById("hide-schools")!
  .addEventListener("change", applyFilters);
