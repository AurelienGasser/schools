declare const L: any;
declare const map: any;

const GEOCODE_KEY_LS = "mapbox_api_key";
let geocodeKey = localStorage.getItem(GEOCODE_KEY_LS) ?? "";

const searchInput = document.getElementById("search-input") as HTMLInputElement;
const searchKeyBtn = document.getElementById(
  "search-key-btn",
) as HTMLButtonElement;

function updateSearchPlaceholder() {
  searchInput.placeholder = geocodeKey ? "Search address…" : "Enter Mapbox API key…";
  searchInput.type = geocodeKey ? "text" : "password";
  searchKeyBtn.style.display = geocodeKey ? "" : "none";
}
updateSearchPlaceholder();

let searchMarker: any = null;

async function handleSearch() {
  const val = searchInput.value.trim();
  if (!val) return;
  if (!geocodeKey) {
    geocodeKey = val;
    localStorage.setItem(GEOCODE_KEY_LS, geocodeKey);
    searchInput.value = "";
    updateSearchPlaceholder();
    return;
  }
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(val)}.json?access_token=${geocodeKey}&types=address,place,poi&country=US&proximity=-73.956,40.693`;
    const resp = await fetch(url);
    if (resp.status === 401 || resp.status === 403) {
      geocodeKey = "";
      localStorage.removeItem(GEOCODE_KEY_LS);
      updateSearchPlaceholder();
      searchInput.value = "";
      return;
    }
    const data = await resp.json();
    const feature = data.features?.[0];
    if (!feature) {
      searchInput.select();
      return;
    }
    const [lng, lat] = feature.center;
    if (searchMarker) map.removeLayer(searchMarker);
    searchMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        html: `<div style="width:14px;height:14px;background:#ef4444;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
        className: "",
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
    })
      .bindPopup(feature.place_name)
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

searchKeyBtn.addEventListener("click", () => {
  geocodeKey = "";
  localStorage.removeItem(GEOCODE_KEY_LS);
  searchInput.value = "";
  updateSearchPlaceholder();
});
