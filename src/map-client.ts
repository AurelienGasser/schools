declare const L: any;
declare const OverlappingMarkerSpiderfier: any;
declare const __points: Array<{
  lat: number;
  lng: number;
  color: string;
  name: string;
  type: string;
  city: string;
  address: string;
  commute: string;
  schoolType: "elementary" | "middle" | "k8" | "unknown";
  qualityArms: [number, number, number];
  sqr?: Record<string, string>;
  dbn?: string;
}>;
type ZoneSet = Array<{
  name: string;
  minutes: number;
  color: string;
  entries: Array<{ coordinates: number[][][][] }>;
}>;
declare const __polygonSets: { rings: ZoneSet; cumulative: ZoneSet };

const MILES_TO_METERS = 1609.34;

const map = L.map("map").setView([40.6928, -73.956], 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
}).addTo(map);

const circleLayer = L.layerGroup();
const pinLayer = L.layerGroup().addTo(map);

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

const polygonLayers = {
  rings: buildLayer(__polygonSets.rings),
  cumulative: buildLayer(__polygonSets.cumulative),
};
let activePolygonLayer: any = polygonLayers.rings;
map.addLayer(activePolygonLayer);

// Geo-referenced coverage zones
const zones = __points.map((p) =>
  L.circle([p.lat, p.lng], {
    radius: 0.5 * MILES_TO_METERS,
    color: p.color,
    weight: 1.5,
    fillColor: p.color,
    fillOpacity: 0.08,
    opacity: 0.2,
    interactive: false,
  }).addTo(circleLayer),
);

let selectedZone: any = null;

