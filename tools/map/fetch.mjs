// Downloads real map data for a race route: driving line (OSRM), buildings,
// water, parks and named landmarks near it (OpenStreetMap via Overpass).
// Runs on GitHub Actions. Map data © OpenStreetMap contributors (ODbL).
import fs from 'node:fs';
const city = process.argv[2] || 'lagos';
const cfg = JSON.parse(fs.readFileSync(new URL('./routes.json', import.meta.url)))[city];
const UA = { 'User-Agent': 'NaijaRoadRush-game-data/1.0 (github.com/awwaze/naija-road-rush)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function geocode(w) {
  try {
    const u = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ng&q=' + encodeURIComponent(w.q);
    const r = await fetch(u, { headers: UA }); const j = await r.json(); await sleep(1200);
    if (j[0]) { console.log('geocoded', w.q, j[0].lat, j[0].lon, j[0].display_name); return [+j[0].lat, +j[0].lon]; }
  } catch (e) { console.log('geocode failed', w.q, e.message); }
  console.log('using fallback for', w.q); return w.fallback;
}
const pts = [];
for (const w of cfg.waypoints) pts.push(await geocode(w));

const osrmUrl = 'https://router.project-osrm.org/route/v1/driving/' + pts.map(p => p[1] + ',' + p[0]).join(';') + '?overview=full&geometries=geojson&steps=true';
const osrm = await (await fetch(osrmUrl, { headers: UA })).json();
if (!osrm.routes) { console.error('OSRM error', JSON.stringify(osrm).slice(0, 500)); process.exit(1); }
const route = osrm.routes[0];
const line = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
const steps = route.legs.flatMap(l => l.steps).map(s => ({ name: s.name, ref: s.ref, dist: s.distance, loc: [s.maneuver.location[1], s.maneuver.location[0]] }));
console.log('route length m', route.distance, 'points', line.length);

// simplify the line for the Overpass "around" filter (every ~150 m)
const simple = []; let acc = 1e9;
const hav = (a, b) => { const R = 6371000, t = Math.PI / 180; const dLat = (b[0] - a[0]) * t, dLon = (b[1] - a[1]) * t; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
for (let i = 0; i < line.length; i++) { if (i > 0) acc += hav(line[i - 1], line[i]); if (acc >= 150 || i === line.length - 1) { simple.push(line[i]); acc = 0; } }
const around = `around:${cfg.radius},` + simple.map(p => p[0].toFixed(6) + ',' + p[1].toFixed(6)).join(',');
const q = `[out:json][timeout:180];
(
  way[building](${around});
  way[natural=water](${around.replace(cfg.radius, cfg.radius * 6)});
  relation[natural=water](${around.replace(cfg.radius, cfg.radius * 6)});
  way[waterway](${around.replace(cfg.radius, cfg.radius * 4)});
  way[leisure=park](${around});
  way[landuse~"grass|forest|recreation_ground"](${around});
  way[natural~"wood|scrub|wetland"](${around});
  way[highway][bridge](${around.replace(cfg.radius, 60)});
  node[name][~"^(amenity|tourism|shop|man_made|historic)$"~"."](${around.replace(cfg.radius, 150)});
);
out geom;`;
let osm = null;
for (const ep of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']) {
  try {
    const r = await fetch(ep, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
    if (!r.ok) { console.log(ep, r.status); continue; }
    osm = await r.json(); console.log('overpass ok', ep, osm.elements.length, 'elements'); break;
  } catch (e) { console.log(ep, e.message); }
}
if (!osm) { console.error('All Overpass endpoints failed'); process.exit(1); }
const out = { city, name: cfg.name, fetched: new Date().toISOString(), attribution: '© OpenStreetMap contributors', waypoints: pts, distance: route.distance, line, steps, osm: osm.elements };
fs.mkdirSync('hd/data', { recursive: true });
fs.writeFileSync(`hd/data/${city}-raw.json`, JSON.stringify(out));
console.log('wrote', `hd/data/${city}-raw.json`, (fs.statSync(`hd/data/${city}-raw.json`).size / 1e6).toFixed(2), 'MB');
