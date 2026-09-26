export function pointInRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
            inside = !inside;
    }
    return inside;
}
export function pointInGeom(lng, lat, geom) {
    const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
    return polys.some((poly) => pointInRing(lng, lat, poly[0]) &&
        poly.slice(1).every((hole) => !pointInRing(lng, lat, hole)));
}
export function pointInMultiPolygon(x, y, coords) {
    return coords.some((polygon) => pointInRing(x, y, polygon[0]) &&
        polygon.slice(1).every((hole) => !pointInRing(x, y, hole)));
}
