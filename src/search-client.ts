declare const L: any;
declare const map: any;
declare function deselect(): void;
declare function selectZonesForPoint(lat: number, lng: number): any[];
declare function schoolZoneSection(zones: any[]): string;

const searchInput = document.getElementById("search-input") as HTMLInputElement;
searchInput.placeholder = "Search address…";

let searchMarker: any = null;

async function handleSearch() {
  const val = searchInput.value.trim();
  if (!val) return;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=1&countrycodes=us&viewbox=-74.26,40.92,-73.68,40.49&bounded=0`;
    const resp = await fetch(url, {
      headers: { "Accept-Language": "en", "User-Agent": "aureliengasser-schools" },
    });
    const data = await resp.json();
    const result = data[0];
    if (!result) {
      searchInput.select();
      return;
    }
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    if (searchMarker) map.removeLayer(searchMarker);
    deselect();
    const zones = selectZonesForPoint(lat, lng);
    const closeLink = `<div style="text-align:right;margin-top:6px"><a href="#" onclick="document.querySelector('.leaflet-popup-close-button').click();return false;" style="font-size:11px;color:#94a3b8;text-decoration:none">close</a></div>`;
    const popupHtml = `<div style="max-width:280px"><b style="font-size:13px">${result.display_name}</b>${schoolZoneSection(zones)}${closeLink}</div>`;
    searchMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        html: `<div style="width:14px;height:14px;background:#ef4444;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
        className: "",
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
    })
      .bindPopup(popupHtml)
      .addTo(map)
      .openPopup();
    map.setView([lat, lng], 15);
    searchInput.value = "";
  } catch {
    /* network error — silently ignore */
  }
}

document.getElementById("search-btn")!.addEventListener("click", handleSearch);
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSearch();
});
