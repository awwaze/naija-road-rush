#!/usr/bin/env python3
"""Turn raw OpenStreetMap route data (hd/data/<city>-raw.json) into game tracks.

Outputs per city:
  hd/public/tracks/<city>.json          race routes, buildings, POIs (local metres)
  hd/public/tracks/<city>-<route>.png   ground map: water / land / green (RGB)

Map data (c) OpenStreetMap contributors, ODbL. Run: python3 tools/map/build_track.py lagos
"""
import json, math, random, sys, os
from PIL import Image, ImageDraw

CITY = sys.argv[1] if len(sys.argv) > 1 else 'lagos'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = f'{ROOT}/hd/public/tracks'
os.makedirs(OUT, exist_ok=True)
CONF = json.load(open(f'{ROOT}/tools/map/cities.json'))[CITY]
ROUTES = CONF['routes']
HILLY = CONF.get('hilly', False)

RAW = line = P = cum = ELEV = None
lat0 = lon0 = KX = KZ = 0
def load_raw(key):
    global RAW, line, P, cum, ELEV, lat0, lon0, KX, KZ
    RAW = json.load(open(f'{ROOT}/hd/data/{key}-raw.json'))
    line = RAW['line']; lat0, lon0 = line[0]
    KX = math.cos(math.radians(lat0)) * 111320.0; KZ = 110540.0
    P = [proj(*p) for p in line]
    cum = [0.0]
    for i in range(1, len(P)): cum.append(cum[-1] + math.dist(P[i - 1], P[i]))
    # elevation by distance along the line (linear interpolation of SRTM samples)
    ev = [(cum[i], e) for i, e in RAW.get('elev', []) if e is not None]
    ELEV = ev
    prepare_features()

def elev_at(d):
    if not ELEV: return 0.0
    if d <= ELEV[0][0]: return ELEV[0][1]
    for k in range(1, len(ELEV)):
        if ELEV[k][0] >= d:
            (d0, e0), (d1, e1) = ELEV[k - 1], ELEV[k]
            return e0 + (e1 - e0) * ((d - d0) / max(1e-6, d1 - d0))
    return ELEV[-1][1]

def proj(lat, lon):  # x = east, z = south (three.js: north is -z)
    return ((lon - lon0) * KX, -(lat - lat0) * KZ)

def slice_line(a_km, b_km):
    a, b = a_km * 1000, b_km * 1000
    if b <= 0: b = cum[-1]
    if a < 0: a = max(0.0, cum[-1] + a)   # negative start = last N km
    pts = []
    for i in range(len(P)):
        if a <= cum[i] <= b:
            pts.append((P[i][0], P[i][1], elev_at(cum[i])))
    return pts

def resample(pts, step):
    out = [pts[0]]
    carry = 0.0
    for i in range(1, len(pts)):
        p0, p1 = pts[i - 1], pts[i]
        seg = math.dist(p0[:2], p1[:2])
        if seg == 0:
            continue
        d = step - carry
        while d <= seg:
            t = d / seg
            out.append(tuple(p0[k] + (p1[k] - p0[k]) * t for k in range(len(p0))))
            d += step
        carry = seg - (d - step)
    return out

def smooth(pts, win):
    n = len(pts)
    res = []
    for i in range(n):
        a, b = max(0, i - win), min(n, i + win + 1)
        res.append(tuple(sum(p[k] for p in pts[a:b]) / (b - a) for k in range(len(pts[0]))))
    return res

def seg_dist(p, a, b):
    ax, az = a; bx, bz = b; px, pz = p
    dx, dz = bx - ax, bz - az
    L = dx * dx + dz * dz
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (pz - az) * dz) / L))
    return math.hypot(px - (ax + t * dx), pz - (az + t * dz))

