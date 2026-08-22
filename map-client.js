"use strict";
const MILES_TO_METERS = 1609.34;
const map = L.map("map").setView([40.7128, -74.006], 10);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
}).addTo(map);
// Geo-referenced coverage zones (radius in meters, scales with zoom)
const zones = __points.map((p) => L.circle([p.lat, p.lng], {
    radius: 0.5 * MILES_TO_METERS,
    color: p.color,
    weight: 1.5,
    fillColor: p.color,
    fillOpacity: 0.08,
    opacity: 0.2,
    interactive: false,
}).addTo(map));
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
        .addTo(map);
});
map.on("click", deselect);
// Collapsible panel
const panel = document.getElementById("panel");
document.getElementById("panel-header").addEventListener("click", () => {
    panel.classList.toggle("collapsed");
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
