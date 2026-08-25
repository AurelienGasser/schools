"use strict";
const MILES_TO_METERS = 1609.34;
const map = L.map("map").setView([40.6928, -73.956], 13);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
}).addTo(map);
const circleLayer = L.layerGroup();
const pinLayer = L.layerGroup().addTo(map);
function buildLayer(zones) {
    const layer = L.layerGroup();
    for (const zone of zones) {
        for (const entry of zone.entries) {
            L.geoJSON({ type: "MultiPolygon", coordinates: entry.coordinates }, {
                style: { color: zone.color, weight: 1.5, opacity: 0.6, fillColor: zone.color, fillOpacity: 0.25 },
                interactive: false,
            }).addTo(layer);
        }
    }
    return layer;
}
const polygonLayers = {
    rings: buildLayer(__polygonSets.rings),
    cumulative: buildLayer(__polygonSets.cumulative),
};
let activePolygonLayer = polygonLayers.rings;
map.addLayer(activePolygonLayer);
// Geo-referenced coverage zones
const zones = __points.map((p) => L.circle([p.lat, p.lng], {
    radius: 0.5 * MILES_TO_METERS,
    color: p.color,
    weight: 1.5,
    fillColor: p.color,
    fillOpacity: 0.08,
    opacity: 0.2,
    interactive: false,
}).addTo(circleLayer));
let selectedZone = null;
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
function starPoints(cx, cy, r, points, innerRatio = 0.45) {
    const pts = [];
    for (let i = 0; i < points * 2; i++) {
        const angle = (Math.PI / points) * i - Math.PI / 2;
        const radius = i % 2 === 0 ? r : r * innerRatio;
        pts.push(`${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`);
    }
    return pts.join(" ");
}
function roundedStarPath(cx, cy, r) {
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
function armLine(cx, cy, angle, score, color) {
    const rad = (angle * Math.PI) / 180;
    const len = ARM_MIN + score * (ARM_MAX - ARM_MIN);
    const x2 = cx + len * Math.cos(rad);
    const y2 = cy + len * Math.sin(rad);
    return `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
}
function makePinSvg(schoolType, color, arms) {
    const shapeEl = schoolType === "elementary"
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
function makePinIcon(p) {
    const half = PIN_SIZE / 2;
    return L.divIcon({
        html: makePinSvg(p.schoolType, p.color, p.qualityArms),
        className: "",
        iconSize: [PIN_SIZE, PIN_SIZE],
        iconAnchor: [half, half],
        popupAnchor: [0, -half - 2],
    });
}
function ratingBadge(rating) {
    const colors = {
        "Exceeding Target": "#15803d",
        "Meeting Target": "#16a34a",
        "Approaching Target": "#ca8a04",
        "Fair": "#ea580c",
        "Needs Improvement": "#dc2626",
    };
    const bg = colors[rating] ?? "#6b7280";
    return `<span style="background:${bg};color:#fff;padding:1px 5px;border-radius:3px;font-size:11px;white-space:nowrap">${rating}</span>`;
}
function fmtRow(label, value, isRating = false) {
    const display = isRating ? (value ? ratingBadge(value) : "—") : (value || "—");
    return `<tr><td style="color:#555;padding-right:8px;white-space:nowrap;vertical-align:top">${label}</td><td>${display}</td></tr>`;
}
const POPUP_FIELDS = [
    { label: "School Type", key: "School Type" },
    { label: "Enrollment", key: "Enrollment" },
    { label: "Attendance", key: "Average Student Attendance" },
    { label: ">90% Attendance", key: "Percentage of Students with >90% Attendance" },
    { label: ">90% Rating", key: "Metric Rating - Percentage of Students with >90% Attendance", isRating: true },
    { label: "I&P Score", key: "Instruction and Performance - Score" },
    { label: "I&P Rating", key: "Instruction and Performance - Rating", isRating: true },
    { label: "Safety Rating", key: "Safety and School Climate - Rating", isRating: true },
    { label: "Safety %", key: "Safety - School Percent Positive" },
    { label: "Communication %", key: "Communication - School Percent Positive" },
    { label: "Teaching Env %", key: "Teaching Environment - School Percent Positive" },
    { label: "Learning Env %", key: "Instruction/Learning Environment - School Percent Positive" },
    { label: "Family Inv. %", key: "Family Involvement - School Percent Positive" },
    { label: "Teacher Exp.", key: "Percent of teachers with 3 or more years of experience" },
    { label: "Principal Yrs.", key: "Years of principal experience at this school" },
];
const ETHNICITY_GROUPS = [
    { label: "Hispanic", key: "Student Percent - Hispanic", color: "#c2703e" },
    { label: "Black", key: "Student Percent - Black", color: "#5c3317" },
    { label: "Asian", key: "Student Percent - Asian", color: "#e8b84b" },
    { label: "White", key: "Student Percent - White", color: "#e8e0d0" },
    { label: "Native Am.", key: "Student Percent - Native American", color: "#9a3412" },
    { label: "Pacific Isl.", key: "Student Percent - Native Hawaiian or Pacific Islander", color: "#0e7490" },
];
function ethnicityBar(s) {
    const vals = ETHNICITY_GROUPS
        .map((g) => ({ ...g, pct: parseFloat(s[g.key]?.replace("%", "") ?? "") || 0 }))
        .filter((g) => g.pct > 0);
    if (!vals.length)
        return "";
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
const LINK_STYLE = `color:#2563eb;font-size:12px;text-decoration:none;display:inline-flex;align-items:center;gap:4px;margin-top:6px;margin-right:12px`;
function buildPopup(p) {
    const s = p.sqr;
    const header = `<b style="font-size:14px">${p.name}</b><br><span style="color:#555;font-size:12px">${p.type}</span><br><span style="color:#777;font-size:11px">${p.address}, ${p.city}</span>`;
    const commute = p.commute ? `<div style="margin-top:4px;font-size:12px">Commute: <b>${p.commute}</b></div>` : "";
    const googleLink = p.schoolType === "unknown"
        ? `<a href="https://www.google.com/search?q=${encodeURIComponent(p.name + " NYC school")}" target="_blank" rel="noopener" style="${LINK_STYLE}">&#x1F50D; Search on Google</a>`
        : "";
    const dashboardLink = s && p.dbn
        ? `<a href="https://tools.nycenet.edu/dashboard/#dbn=${encodeURIComponent(p.dbn)}&report_type=EMS&view=City" target="_blank" rel="noopener" style="${LINK_STYLE}">&#x1F4CA; NYC Dashboard</a>`
        : "";
    const links = (googleLink || dashboardLink)
        ? `<div style="margin-top:4px">${googleLink}${dashboardLink}</div>`
        : "";
    if (!s)
        return `<div style="max-width:280px">${header}${commute}${links}</div>`;
    const rows = POPUP_FIELDS.map(({ label, key, isRating }) => fmtRow(label, s[key] ?? "", isRating)).join("");
    const table = `<table style="margin-top:6px;font-size:12px;border-collapse:collapse">${rows}</table>`;
    return `<div style="max-width:300px">${header}${commute}${links}${table}${ethnicityBar(s)}</div>`;
}
// Spiderifier for overlapping pins
const oms = new OverlappingMarkerSpiderfier(map, {
    nearbyDistance: 20,
    keepSpiderfied: true,
    legWeight: 2,
    legColors: { usual: "#94a3b8", highlighted: "#3b82f6" },
});
oms.addListener("click", (marker) => {
    deselect();
    selectedZone = marker._zone ?? null;
    if (selectedZone)
        selectedZone.setStyle({ opacity: 0.85 });
    marker.openPopup();
});
// Pins using SVG divIcon
__points.forEach((p, i) => {
    const marker = L.marker([p.lat, p.lng], { icon: makePinIcon(p) })
        .bindPopup(buildPopup(p), { maxWidth: 320 });
    marker._zone = zones[i];
    oms.addMarker(marker);
    marker.addTo(pinLayer);
});
map.on("click", deselect);
const isMobile = window.innerWidth <= 640;
// Collapsible panel
const panel = document.getElementById("panel");
if (isMobile)
    panel.classList.add("collapsed");
document.getElementById("panel-header").addEventListener("click", () => {
    panel.classList.toggle("collapsed");
});
// Collapsible legend
const legendEl = document.getElementById("legend");
if (isMobile)
    legendEl.classList.add("collapsed");
document.getElementById("legend-header").addEventListener("click", () => {
    legendEl.classList.toggle("collapsed");
});
// Layer toggles
for (const [id, layer] of [
    ["toggle-pins", pinLayer],
    ["toggle-circles", circleLayer],
]) {
    document.getElementById(id).addEventListener("change", (e) => {
        if (e.target.checked)
            map.addLayer(layer);
        else
            map.removeLayer(layer);
    });
}
// Zone mode radio buttons
document.querySelectorAll('input[name="zone-mode"]').forEach((el) => {
    el.addEventListener("change", (e) => {
        const value = e.target.value;
        if (activePolygonLayer)
            map.removeLayer(activePolygonLayer);
        activePolygonLayer = value === "none" ? null : polygonLayers[value];
        if (activePolygonLayer)
            map.addLayer(activePolygonLayer);
    });
});
// Radius slider
const slider = document.getElementById("radius-slider");
const radiusLabel = document.getElementById("radius-value");
slider.addEventListener("input", () => {
    const miles = Number(slider.value);
    radiusLabel.textContent = `${miles} mi`;
    const meters = miles * MILES_TO_METERS;
    for (const z of zones)
        z.setRadius(meters);
});
