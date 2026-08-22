"use strict";
const MILES_TO_METERS = 1609.34;
const map = L.map("map").setView([40.7128, -74.006], 10);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
}).addTo(map);
const polygonLayer = L.layerGroup().addTo(map);
const circleLayer = L.layerGroup().addTo(map);
const pinLayer = L.layerGroup().addTo(map);
// MultiPolygon boundaries from data/polygons/
for (const poly of __polygons) {
    L.geoJSON({ type: "MultiPolygon", coordinates: poly.coordinates }, {
        style: {
            color: poly.color,
            weight: 2,
            opacity: 0.7,
            fillColor: poly.color,
            fillOpacity: 0.1,
        },
    })
        .bindPopup(poly.label)
        .addTo(polygonLayer);
}
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
        .bindPopup(`<b>${p.name}</b><br>${p.type}<br>${p.address}, ${p.city}`)
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
const toggles = [
    ["toggle-pins", pinLayer],
    ["toggle-circles", circleLayer],
    ["toggle-polygons", polygonLayer],
];
for (const [id, layer] of toggles) {
    document.getElementById(id).addEventListener("change", (e) => {
        if (e.target.checked)
            map.addLayer(layer);
        else
            map.removeLayer(layer);
    });
}
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
