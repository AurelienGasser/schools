declare const L: any;
declare const __points: Array<{
  lat: number;
  lng: number;
  color: string;
  name: string;
  type: string;
  city: string;
  address: string;
  commute: string;
  schoolType: "elementary" | "middle" | "k8";
  qualityArms: [number, number, number];
  sqr?: Record<string, string>;
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
          style: { color: zone.color, weight: 1.5, opacity: 0.6, fillColor: zone.color, fillOpacity: 0.25 },
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

function starPoints(cx: number, cy: number, r: number, points: number, innerRatio = 0.45): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * innerRatio;
    pts.push(`${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`);
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

function armLine(cx: number, cy: number, angle: number, score: number, color: string): string {
  const rad = (angle * Math.PI) / 180;
  const len = ARM_MIN + score * (ARM_MAX - ARM_MIN);
  const x2 = cx + len * Math.cos(rad);
  const y2 = cy + len * Math.sin(rad);
  return `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
}

function makePinSvg(
  schoolType: "elementary" | "middle" | "k8",
  color: string,
  arms: [number, number, number],
): string {
  const shapeEl =
    schoolType === "elementary"
      ? `<circle cx="${CX}" cy="${CY}" r="${R}" fill="${color}" stroke="#fff" stroke-width="1.5"/>`
      : schoolType === "middle"
        ? `<polygon points="${starPoints(CX, CY, R, 5)}" fill="${color}" stroke="#fff" stroke-width="1.5"/>`
        : `<path d="${roundedStarPath(CX, CY, R)}" fill="${color}" stroke="#fff" stroke-width="1.5"/>`;
  const armLines = arms
    .map((score, i) => armLine(CX, CY, ARM_ANGLES[i], score, ARM_COLORS[i]))
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">${armLines}${shapeEl}</svg>`;
}

function makePinIcon(p: typeof __points[0]): any {
  return L.divIcon({
    html: makePinSvg(p.schoolType, p.color, p.qualityArms),
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

function ratingBadge(rating: string): string {
  const colors: Record<string, string> = {
    "Exceeding Target": "#15803d",
    "Meeting Target": "#16a34a",
    "Approaching Target": "#ca8a04",
    "Fair": "#ea580c",
    "Needs Improvement": "#dc2626",
  };
  const bg = colors[rating] ?? "#6b7280";
  return `<span style="background:${bg};color:#fff;padding:1px 5px;border-radius:3px;font-size:11px;white-space:nowrap">${rating}</span>`;
}

function fmtRow(label: string, value: string, rating?: string): string {
  if (!value && !rating) return "";
  return `<tr><td style="color:#555;padding-right:8px;white-space:nowrap">${label}</td><td>${value}${rating ? " " + ratingBadge(rating) : ""}</td></tr>`;
}

const ETHNICITY_GROUPS = [
  { label: "Hispanic", key: "Student Percent - Hispanic", color: "#c2703e" },
  { label: "Black", key: "Student Percent - Black", color: "#5c3317" },
  { label: "Asian", key: "Student Percent - Asian", color: "#e8b84b" },
  { label: "White", key: "Student Percent - White", color: "#e8e0d0" },
  { label: "Native Am.", key: "Student Percent - Native American", color: "#9a3412" },
  { label: "Pacific Isl.", key: "Student Percent - Native Hawaiian or Pacific Islander", color: "#0e7490" },
];

function ethnicityBar(s: Record<string, string>): string {
  const vals = ETHNICITY_GROUPS
    .map((g) => ({ ...g, pct: parseFloat(s[g.key]?.replace("%", "") ?? "") || 0 }))
    .filter((g) => g.pct > 0);
  if (!vals.length) return "";
  const total = vals.reduce((sum, g) => sum + g.pct, 0);
  const segments = vals
    .map((g) => {
      const w = ((g.pct / total) * 100).toFixed(1);
      const border = g.color === "#e8e0d0" ? "box-shadow:inset 0 0 0 1px #bbb;" : "";
      return `<div style="width:${w}%;background:${g.color};${border}" title="${g.label}: ${g.pct.toFixed(1)}%"></div>`;
    })
    .join("");
  const labels = vals
    .map((g) => `<span style="display:flex;align-items:center;gap:2px;font-size:10px;white-space:nowrap"><span style="display:inline-block;width:8px;height:8px;background:${g.color};border-radius:1px;flex-shrink:0;${g.color === "#e8e0d0" ? "box-shadow:inset 0 0 0 1px #bbb;" : ""}"></span>${g.label} ${g.pct.toFixed(0)}%</span>`)
    .join("");
  return `<div style="margin-top:6px"><div style="font-size:11px;color:#555;margin-bottom:3px">Ethnicity</div><div style="display:flex;border-radius:3px;overflow:hidden;height:10px;border:1px solid #e5e5e5">${segments}</div><div style="display:flex;flex-wrap:wrap;gap:4px 8px;margin-top:4px">${labels}</div></div>`;
}

function buildPopup(p: typeof __points[0]): string {
  const s = p.sqr;
  const header = `<b style="font-size:14px">${p.name}</b><br><span style="color:#555;font-size:12px">${p.type}</span><br><span style="color:#777;font-size:11px">${p.address}, ${p.city}</span>`;
  const commute = p.commute ? `<div style="margin-top:4px;font-size:12px">Commute: <b>${p.commute}</b></div>` : "";
  if (!s) return `<div style="max-width:280px">${header}${commute}</div>`;

  const rows = [
    fmtRow("Enrollment", s["Enrollment"]),
    fmtRow("Attendance", s["Average Student Attendance"]),
    fmtRow(">90% Att.", s["Percentage of Students with >90% Attendance"], s["Metric Rating - Percentage of Students with >90% Attendance"]),
    fmtRow("ELA", s["Metric Value - Percentage of Students at Level 3 or 4, ELA, Grade 8"] || s["Metric Value - Percentage of Students at Level 3 or 4, ELA, Grade 5"] || s["Metric Value - Percentage of Students at Level 3 or 4, ELA, Grade 3"], s["Metric Rating - Percentage of Students at Level 3 or 4, ELA"]),
    fmtRow("Math", s["Metric Value - Percentage of Students at Level 3 or 4, Math, Grade 8"] || s["Metric Value - Percentage of Students at Level 3 or 4, Math, Grade 5"] || s["Metric Value - Percentage of Students at Level 3 or 4, Math, Grade 3"], s["Metric Rating - Percentage of Students at Level 3 or 4, Math"]),
    fmtRow("I&P Rating", s["Instruction and Performance - Score"], s["Instruction and Performance - Rating"]),
    fmtRow("Impact Score", s["Impact Score"]),
    fmtRow("Econ Need", s["Economic Need Index"]),
    fmtRow("Temp Housing", s["Percent in Temp Housing"]),
  ].filter(Boolean).join("");

  const table = rows ? `<table style="margin-top:6px;font-size:12px;border-collapse:collapse">${rows}</table>` : "";
  const ethBar = ethnicityBar(s);
  return `<div style="max-width:300px">${header}${commute}${table}${ethBar}</div>`;
}

// Pins using SVG divIcon
__points.forEach((p, i) => {
  L.marker([p.lat, p.lng], { icon: makePinIcon(p) })
    .bindPopup(buildPopup(p), { maxWidth: 320 })
    .on("click", () => {
      deselect();
      selectedZone = zones[i];
      selectedZone.setStyle({ opacity: 0.85 });
    })
    .addTo(pinLayer);
});

map.on("click", deselect);

// Collapsible panel
const panel = document.getElementById("panel")!;
document.getElementById("panel-header")!.addEventListener("click", () => {
  panel.classList.toggle("collapsed");
});

// Collapsible legend
const legendEl = document.getElementById("legend")!;
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

// Zone mode radio buttons
document.querySelectorAll('input[name="zone-mode"]').forEach((el) => {
  el.addEventListener("change", (e) => {
    const value = (e.target as HTMLInputElement).value as "none" | "rings" | "cumulative";
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
