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
// Geo-referenced coverage zones (radius in meters, scales with zoom)
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
// Fixed pixel pins
__points.forEach((p, i) => {
    L.circleMarker([p.lat, p.lng], {
        radius: 5,
        fillColor: p.color,
        color: "#fff",
        weight: 1,
        opacity: 1,
        fillOpacity: 0.85,
    })
        .bindPopup(`<b>${p.name}</b><br>${p.type}<br>${p.address}, ${p.city}${p.commute ? `<br>Commute: <b>${p.commute}</b>` : ""}`)
        .on("click", () => {
        deselect();
        selectedZone = zones[i];
        selectedZone.setStyle({ opacity: 0.85 });
    })
        .addTo(pinLayer);
});
map.on("click", deselect);
// Collapsible panel
const panel = document.getElementById("panel");
document.getElementById("panel-header").addEventListener("click", () => {
    panel.classList.toggle("collapsed");
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
