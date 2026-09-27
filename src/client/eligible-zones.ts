import {
  map,
  allZones,
  allMarkers,
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

const unzonedElemLayer = L.geoJSON(null, {
  style: {
    color: "#7c3aed",
    weight: 2.5,
    opacity: 0.9,
    fillColor: "#7c3aed",
    fillOpacity: 0.35,
  },
  interactive: false,
});

(document.getElementById("show-unzoned-elem-zones") as HTMLInputElement).addEventListener("change", (e) => {
  if ((e.target as HTMLInputElement).checked) {
    unzonedElemLayer.clearLayers();
    for (const z of allZones) {
      if (z.zoneType !== "elementary") continue;
      if (parseDbns(z.feature.properties.dbn).length === 0)
        unzonedElemLayer.addData(z.feature);
    }
    unzonedElemLayer.addTo(map);
  } else {
    map.removeLayer(unzonedElemLayer);
  }
});

const missingSchoolElemLayer = L.geoJSON(null, {
  style: {
    color: "#dc2626",
    weight: 2.5,
    opacity: 0.9,
    fillColor: "#dc2626",
    fillOpacity: 0.35,
  },
  interactive: false,
});

(document.getElementById("show-missing-school-elem-zones") as HTMLInputElement).addEventListener("change", (e) => {
  if ((e.target as HTMLInputElement).checked) {
    const knownDbns = new Set(allMarkers.map(({ p }) => p.dbn).filter(Boolean));
    missingSchoolElemLayer.clearLayers();
    for (const z of allZones) {
      if (z.zoneType !== "elementary") continue;
      const dbns = parseDbns(z.feature.properties.dbn);
      if (dbns.length > 0 && !dbns.some((d) => knownDbns.has(d)))
        missingSchoolElemLayer.addData(z.feature);
    }
    missingSchoolElemLayer.addTo(map);
  } else {
    map.removeLayer(missingSchoolElemLayer);
  }
});
