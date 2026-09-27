import {
  map,
  allZones,
  passingDbns,
  parseDbns,
} from "./map-client.js";

declare const L: any;

export const eligibleZonesLayer = L.geoJSON(null, {
  style: {
    color: "#2563eb",
    weight: 2.5,
    opacity: 0.9,
    fillColor: "#2563eb",
    fillOpacity: 0.35,
  },
  interactive: false,
});

export function updateEligibleZonesLayer(): void {
  const cb = document.getElementById("show-eligible-zones") as HTMLInputElement;
  if (!cb?.checked) return;
  eligibleZonesLayer.clearLayers();
  for (const z of allZones) {
    if (z.zoneType !== "elementary") continue;
    if (parseDbns(z.feature.properties.dbn).some((d) => passingDbns.has(d)))
      eligibleZonesLayer.addData(z.feature);
  }
}

(document.getElementById("show-eligible-zones") as HTMLInputElement).addEventListener("change", (e) => {
  if ((e.target as HTMLInputElement).checked) {
    eligibleZonesLayer.addTo(map);
    updateEligibleZonesLayer();
  } else {
    map.removeLayer(eligibleZonesLayer);
  }
});