def prepare_features():
    global els, bridges, water_polys, green_polys, water_lines, buildings_raw, pois
    # --- OSM features ---
    els = RAW['osm']
    bridges = []
    for e in els:
        t = e.get('tags', {})
        if e['type'] == 'way' and 'highway' in t and 'bridge' in t and e.get('geometry'):
            bridges.append([proj(g['lat'], g['lon']) for g in e['geometry']])

    global assemble_rings
    def assemble_rings(ways):
        """Join open member ways into closed rings by matching end points."""
        rings, open_ = [], [list(w) for w in ways if len(w) > 1]
        while open_:
            cur = open_.pop(0)
            changed = True
            while changed and cur[0] != cur[-1]:
                changed = False
                for i, w in enumerate(open_):
                    if w[0] == cur[-1]: cur += w[1:]
                    elif w[-1] == cur[-1]: cur += w[::-1][1:]
                    elif w[-1] == cur[0]: cur = w[:-1] + cur
                    elif w[0] == cur[0]: cur = w[::-1][:-1] + cur
                    else: continue
                    open_.pop(i); changed = True; break
            rings.append(cur)
        return rings

    water_polys, green_polys, water_lines = [], [], []
    for e in els:
        t = e.get('tags', {})
        is_water = t.get('natural') == 'water' or t.get('water')
        if e['type'] == 'relation' and is_water:
            outer = [[(g['lat'], g['lon']) for g in m['geometry']] for m in e.get('members', []) if m.get('role') == 'outer' and m.get('geometry')]
            inner = [[(g['lat'], g['lon']) for g in m['geometry']] for m in e.get('members', []) if m.get('role') == 'inner' and m.get('geometry')]
            for r in assemble_rings(outer): water_polys.append(('w', r))
            for r in assemble_rings(inner): water_polys.append(('i', r))
        elif e['type'] == 'way' and e.get('geometry'):
            g = [(p['lat'], p['lon']) for p in e['geometry']]
            if is_water and t.get('water') != 'wastewater' and g[0] == g[-1]:
                water_polys.append(('w', g))
            elif t.get('waterway') in ('canal', 'river') :
                water_lines.append(g)
            elif (t.get('leisure') == 'park' or t.get('landuse') in ('grass', 'forest', 'recreation_ground') or t.get('natural') in ('wood', 'scrub', 'wetland')) and g[0] == g[-1]:
                green_polys.append(g)

    buildings_raw = []
    for e in els:
        t = e.get('tags', {})
        if e['type'] == 'way' and 'building' in t and e.get('geometry'):
            pts = [proj(g['lat'], g['lon']) for g in e['geometry']]
            if len(pts) < 4: continue
            buildings_raw.append((e['id'], t, pts[:-1] if pts[0] == pts[-1] else pts))

    pois = []
    for e in els:
        t = e.get('tags', {})
        if e['type'] == 'node' and t.get('name'):
            kind = t.get('amenity') or t.get('shop') or t.get('tourism') or t.get('man_made') or t.get('historic') or 'place'
            pois.append({'name': t['name'][:28], 'kind': kind, 'p': proj(e['lat'], e['lon'])})


def poly_area(pts):
    a = 0
    for i in range(len(pts)):
        x0, z0 = pts[i]; x1, z1 = pts[(i + 1) % len(pts)]
        a += x0 * z1 - x1 * z0
    return a / 2

def rdp(pts, eps):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]
    idx, dmax = 0, 0
    for i in range(1, len(pts) - 1):
        d = seg_dist(pts[i], a, b)
        if d > dmax: idx, dmax = i, d
    if dmax > eps:
        return rdp(pts[:idx + 1], eps)[:-1] + rdp(pts[idx:], eps)
    return [a, b]

def make_ground(pts):
    xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
    M = 700
    gminx, gmaxx, gminz, gmaxz = min(xs) - M, max(xs) + M, min(zs) - M, max(zs) + M
    W_m, H_m = gmaxx - gminx, gmaxz - gminz
    scale = min(4096 / W_m, 4096 / H_m, 1 / 1.5)
    Wp, Hp = int(W_m * scale), int(H_m * scale)
    img = Image.new('RGB', (Wp, Hp), (0, 0, 0))   # R=land(1)/water(0) mask in channel 0, G=green
    dr = ImageDraw.Draw(img)
    def px(lat, lon):
        x, z = proj(lat, lon)
        return ((x - gminx) * scale, (z - gminz) * scale)
    land = Image.new('L', (Wp, Hp), 255); dl = ImageDraw.Draw(land)
    for kind, ring in water_polys:
        if kind == 'w' and len(ring) > 2: dl.polygon([px(*p) for p in ring], fill=0)
    for kind, ring in water_polys:
        if kind == 'i' and len(ring) > 2: dl.polygon([px(*p) for p in ring], fill=255)
    for g in water_lines:
        dl.line([px(*p) for p in g], fill=0, width=max(2, int(12 * scale)))
    green = Image.new('L', (Wp, Hp), 0); dg = ImageDraw.Draw(green)
    for g in green_polys:
        dg.polygon([px(*p) for p in g], fill=255)
    img = Image.merge('RGB', (land, green, Image.new('L', (Wp, Hp), 0)))
    img.save(f"{OUT}/{CITY}-{rt['id']}.png", optimize=True)
    return img, land, (gminx, gminz, W_m, H_m, scale, Wp, Hp)