const deselect = () => {
  if (selectedZone) {
    selectedZone.setStyle({ opacity: 0.2 });
    selectedZone = null;
  }
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

const ARM_ANGLES = [-90, 30, 150]; // 12, 4, 8 o'clock in degrees
const ARM_COLORS = ["#16a34a", "#ea580c", "#dc2626"];
const ARM_MAX = R + 6; // max arm length extends beyond shape edge
const ARM_MIN = 3;

function armLine(
  cx: number,
  cy: number,
  angle: number,
  score: number,
  color: string,
): string {
  const rad = (angle * Math.PI) / 180;
  const len = ARM_MIN + score * (ARM_MAX - ARM_MIN);
  const x2 = cx + len * Math.cos(rad);
  const y2 = cy + len * Math.sin(rad);
  return `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
}

function makePinSvg(
  schoolType: "elementary" | "middle" | "k8" | "unknown",
  color: string,
  arms: [number, number, number],
): string {
  const shapeEl =
    schoolType === "elementary"
      ? `<circle cx="${CX}" cy="${CY}" r="${R}" fill="${color}" stroke="#fff" stroke-width="1.5"/>`
      : schoolType === "middle"
        ? `<polygon points="${starPoints(CX, CY, R, 5)}" fill="${color}" stroke="#fff" stroke-width="1.5"/>`
        : schoolType === "k8"
          ? `<path d="${roundedStarPath(CX, CY, R)}" fill="${color}" stroke="#fff" stroke-width="1.5"/>`
          : `<polygon points="${CX},${CY - R} ${CX + R},${CY} ${CX},${CY + R} ${CX - R},${CY}" fill="${color}" stroke="#fff" stroke-width="1.5"/>`;
  const armLines = arms
    .map((score, i) => armLine(CX, CY, ARM_ANGLES[i], score, ARM_COLORS[i]))
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">${armLines}${shapeEl}</svg>`;
}

const PIN_SIZE = window.innerWidth <= 640 ? 34 : 28;

function makePinIcon(p: (typeof __points)[0]): any {
  const half = PIN_SIZE / 2;
  return L.divIcon({
    html: makePinSvg(p.schoolType, p.color, p.qualityArms),
    className: "",
    iconSize: [PIN_SIZE, PIN_SIZE],
    iconAnchor: [half, half],
    popupAnchor: [0, -half - 2],
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
    return pctBar(Math.min(100, Math.max(0, parseFloat(m[1]))), value.trim(), invert);
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
  return `<div style="margin-top:8px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#888;margin-bottom:4px">Survey</div>${rateBar}<table style="font-size:12px;border-collapse:collapse">${rows}</table></div>`;
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

function buildPopup(p: (typeof __points)[0]): string {
  const s = p.sqr;
  const header = `<b style="font-size:14px">${p.name}</b><br><span style="color:#555;font-size:12px">${p.type}</span><br><span style="color:#777;font-size:11px">${p.address}, ${p.city}</span>`;
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

  if (!s)
    return `<div style="max-width:280px">${header}${commute}${links}</div>`;

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
  return `<div>${header}${commute}${links}${table}${academicSection(s)}${surveySection(s)}${ethnicityBar(s)}</div>`;
}

// Spiderifier for overlapping pins
const oms = new OverlappingMarkerSpiderfier(map, {
  nearbyDistance: 20,
  keepSpiderfied: true,
  legWeight: 2,
  legColors: { usual: "#94a3b8", highlighted: "#3b82f6" },
});

oms.addListener("click", (marker: any) => {
  deselect();
  selectedZone = marker._zone ?? null;
  if (selectedZone) selectedZone.setStyle({ opacity: 0.85 });
  marker.openPopup();
});

const RATING_RANK: Record<string, number> = {
  "Needs Improvement": 0,
  Fair: 1,
  Good: 2,
  Excellent: 3,
};

const allMarkers: Array<{ marker: any; p: (typeof __points)[0] }> = [];

// Pins using SVG divIcon
__points.forEach((p, i) => {
  const marker = L.marker([p.lat, p.lng], { icon: makePinIcon(p) }).bindPopup(
    buildPopup(p),
    { minWidth: 370 },
  );
  marker._zone = zones[i];
  oms.addMarker(marker);
  marker.addTo(pinLayer);
  allMarkers.push({ marker, p });
});

function applyAcademicFilter(minRating: string, hideNoData: boolean): void {
  const minRank = minRating === "any" ? -1 : (RATING_RANK[minRating] ?? -1);
  for (const { marker, p } of allMarkers) {
    const sqr = p.sqr;
    const elaRating = sqr?.["Metric Rating - Average Student Proficiency, ELA"] ?? "";
    const mathRating = sqr?.["Metric Rating - Average Student Proficiency, Math"] ?? "";
    const hasData = Boolean(elaRating || mathRating);

    let visible: boolean;
    if (!hasData) {
      visible = !hideNoData;
    } else if (minRank < 0) {
      visible = true;
    } else {
      const ranks = [elaRating, mathRating]
        .filter(Boolean)
        .map((r) => RATING_RANK[r] ?? -1);
      const worstRank = Math.min(...ranks);
      visible = worstRank >= minRank;
    }

    if (visible && !pinLayer.hasLayer(marker)) {
      pinLayer.addLayer(marker);
    } else if (!visible && pinLayer.hasLayer(marker)) {
      pinLayer.removeLayer(marker);
    }
  }
}

map.on("click", deselect);

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
for (const [id, layer] of [
  ["toggle-pins", pinLayer],
  ["toggle-circles", circleLayer],
] as Array<[string, any]>) {
  document.getElementById(id)!.addEventListener("change", (e) => {
    if ((e.target as HTMLInputElement).checked) map.addLayer(layer);
    else map.removeLayer(layer);
  });
}

// Academic filter
const getAcademicFilter = (): string =>
  (document.querySelector('input[name="academic-filter"]:checked') as HTMLInputElement)?.value ?? "any";
const getHideNoData = (): boolean =>
  (document.getElementById("hide-no-academic-data") as HTMLInputElement)?.checked ?? false;

applyAcademicFilter(getAcademicFilter(), getHideNoData());

document.querySelectorAll('input[name="academic-filter"]').forEach((el) => {
  el.addEventListener("change", () => applyAcademicFilter(getAcademicFilter(), getHideNoData()));
});
document.getElementById("hide-no-academic-data")!.addEventListener("change", () => {
  applyAcademicFilter(getAcademicFilter(), getHideNoData());
});

// Zone mode radio buttons
document.querySelectorAll('input[name="zone-mode"]').forEach((el) => {
  el.addEventListener("change", (e) => {
    const value = (e.target as HTMLInputElement).value as
      | "none"
      | "rings"
      | "cumulative";
    if (activePolygonLayer) map.removeLayer(activePolygonLayer);
    activePolygonLayer = value === "none" ? null : polygonLayers[value];
    if (activePolygonLayer) map.addLayer(activePolygonLayer);
  });
});

// Radius slider
const slider = document.getElementById("radius-slider") as HTMLInputElement;
const radiusLabel = document.getElementById("radius-value")!;
slider.addEventListener("input", () => {
  const miles = Number(slider.value);
  radiusLabel.textContent = `${miles} mi`;
  const meters = miles * MILES_TO_METERS;
  for (const z of zones) z.setRadius(meters);
});
