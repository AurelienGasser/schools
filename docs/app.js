"use strict";
(() => {
  // src/common/geometry.ts
  function pointInRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi)
        inside = !inside;
    }
    return inside;
  }
  function pointInGeom(lng, lat, geom) {
    const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
    return polys.some(
      (poly) => pointInRing(lng, lat, poly[0]) && poly.slice(1).every((hole) => !pointInRing(lng, lat, hole))
    );
  }

  // src/common/helpers.ts
  function parseDbns(dbn) {
    return (dbn ?? "").split(",").map((d) => d.trim()).filter(Boolean);
  }

  // src/client/eligible-zones.ts
  var eligibleZonesLayer = L.geoJSON(null, {
    style: {
      color: "#2563eb",
      weight: 2.5,
      opacity: 0.9,
      fillColor: "#2563eb",
      fillOpacity: 0.35
    },
    interactive: false
  });
  function updateEligibleZonesLayer() {
    const cb = document.getElementById("show-eligible-zones");
    if (!cb?.checked) return;
    eligibleZonesLayer.clearLayers();
    for (const z of allZones) {
      if (z.zoneType !== "elementary") continue;
      if (parseDbns(z.feature.properties.dbn).some((d) => passingDbns.has(d)))
        eligibleZonesLayer.addData(z.feature);
    }
  }
  document.getElementById("show-eligible-zones").addEventListener("change", (e) => {
    if (e.target.checked) {
      eligibleZonesLayer.addTo(map);
      updateEligibleZonesLayer();
    } else {
      map.removeLayer(eligibleZonesLayer);
    }
  });
  var noZonedSchoolLayer = L.geoJSON(null, {
    style: {
      color: "#7c3aed",
      weight: 2.5,
      opacity: 0.9,
      fillColor: "#7c3aed",
      fillOpacity: 0.35
    },
    interactive: false
  });
  document.getElementById("show-no-zoned-school-zones").addEventListener("change", (e) => {
    if (e.target.checked) {
      noZonedSchoolLayer.clearLayers();
      for (const z of allZones) {
        if (z.zoneType !== "elementary") continue;
        if (parseDbns(z.feature.properties.dbn).length === 0)
          noZonedSchoolLayer.addData(z.feature);
      }
      noZonedSchoolLayer.addTo(map);
    } else {
      map.removeLayer(noZonedSchoolLayer);
    }
  });
  var zonedSchoolNotFoundLayer = L.geoJSON(null, {
    style: {
      color: "#dc2626",
      weight: 2.5,
      opacity: 0.9,
      fillColor: "#dc2626",
      fillOpacity: 0.35
    },
    interactive: false
  });
  document.getElementById("show-zoned-school-not-found-zones").addEventListener("change", (e) => {
    if (e.target.checked) {
      const knownDbns = new Set(allMarkers.map(({ p }) => p.dbn).filter(Boolean));
      zonedSchoolNotFoundLayer.clearLayers();
      for (const z of allZones) {
        if (z.zoneType !== "elementary") continue;
        const dbns = parseDbns(z.feature.properties.dbn);
        if (dbns.length > 0 && !dbns.some((d) => knownDbns.has(d)))
          zonedSchoolNotFoundLayer.addData(z.feature);
      }
      zonedSchoolNotFoundLayer.addTo(map);
    } else {
      map.removeLayer(zonedSchoolNotFoundLayer);
    }
  });

  // src/client/map-client.ts
  var map = L.map("map").setView([40.6928, -73.956], 13);
  L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    },
    [{ header: "X-Requested-With", value: "aureliengasser-schools" }],
    null
  ).addTo(map);
  var schoolPinsLayer = L.layerGroup().addTo(map);
  function buildLayer(zones) {
    const layer = L.layerGroup();
    for (const zone of zones) {
      for (const entry of zone.entries) {
        L.geoJSON(
          { type: "MultiPolygon", coordinates: entry.coordinates },
          {
            style: {
              color: zone.color,
              weight: 1.5,
              opacity: 0.6,
              fillColor: zone.color,
              fillOpacity: 0.25
            },
            interactive: false
          }
        ).addTo(layer);
      }
    }
    return layer;
  }
  var ringsLayer = buildLayer(__commutePolygonSets.rings);
  var zipPrices = __realEstatePriceZipCodes.features.map((f) => f.properties.avgPrice).filter((p) => p !== null);
  var zipMinPrice = Math.min(...zipPrices);
  var zipMaxPrice = Math.max(...zipPrices);
  function zipPriceColor(price) {
    if (price === null) return { fillColor: "#000", fillOpacity: 0 };
    const t = Math.log(price / zipMinPrice) / Math.log(zipMaxPrice / zipMinPrice);
    const hue = Math.round(60 - t * 60);
    const lightness = Math.round(70 - t * 30);
    return { fillColor: `hsl(${hue}, 100%, ${lightness}%)`, fillOpacity: 0.55 };
  }
  var zipLayer = L.geoJSON(__realEstatePriceZipCodes, {
    style(feature) {
      const { fillColor, fillOpacity } = zipPriceColor(
        feature.properties.avgPrice
      );
      return {
        stroke: false,
        fillColor,
        fillOpacity
      };
    },
    onEachFeature(feature, layer) {
      const price = feature.properties.avgPrice;
      const priceStr = price !== null ? ` \u2014 $${Math.round(price).toLocaleString()}/sqft` : "";
      layer.bindTooltip(feature.properties.label + priceStr, {
        permanent: false,
        sticky: true,
        className: "zip-tooltip"
      });
    }
  }).addTo(map);
  var schoolZoneStyle = (_color) => ({
    opacity: 0,
    fill: false,
    interactive: false
  });
  var schoolZoneHighlight = (color) => ({
    color,
    weight: 3.5,
    opacity: 0.95,
    fillColor: color,
    fillOpacity: 0.25
  });
  var allZones = [];
  function findZonesForPoint(lng, lat) {
    const found = [];
    for (const z of allZones) {
      if (found.some((f) => f.zoneType === z.zoneType)) continue;
      if (pointInGeom(lng, lat, z.feature.geometry)) found.push(z);
      if (found.length === 2) break;
    }
    return found;
  }
  function schoolsInZone(zone) {
    const relevantTypes = zone.zoneType === "elementary" ? ["elementary", "k8"] : ["middle", "k8"];
    return __schoolPoints.filter(
      (p) => relevantTypes.includes(p.schoolType) && pointInGeom(p.lng, p.lat, zone.feature.geometry)
    );
  }
  function makeZoneGeoJSON(data, color, zoneType) {
    return L.geoJSON(data, {
      style: () => schoolZoneStyle(color),
      onEachFeature(feature, layer) {
        allZones.push({ feature, layer, color, zoneType });
      }
    });
  }
  L.layerGroup([
    makeZoneGeoJSON(__middleZones, "#ea580c", "middle"),
    makeZoneGeoJSON(__elementaryZones, "#2563eb", "elementary")
  ]).addTo(map);
  var selectedSchoolZones = [];
  var selectedMainSchoolCircles = [];
  var selectedFadedMarkers = [];
  var deselect = () => {
    for (const z of selectedSchoolZones)
      z.layer.setStyle(schoolZoneStyle(z.color));
    selectedSchoolZones = [];
    for (const c of selectedMainSchoolCircles) map.removeLayer(c);
    selectedMainSchoolCircles = [];
    for (const m of selectedFadedMarkers) {
      map.removeLayer(m);
      m.setOpacity(1);
    }
    selectedFadedMarkers = [];
  };
  var R = 10;
  var CX = 20;
  var CY = 20;
  function starPoints(cx, cy, r, points, innerRatio = 0.45) {
    const pts = [];
    for (let i = 0; i < points * 2; i++) {
      const angle = Math.PI / points * i - Math.PI / 2;
      const radius = i % 2 === 0 ? r : r * innerRatio;
      pts.push(
        `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`
      );
    }
    return pts.join(" ");
  }
  function roundedStarPath(cx, cy, r) {
    const o = r * 0.35;
    const ir = r * 0.28;
    const pts = [
      [cx, cy - r],
      [cx + r, cy],
      [cx, cy + r],
      [cx - r, cy]
    ];
    const inners = [
      [cx + ir, cy - ir],
      [cx + ir, cy + ir],
      [cx - ir, cy + ir],
      [cx - ir, cy - ir]
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
  function makePinSvg(schoolType, color) {
    const shapeEl = schoolType === "elementary" ? `<circle cx="${CX}" cy="${CY}" r="${R}" fill="${color}" stroke="#fff" stroke-width="1.5"/>` : schoolType === "middle" ? `<polygon points="${starPoints(CX, CY, R, 5)}" fill="${color}" stroke="#fff" stroke-width="1.5"/>` : schoolType === "k8" ? `<path d="${roundedStarPath(CX, CY, R)}" fill="${color}" stroke="#fff" stroke-width="1.5"/>` : `<polygon points="${CX},${CY - R} ${CX + R},${CY} ${CX},${CY + R} ${CX - R},${CY}" fill="${color}" stroke="#fff" stroke-width="1.5"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">${shapeEl}</svg>`;
  }
  function makePinIcon(p) {
    return L.divIcon({
      html: makePinSvg(p.schoolType, p.color),
      className: "",
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -22]
    });
  }
  var RATING_COLORS = {
    Excellent: "#15803d",
    Good: "#65a30d",
    Fair: "#ca8a04",
    "Needs Improvement": "#dc2626"
  };
  function ratingBadge(rating) {
    const bg = RATING_COLORS[rating] ?? "#6b7280";
    return `<span style="background:${bg};color:#fff;padding:1px 5px;border-radius:3px;font-size:11px;white-space:nowrap">${rating}</span>`;
  }
  function pctBar(pct, raw, invert = false) {
    const hue = Math.pow((invert ? 100 - pct : pct) / 100, 3) * 120;
    const color = `hsl(${hue.toFixed(1)},75%,38%)`;
    const p = pct.toFixed(1);
    const bg = `linear-gradient(to right,${color} ${p}%,#e5e7eb ${p}%)`;
    return `<div style="display:flex;align-items:center;gap:6px"><div style="width:80px;height:5px;background:${bg};border-radius:2px;flex-shrink:0"></div><span style="color:#555;font-size:11px">${raw}</span></div>`;
  }
  function renderValue(value, isRating, invert = false) {
    if (isRating) return value ? ratingBadge(value) : "\u2014";
    if (!value) return "\u2014";
    const m = /^([\d.]+)%$/.exec(value.trim());
    if (m)
      return pctBar(
        Math.min(100, Math.max(0, parseFloat(m[1]))),
        value.trim(),
        invert
      );
    return value;
  }
  function fmtRow(label, value, isRating = false, ratingValue, scoreRange, invert = false) {
    let cell;
    if (ratingValue !== void 0 && scoreRange) {
      const score = parseFloat(value);
      const [min, max] = scoreRange;
      const pct = isNaN(score) ? 0 : (score - min) / (max - min) * 100;
      const color = RATING_COLORS[ratingValue] ?? "#6b7280";
      const bg = `linear-gradient(to right,${color} ${pct.toFixed(1)}%,#e5e7eb ${pct.toFixed(1)}%)`;
      const bar = `<div style="width:80px;height:5px;background:${bg};border-radius:2px;flex-shrink:0"></div>`;
      const scoreText = value ? `<span style="color:#555;font-size:11px">${score.toFixed(2)}</span>` : "";
      const badge = ratingValue ? ratingBadge(ratingValue) : "";
      cell = `<div style="display:flex;align-items:center;gap:6px">${bar}${scoreText}${badge}</div>`;
    } else if (ratingValue !== void 0) {
      const badge = ratingValue ? ratingBadge(ratingValue) : "";
      cell = `<div style="display:flex;align-items:center;gap:6px">${renderValue(value, false, invert)}${badge}</div>`;
    } else {
      cell = renderValue(value, isRating, invert);
    }
    return `<tr><td style="color:#555;padding-right:8px;white-space:nowrap;vertical-align:middle">${label}</td><td style="vertical-align:middle">${cell}</td></tr>`;
  }
  var POPUP_FIELDS = [
    { label: "School Type", key: "School Type" },
    { label: "Enrollment", key: "Enrollment" },
    { label: "Temp Housing", key: "Percent in Temp Housing", invert: true },
    {
      label: "Principal Yrs.",
      key: "Years of principal experience at this school"
    },
    { label: "Attendance", key: "Average Student Attendance" },
    {
      label: "Teachers w/ 3+ Yrs",
      key: "Percent of teachers with 3 or more years of experience"
    },
    {
      label: "Instr. and Perf.",
      key: "Instruction and Performance - Score",
      ratingKey: "Instruction and Performance - Rating",
      scoreRange: [1, 5]
    },
    {
      label: "Safety",
      key: "Safety and School Climate - Rating",
      isRating: true
    },
    {
      label: "Relationships w/ Families",
      key: "Relationships with Families - Rating",
      isRating: true
    }
  ];
  var RATING_TO_PCT = {
    Excellent: 100,
    Good: 66,
    Fair: 33,
    "Needs Improvement": 0
  };
  function academicSection(s) {
    const mk = (label, metric) => ({
      label,
      fullName: metric,
      ratingKey: `Metric Rating - ${metric}`,
      scoreKey: `Metric Score - ${metric}`,
      nKey: `N count - ${metric}`
    });
    const mainSubjects = [
      mk("ELA", "Average Student Proficiency, ELA"),
      mk("Math", "Average Student Proficiency, Math")
    ];
    const detailSubjects = [
      mk("ELA Core Pass", "ELA Core Course Pass Rate"),
      mk("Math Core Pass", "Math Core Course Pass Rate"),
      mk("Science Pass", "Science Core Course Pass Rate"),
      mk("Soc. Stud. Pass", "Social Studies Core Course Pass Rate"),
      mk("MS Adj. Pass", "MS Adjusted Core Course Pass Rate of Former Students"),
      mk("8th \u2192 HS Cred.", "Percent of 8th Graders Earning HS Credit"),
      mk("Lvl 3-4 ELA", "Percentage of Students at Level 3 or 4, ELA"),
      mk("Lvl 3-4 Math", "Percentage of Students at Level 3 or 4, Math")
    ];
    const renderRow = ({
      label,
      fullName,
      ratingKey,
      scoreKey,
      nKey
    }) => {
      const rating = s[ratingKey] ?? "";
      const scoreRaw = s[scoreKey];
      const nRaw = s[nKey];
      if (!rating && !scoreRaw) return "";
      let pct;
      let scoreText = "";
      if (scoreRaw) {
        const score = parseFloat(scoreRaw);
        pct = (score - 1) / 4 * 100;
        const nText = nRaw ? ` (N=${nRaw})` : "";
        scoreText = `<span style="color:#555;font-size:11px">${score.toFixed(2)}${nText}</span>`;
      } else {
        pct = RATING_TO_PCT[rating] ?? 50;
      }
      const color = RATING_COLORS[rating] ?? "#6b7280";
      const bg = `linear-gradient(to right,${color} ${pct.toFixed(1)}%,#e5e7eb ${pct.toFixed(1)}%)`;
      const bar = `<div style="width:80px;height:5px;background:${bg};border-radius:2px;flex-shrink:0"></div>`;
      const badge = rating ? ratingBadge(rating) : "";
      return `<tr title="${fullName}"><td style="color:#555;padding-right:8px;white-space:nowrap;vertical-align:middle">${label}</td><td style="vertical-align:middle"><div style="display:flex;align-items:center;gap:6px">${bar}${scoreText}${badge}</div></td></tr>`;
    };
    const mainRows = mainSubjects.map(renderRow).join("");
    if (!mainRows) return "";
    const detailRows = detailSubjects.map(renderRow).filter(Boolean).join("");
    const detailSection = detailRows ? `<details style="margin-top:4px"><summary style="font-size:11px;color:#888;cursor:pointer;list-style:none;padding:2px 0">&#9654; More metrics</summary><table style="font-size:12px;border-collapse:collapse;margin-top:4px">${detailRows}</table></details>` : "";
    return `<div style="margin-top:8px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#888;margin-bottom:4px">Academics</div><table style="font-size:12px;border-collapse:collapse">${mainRows}</table>${detailSection}</div>`;
  }
  var ETHNICITY_GROUPS = [
    { label: "Hispanic", key: "Student Percent - Hispanic", color: "#c2703e" },
    { label: "Black", key: "Student Percent - Black", color: "#5c3317" },
    { label: "Asian", key: "Student Percent - Asian", color: "#e8b84b" },
    { label: "White", key: "Student Percent - White", color: "#e8e0d0" },
    {
      label: "Native Am.",
      key: "Student Percent - Native American",
      color: "#9a3412"
    },
    {
      label: "Pacific Isl.",
      key: "Student Percent - Native Hawaiian or Pacific Islander",
      color: "#0e7490"
    }
  ];
  var SURVEY_FIELDS = [
    { label: "Safety", key: "Safety - School Percent Positive" },
    { label: "Leadership", key: "School Leadership - School Percent Positive" },
    {
      label: "Student Support",
      key: "Student Support - School Percent Positive"
    },
    {
      label: "Teaching Env",
      key: "Teaching Environment - School Percent Positive"
    },
    {
      label: "Advising",
      key: "Advising and Planning - School Percent Positive"
    },
    {
      label: "Family Inv.",
      key: "Family Involvement - School Percent Positive"
    },
    {
      label: "Family Trust",
      key: "Family-School Trust - School Percent Positive"
    },
    { label: "Communication", key: "Communication - School Percent Positive" },
    {
      label: "Learning Env",
      key: "Instruction/Learning Environment - School Percent Positive"
    }
  ];
  function surveySection(s) {
    const parentRate = s["Parent Survey Response Rate"] ?? "";
    const teacherRate = s["Teacher Survey Response Rate"] ?? "";
    const hasRates = parentRate || teacherRate;
    const rows = SURVEY_FIELDS.map(({ label, key, isRating }) => {
      const val = s[key] ?? "";
      if (!val) return "";
      return fmtRow(label, val, isRating);
    }).filter(Boolean).join("");
    if (!rows && !hasRates) return "";
    const rateBar = hasRates ? `<div style="font-size:11px;color:#555;margin-bottom:4px">Resp. rate. Teachers: <b>${teacherRate || "\u2014"}</b>&ensp;Parents: <b>${parentRate || "\u2014"}</b></div>` : "";
    return `<details style="margin-top:8px"><summary style="cursor:pointer;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#888;user-select:none">Survey</summary>${rateBar}<table style="font-size:12px;border-collapse:collapse;margin-top:4px">${rows}</table></details>`;
  }
  function ethnicityBar(s) {
    const vals = ETHNICITY_GROUPS.map((g) => ({
      ...g,
      pct: parseFloat(s[g.key]?.replace("%", "") ?? "") || 0
    })).filter((g) => g.pct > 0);
    if (!vals.length) return "";
    const total = vals.reduce((sum, g) => sum + g.pct, 0);
    const segments = vals.map((g) => {
      const w = (g.pct / total * 100).toFixed(1);
      const border = g.color === "#e8e0d0" ? "box-shadow:inset 0 0 0 1px #bbb;" : "";
      return `<div style="width:${w}%;background:${g.color};${border}" title="${g.label}: ${g.pct.toFixed(1)}%"></div>`;
    }).join("");
    const labels = vals.map(
      (g) => `<span style="display:flex;align-items:center;gap:2px;font-size:10px;white-space:nowrap"><span style="display:inline-block;width:8px;height:8px;background:${g.color};border-radius:1px;flex-shrink:0;${g.color === "#e8e0d0" ? "box-shadow:inset 0 0 0 1px #bbb;" : ""}"></span>${g.label} ${g.pct.toFixed(0)}%</span>`
    ).join("");
    return `<div style="margin-top:6px"><div style="font-size:11px;color:#555;margin-bottom:3px">Ethnicity</div><div style="display:flex;border-radius:3px;overflow:hidden;height:10px;border:1px solid #e5e5e5">${segments}</div><div style="display:flex;flex-wrap:wrap;gap:4px 8px;margin-top:4px">${labels}</div></div>`;
  }
  var LINK_STYLE = `color:#2563eb;font-size:12px;text-decoration:none;display:inline-flex;align-items:center;gap:4px;margin-top:6px;margin-right:12px`;
  function zoneInfo(zone) {
    const props = zone.feature.properties;
    const label = props.label ? `Zone ${props.label}` : "";
    const district = props.schooldist ? `District ${parseInt(props.schooldist)}` : "";
    const remarks = props.remarks ?? "";
    const dbns = parseDbns(props.dbn).join(", ");
    return [label, district, remarks, dbns].filter(Boolean).join(" \xB7 ");
  }
  function schoolZoneSection(zones) {
    const elem = zones.find((z) => z.zoneType === "elementary");
    const mid = zones.find((z) => z.zoneType === "middle");
    if (!elem && !mid) return "";
    const row = (label, color, zone) => `<div style="font-size:11px;margin-top:3px"><span style="color:${color}">\u25CF</span> <b>${label}:</b> ${zone ? zoneInfo(zone) : "\u2014"}</div>`;
    return `<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;font-weight:600;color:#374151;user-select:none">School zones</summary><div style="margin-top:4px">${row("Elementary", "#2563eb", elem)}${row("Middle", "#ea580c", mid)}</div></details>`;
  }
  function buildPopup(p, zones = []) {
    const s = p.sqr;
    const dbnStr = p.dbn ? ` <span style="color:#94a3b8;font-size:10px;font-weight:normal">${p.dbn}</span>` : "";
    const header = `<b style="font-size:14px">${p.name}</b>${dbnStr}<br><span style="color:#555;font-size:12px">${p.type}</span><br><span style="color:#777;font-size:11px">${p.address}, ${p.city}</span>`;
    const commute = p.commute ? `<div style="margin-top:4px;font-size:12px">Commute: <b>${p.commute}</b></div>` : "";
    const dashboardLink = p.sqr ? `<a href="https://tools.nycenet.edu/dashboard/#dbn=${encodeURIComponent(p.dbn ?? "")}&report_type=EMS&view=City" target="_blank" rel="noopener" style="${LINK_STYLE}">&#x1F4CA; NYC Dashboard</a>` : "";
    const googleLink = !p.sqr ? `<a href="https://www.google.com/search?q=${encodeURIComponent(p.name + " NYC school")}" target="_blank" rel="noopener" style="${LINK_STYLE}">&#x1F50D; Search on Google</a>` : "";
    const links = googleLink || dashboardLink ? `<div style="margin-top:4px">${googleLink}${dashboardLink}</div>` : "";
    const closeLink = `<div style="text-align:right;margin-top:6px"><a href="#" onclick="document.querySelector('.leaflet-popup-close-button').click();return false;" style="font-size:11px;color:#94a3b8;text-decoration:none">close</a></div>`;
    if (!s)
      return `<div style="max-width:280px">${header}${commute}${links}${schoolZoneSection(zones)}${closeLink}</div>`;
    const rows = POPUP_FIELDS.map(
      ({ label, key, isRating, ratingKey, scoreRange, invert }) => fmtRow(
        label,
        s[key] ?? "",
        isRating,
        ratingKey !== void 0 ? s[ratingKey] ?? "" : void 0,
        scoreRange,
        invert
      )
    ).join("");
    const table = `<table style="margin-top:6px;font-size:12px;border-collapse:collapse">${rows}</table>`;
    return `<div>${header}${commute}${links}${table}${academicSection(s)}${surveySection(s)}${ethnicityBar(s)}${schoolZoneSection(zones)}${closeLink}</div>`;
  }
  var oms = new OverlappingMarkerSpiderfier(map, {
    nearbyDistance: 20,
    keepSpiderfied: true,
    legWeight: 2,
    legColors: { usual: "#94a3b8", highlighted: "#3b82f6" }
  });
  function selectZonesForPoint(lat, lng) {
    selectedSchoolZones = findZonesForPoint(lng, lat);
    for (const zone of selectedSchoolZones) {
      zone.layer.setStyle(schoolZoneHighlight(zone.color));
      const dbns = parseDbns(zone.feature.properties.dbn);
      const mainSchools = __schoolPoints.filter(
        (pt) => pt.dbn && dbns.includes(pt.dbn)
      );
      for (const mainSchool of mainSchools) {
        selectedMainSchoolCircles.push(
          L.circleMarker([mainSchool.lat, mainSchool.lng], {
            radius: 22,
            color: zone.color,
            weight: 3,
            fillOpacity: 0,
            interactive: false
          }).addTo(map)
        );
      }
      for (const toShow of [...mainSchools, ...schoolsInZone(zone)]) {
        const entry = allMarkers.find((m) => m.p === toShow);
        if (entry && !schoolPinsLayer.hasLayer(entry.marker)) {
          if (!academicPassingMarkers.has(toShow)) entry.marker.setOpacity(0.45);
          entry.marker.addTo(map);
          selectedFadedMarkers.push(entry.marker);
        }
      }
    }
    return selectedSchoolZones;
  }
  oms.addListener("click", (marker) => {
    deselect();
    const p = marker._p;
    if (p) {
      const zones = selectZonesForPoint(p.lat, p.lng);
      marker.setPopupContent(buildPopup(p, zones));
    }
    marker.openPopup();
  });
  var RATING_RANK = {
    "Needs Improvement": 0,
    Fair: 1,
    Good: 2,
    Excellent: 3
  };
  var allMarkers = [];
  var passingDbns = /* @__PURE__ */ new Set();
  var academicPassingMarkers = /* @__PURE__ */ new Set();
  __schoolPoints.forEach((p) => {
    const isMobile2 = window.innerWidth <= 640;
    const marker = L.marker([p.lat, p.lng], { icon: makePinIcon(p) }).bindPopup(
      buildPopup(p),
      isMobile2 ? { maxWidth: window.innerWidth - 24 } : { minWidth: 370, maxWidth: 420 }
    );
    marker._p = p;
    oms.addMarker(marker);
    marker.addTo(schoolPinsLayer);
    allMarkers.push({ marker, p });
  });
  function applyFilters() {
    academicPassingMarkers.clear();
    const academicValue = document.querySelector(
      'input[name="academic-filter"]:checked'
    )?.value ?? "any";
    const minRank = academicValue === "any" ? -1 : RATING_RANK[academicValue] ?? -1;
    const hideNoData = document.getElementById("hide-no-academic-data")?.checked ?? false;
    const commuteValue = document.querySelector(
      'input[name="commute-filter"]:checked'
    )?.value ?? "any";
    const maxCommute = commuteValue === "any" ? Infinity : parseInt(commuteValue);
    const hideSchools = document.getElementById("hide-schools")?.checked ?? false;
    for (const { marker, p } of allMarkers) {
      const commuteMax = p.commuteRange.max ?? Infinity;
      const passesCommute = commuteMax <= maxCommute;
      const sqr = p.sqr;
      const elaRating = sqr?.["Metric Rating - Average Student Proficiency, ELA"] ?? "";
      const mathRating = sqr?.["Metric Rating - Average Student Proficiency, Math"] ?? "";
      const safetyRating = sqr?.["Safety and School Climate - Rating"] ?? "";
      const msPassRating = sqr?.["Metric Rating - MS Adjusted Core Course Pass Rate of Former Students"] ?? "";
      const hasData = Boolean(elaRating || mathRating);
      let passesAcademic;
      if (!hasData) {
        passesAcademic = !hideNoData;
      } else if (minRank < 0) {
        passesAcademic = true;
      } else {
        const ranks = [elaRating, mathRating, safetyRating, msPassRating].filter(Boolean).map((r) => RATING_RANK[r] ?? -1);
        passesAcademic = Math.min(...ranks) >= minRank;
      }
      if (passesAcademic) academicPassingMarkers.add(p);
      const passesFilters = passesCommute && passesAcademic;
      const visible = !hideSchools && passesFilters;
      if (visible && !schoolPinsLayer.hasLayer(marker)) {
        schoolPinsLayer.addLayer(marker);
      } else if (!visible && schoolPinsLayer.hasLayer(marker)) {
        schoolPinsLayer.removeLayer(marker);
      }
      if (p.dbn) {
        if (passesFilters) passingDbns.add(p.dbn);
        else passingDbns.delete(p.dbn);
      }
    }
    updateEligibleZonesLayer();
  }
  map.on("click", (e) => {
    deselect();
    const overlayVal = document.querySelector('input[name="overlay"]:checked')?.value;
    if (overlayVal !== "zipcodes") return;
    const zones = selectZonesForPoint(e.latlng.lat, e.latlng.lng);
    if (zones.length === 0) return;
    const closeLink = `<div style="text-align:right;margin-top:6px"><a href="#" onclick="document.querySelector('.leaflet-popup-close-button').click();return false;" style="font-size:11px;color:#94a3b8;text-decoration:none">close</a></div>`;
    L.popup().setLatLng(e.latlng).setContent(`<div>${schoolZoneSection(zones)}${closeLink}</div>`).openOn(map);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      map.closePopup();
      deselect();
    }
  });
  var isMobile = window.innerWidth <= 640;
  var panel = document.getElementById("panel");
  if (isMobile) panel.classList.add("collapsed");
  document.getElementById("panel-header").addEventListener("click", () => {
    panel.classList.toggle("collapsed");
  });
  var legendEl = document.getElementById("legend");
  if (isMobile) legendEl.classList.add("collapsed");
  document.getElementById("legend-header").addEventListener("click", () => {
    legendEl.classList.toggle("collapsed");
  });
  document.querySelectorAll('input[name="overlay"]').forEach((el) => {
    el.addEventListener("change", () => {
      const val = document.querySelector(
        'input[name="overlay"]:checked'
      ).value;
      if (val === "zipcodes") {
        map.addLayer(zipLayer);
        map.removeLayer(ringsLayer);
      } else if (val === "zones") {
        map.removeLayer(zipLayer);
        map.addLayer(ringsLayer);
      } else {
        map.removeLayer(zipLayer);
        map.removeLayer(ringsLayer);
      }
    });
  });
  applyFilters();
  document.querySelectorAll('input[name="academic-filter"]').forEach((el) => {
    el.addEventListener("change", applyFilters);
  });
  document.getElementById("hide-no-academic-data").addEventListener("change", applyFilters);
  document.querySelectorAll('input[name="commute-filter"]').forEach((el) => {
    el.addEventListener("change", applyFilters);
  });
  document.getElementById("hide-schools").addEventListener("change", applyFilters);

  // src/client/search-client.ts
  var searchInput = document.getElementById("search-input");
  searchInput.placeholder = "Search address\u2026";
  var searchMarker = null;
  async function handleSearch() {
    const val = searchInput.value.trim();
    if (!val) return;
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=1&countrycodes=us&viewbox=-74.26,40.92,-73.68,40.49&bounded=0`;
      const resp = await fetch(url, {
        headers: { "Accept-Language": "en", "User-Agent": "aureliengasser-schools" }
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
          iconAnchor: [7, 7]
        })
      }).bindPopup(popupHtml).addTo(map);
      searchMarker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        deselect();
        selectZonesForPoint(lat, lng);
      });
      searchMarker.openPopup();
      map.setView([lat, lng], 15);
      searchInput.value = "";
    } catch {
    }
  }
  document.getElementById("search-btn").addEventListener("click", handleSearch);
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSearch();
  });
})();