ROAD_CLEAR = 15.0   # metres from the driving line kept free of buildings
CORRIDOR = 240.0

def build_route(rt):
    raw = []
    for a, b in rt['slices']:
        s = slice_line(a, b)
        if raw:
            # trim the previous slice at the point closest to the new slice start
            j = min(range(len(raw)), key=lambda i: math.dist(raw[i], s[0]))
            raw = raw[:j]
        raw += s
    pts = resample(raw, 2.0)
    pts = smooth(pts, 18)          # +-36 m: rounds junction corners for racing
    pts = smooth(pts, 10)
    pts = resample(pts, 4.0)
    terr = [p[2] for p in pts]; pts = [(p[0], p[1]) for p in pts]
    n = len(pts)
    if HILLY and terr:
        # smooth the SRTM profile (+-120 m) and make it relative to the lowest point
        sm = []
        for i in range(n):
            a, b = max(0, i - 30), min(n, i + 31); sm.append(sum(terr[a:b]) / (b - a))
        base = min(sm); terr = [round(v - base, 2) for v in sm]
    else:
        terr = [0.0] * n
    img, land, (gminx, gminz, W_m, H_m, scale, Wp, Hp) = make_ground(pts)
    lp = land.load()
    def over_water(p):
        x = int((p[0] - gminx) * scale); z = int((p[1] - gminz) * scale)
        return 0 <= x < Wp and 0 <= z < Hp and lp[x, z] < 128
    # bridge flags + deck height
    flag = []
    for p in pts:
        on = any(seg_dist(p, br[k], br[k + 1]) < 14 for br in bridges for k in range(len(br) - 1)
                 if abs(br[k][0] - p[0]) < 400 and abs(br[k][1] - p[1]) < 400)
        flag.append(1 if (on or over_water(p)) else 0)
    # close gaps shorter than 400 m between bridge stretches, drop bridge blips under 40 m
    i = 0
    while i < n:
        if flag[i] == 0:
            j = i
            while j < n and flag[j] == 0: j += 1
            if 0 < i and j < n and (j - i) < 100: flag[i:j] = [1] * (j - i)
            i = j
        else: i += 1
    i = 0
    while i < n:
        if flag[i] == 1:
            j = i
            while j < n and flag[j] == 1: j += 1
            if (j - i) < 10: flag[i:j] = [0] * (j - i)
            i = j
        else: i += 1
    # elevation: 7 m on bridges, ramps of 160 m
    elev = [0.0] * n
    RAMP = 40  # points (160 m)
    for i in range(n):
        if flag[i]:
            elev[i] = 7.0
    sm = elev[:]
    for i in range(n):
        a, b = max(0, i - RAMP), min(n, i + RAMP + 1)
        if not flag[i]:
            near = [elev[k] for k in range(a, b)]
            sm[i] = max(0.0, max(near) * 0.0) if not any(flag[a:b]) else None
    # proper ramp: distance to nearest bridge point
    bidx = [i for i in range(n) if flag[i]]
    for i in range(n):
        if flag[i]: sm[i] = 7.0; continue
        if not bidx: sm[i] = 0.0; continue
        d = min(abs(i - k) for k in bidx) if len(bidx) < 4000 else 999
        t = max(0.0, 1 - d / RAMP)
        sm[i] = 7.0 * (t * t * (3 - 2 * t))
    elev = [sm[i] + terr[i] for i in range(n)]
    # road names along the route (from OSRM steps)
    names = []
    for st in RAW['steps']:
        if not st['name']: continue
        p = proj(*st['loc'])
        k = min(range(n), key=lambda i: math.dist(pts[i], p))
        if math.dist(pts[k], p) < 60: names.append([k, st['name']])
    names.sort()
    clean = []
    for k, nm in names:
        if not clean or clean[-1][1] != nm: clean.append([k, nm])
    # buildings within corridor
    xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
    minx, maxx, minz, maxz = min(xs) - CORRIDOR, max(xs) + CORRIDOR, min(zs) - CORRIDOR, max(zs) + CORRIDOR
    grid = {}
    for i, p in enumerate(pts):
        grid.setdefault((int(p[0] // 100), int(p[1] // 100)), []).append(i)
    def nearest(p):
        gx, gz = int(p[0] // 100), int(p[1] // 100)
        best, bi = 1e9, -1
        for dx in (-3, -2, -1, 0, 1, 2, 3):
            for dz in (-3, -2, -1, 0, 1, 2, 3):
                for i in grid.get((gx + dx, gz + dz), ()):
                    d = math.dist(p, pts[i])
                    if d < best: best, bi = d, i
        return best, bi
    out_b = []
    for bid, t, fp in buildings_raw:
        cx = sum(p[0] for p in fp) / len(fp); cz = sum(p[1] for p in fp) / len(fp)
        if not (minx < cx < maxx and minz < cz < maxz): continue
        d, bi = nearest((cx, cz))
        if d > CORRIDOR: continue
        if min(nearest(p)[0] for p in fp) < ROAD_CLEAR: continue
        fp2 = rdp(fp + [fp[0]], 0.7)[:-1]
        if len(fp2) < 3: continue
        area = abs(poly_area(fp2))
        if area < 18: continue
        if poly_area(fp2) < 0: fp2 = fp2[::-1]   # make counter-clockwise in (x,z)
        rnd = random.Random(bid)
        h = None
        try:
            if 'height' in t: h = float(str(t['height']).replace('m', '').strip())
            elif 'building:levels' in t: h = float(t['building:levels']) * 3.3 + 1
        except ValueError: h = None
        if h is None:
            if area < 90: h = rnd.uniform(3.5, 7)
            elif area < 300: h = rnd.uniform(6, 13)
            elif area < 1200: h = rnd.uniform(9, 24)
            else: h = rnd.uniform(12, 34)
            if t.get('building') in ('roof', 'shed', 'kiosk', 'garage'): h = min(h, 4)
        h = max(3, min(h, 160))
        out_b.append({'i': bi, 'h': round(h, 1), 'k': t.get('building'), 'f': [round(v, 1) for p in fp2 for v in p]})
    # POIs near the road
    out_p = []
    for po in pois:
        d, bi = nearest(po['p'])
        if d < 90: out_p.append({'i': bi, 'n': po['name'], 'k': po['kind'], 'x': round(po['p'][0], 1), 'z': round(po['p'][1], 1)})
    land_px = sum(1 for v in land.get_flattened_data() if v > 127) / (Wp * Hp)
    return {
        'id': rt['id'], 'name': rt['name'], 'desc': rt['desc'], 'start': rt['start_name'], 'end': rt['end_name'],
        'length': round(4.0 * (n - 1)),
        'pts': [round(v, 1) for p in pts for v in p],
        'elev': [round(e, 2) for e in elev],
        'terr': terr,
        'bridge': flag,
        'names': clean,
        'buildings': out_b,
        'pois': out_p,
        'ground': {'img': f"{CITY}-{rt['id']}.png", 'minx': round(gminx, 1), 'minz': round(gminz, 1), 'w': round(W_m, 1), 'h': round(H_m, 1)},
        '_stats': {'points': n, 'buildings': len(out_b), 'pois': len(out_p), 'bridge_pts': sum(flag), 'land_frac': round(land_px, 3), 'px': [Wp, Hp]},
    }

result = {'city': CITY, 'name': CONF['name'], 'attribution': '© OpenStreetMap contributors', 'routes': []}
for rt in ROUTES:
    load_raw(rt['raw'])
    r = build_route(rt)
    print(rt['id'], r['length'], 'm', r['_stats'], 'climb', round(max(r['terr']) - min(r['terr']), 1), [nm for _, nm in r['names']])
    result['routes'].append(r)
with open(f'{OUT}/{CITY}.json', 'w') as f:
    json.dump(result, f, separators=(',', ':'))
print('wrote', f'{OUT}/{CITY}.json', round(os.path.getsize(f'{OUT}/{CITY}.json') / 1e6, 2), 'MB')
