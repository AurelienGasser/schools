declare const L: any;
declare const __points: Array<{
  lat: number;
  lng: number;
  color: string;
  name: string;
  type: string;
  city: string;
  address: string;
}>;

const map = L.map("map").setView([40.7128, -74.006], 10);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
}).addTo(map);

for (const p of __points) {
  L.circleMarker([p.lat, p.lng], {
    radius: 5,
    fillColor: p.color,
    color: "#fff",
    weight: 1,
    opacity: 1,
    fillOpacity: 0.85,
  })
    .bindPopup(`<b>${p.name}</b><br>${p.type}<br>${p.address}, ${p.city}`)
    .addTo(map);
}
