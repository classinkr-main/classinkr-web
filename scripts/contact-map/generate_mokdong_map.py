"""문의 탭 목동 쇼룸 일러스트 지도(미니어처 3D 도시) 바탕을 OpenStreetMap 데이터로 만든다.

출력: public/images/contact/mokdong-map-{ground,trees,buildings}.svg (396×500 좌표계)
      + 표준출력에 오버레이 위치(%) JSON — components/contact/ContactMap.tsx 의 상수와 맞춘다.

    python3 scripts/contact-map/generate_mokdong_map.py --osm /tmp/mokdong-osm.json --fetch
    python3 scripts/contact-map/generate_mokdong_map.py --osm /tmp/mokdong-osm.json

--fetch 는 Overpass API 에서 주변 도로·건물·공원·지하철을 받아 --osm 경로에 저장한다.
지도 데이터 © OpenStreetMap 기여자(ODbL) — 화면에 출처 표기를 둔다.
"""
import argparse, heapq, json, math, os, random, sys, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "public", "images", "contact")

# 현대드림타워(목동동로 233-1)를 원점으로 한 미터 좌표. x 동쪽+, y 남쪽+
LAT0, LON0 = 37.5274997, 126.8715524
W, H = 396, 500        # 지도 판 크기(px). 컴포넌트는 같은 비율(aspect 396/500)로 그린다
S = 0.74               # px / m
CX, CY = 150, 48       # 판 중심(m). SBS(북) ~ 오목교역(남)이 함께 들어오게 잡았다

BBOX = (37.5225, 126.8650, 37.5320, 126.8790)
OVERPASS = ["https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass-api.de/api/interpreter"]

OFFICE_M = (2, 1)            # 현대드림타워
HYUNDAI_M = (316, 95)        # 현대백화점 목동점
SBS_IDS = {254760684: 20, 254760685: 13}   # SBS 본관(20층)·별관 way id → 돌출 높이(px)
STATION_M = (316, 323)       # 오목교역(5호선) 역 노드
EXITS_M = {1: (210, 288), 2: (208, 165), 8: (188, 322)}
PARK_M = (155, -60)          # 오목공원


def fetch(path):
    s, w, n, e = BBOX
    q = (f"[out:json][timeout:90];("
         f'way["highway"]({s},{w},{n},{e});'
         f'way["leisure"~"park|garden|playground|pitch"]({s},{w},{n},{e});'
         f'way["landuse"~"grass|park|forest"]({s},{w},{n},{e});'
         f'way["building"]({s},{w},{n},{e});'
         f'way["railway"="subway"]({s},{w},{n},{e});'
         ");out geom tags;")
    body = urllib.parse.urlencode({"data": q}).encode()
    for url in OVERPASS:
        try:
            with urllib.request.urlopen(url, body, timeout=120) as r:
                data = r.read()
            json.loads(data)
            open(path, "wb").write(data)
            return
        except Exception as err:  # 다음 서버로
            print(f"overpass 실패 {url}: {err}", file=sys.stderr)
    sys.exit("Overpass 응답을 받지 못했다")


def m(lat, lon):
    return ((lon - LON0) * math.cos(math.radians(LAT0)) * 111320, -(lat - LAT0) * 110540)


def px(p):
    return ((p[0] - CX) * S + W / 2, (p[1] - CY) * S + H / 2)


def f(v):
    s = f"{v:.1f}"
    return s[:-2] if s.endswith(".0") else s


def d_line(pts, close=False):
    return "M" + " ".join(f"{f(x)} {f(y)}" for x, y in pts) + ("Z" if close else "")


def in_view(pts, pad=40):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return max(xs) > -pad and min(xs) < W + pad and max(ys) > -pad and min(ys) < H + pad


def pip(pt, poly):
    x, y = pt; inside = False
    for i in range(len(poly)):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % len(poly)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def seg_dist(p, a, b):
    (ax, ay), (bx, by), (x, y) = a, b, p
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / L))
    return math.hypot(x - ax - t * dx, y - ay - t * dy)


def poly_dist(p, poly, closed=True):
    n = len(poly)
    return min(seg_dist(p, poly[i], poly[(i + 1) % n]) for i in (range(n) if closed else range(n - 1)))


def area(poly):
    return sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
               for i in range(len(poly))) / 2


def svg(body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
            + body + "</svg>\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--osm", required=True)
    ap.add_argument("--fetch", action="store_true")
    a = ap.parse_args()
    if a.fetch:
        fetch(a.osm)
    osm = json.load(open(a.osm))
    ways = [e for e in osm["elements"] if e["type"] == "way" and "geometry" in e]

    roads, foot, parks, pitches, buildings, subway = [], [], [], [], [], []
    for e in ways:
        t = e.get("tags", {})
        pm = [m(g["lat"], g["lon"]) for g in e["geometry"]]
        pp = [px(p) for p in pm]
        if not in_view(pp):
            continue
        closed = pp[:-1] if pp[0] == pp[-1] else pp
        h = t.get("highway")
        if h in ("footway", "cycleway", "steps", "path", "pedestrian"):
            foot.append(pp)
        elif h and h != "construction":
            roads.append((h, pp, t.get("name")))
        elif t.get("railway") == "subway":
            subway.append(pp)
        elif t.get("leisure") in ("park", "garden") or t.get("landuse") in ("grass", "park", "forest"):
            parks.append(closed)
        elif t.get("leisure") in ("pitch", "playground"):
            pitches.append(closed)
        if "building" in t and len(pp) > 3:
            poly = closed if area(closed) > 0 else closed[::-1]   # 화면 좌표 시계 방향
            mp = pm[:-1] if pm[0] == pm[-1] else pm
            role = "sbs" if e["id"] in SBS_IDS else "office" if pip(OFFICE_M, mp) else "hyundai" if pip(HYUNDAI_M, mp) else ""
            buildings.append({"id": e["id"], "poly": poly, "type": t["building"], "role": role,
                              "levels": t.get("building:levels")})

    WR = {"trunk": 13, "primary": 12, "secondary": 10, "tertiary": 8, "primary_link": 6, "secondary_link": 6,
          "tertiary_link": 5, "residential": 5, "unclassified": 5, "living_street": 4, "service": 3}
    order = ["service", "living_street", "residential", "unclassified", "tertiary_link", "secondary_link",
             "primary_link", "tertiary", "secondary", "primary", "trunk"]
    roads.sort(key=lambda r: order.index(r[0]) if r[0] in order else 0)
    rw = lambda h: WR.get(h, 3) * S * 1.3

    # ---- 나무: 공원 안 + 큰길 가로수 ----
    random.seed(7)
    near = lambda q, b: abs(b["poly"][0][0] - q[0]) < 140 and abs(b["poly"][0][1] - q[1]) < 140
    trees = []
    for poly in parks:
        xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
        y, row = min(ys), 0
        while y < max(ys):
            x = min(xs) + (3.6 if row % 2 else 0)
            while x < max(xs):
                q = (x + random.uniform(-2, 2), y + random.uniform(-2, 2))
                if (-10 < q[0] < W + 10 and -10 < q[1] < H + 10 and pip(q, poly) and poly_dist(q, poly) > 3
                        and not any(pip(q, b["poly"]) or poly_dist(q, b["poly"]) < 3 for b in buildings if near(q, b))
                        and not any(poly_dist(q, fw, closed=False) < 2.6 for fw in foot)
                        and not any(pip(q, pc) for pc in pitches)):
                    trees.append((q[0], q[1], random.uniform(2.5, 3.6)))
                x += 7.2
            y += 6.2
            row += 1
    street = []
    for h, p, _ in roads:
        if h not in ("secondary", "tertiary", "primary"):
            continue
        half = rw(h) / 2 + 4
        for i in range(len(p) - 1):
            (x1, y1), (x2, y2) = p[i], p[i + 1]
            L = math.hypot(x2 - x1, y2 - y1)
            if L < 1:
                continue
            nx, ny = -(y2 - y1) / L, (x2 - x1) / L
            k = 4.0
            while k < L - 4:
                cx, cy = x1 + (x2 - x1) * k / L, y1 + (y2 - y1) * k / L
                for sg in (1, -1):
                    q = (cx + nx * half * sg, cy + ny * half * sg)
                    if not (-6 < q[0] < W + 6 and -6 < q[1] < H + 6):
                        continue
                    if any(poly_dist(q, rp, closed=False) < rw(rh) / 2 + 3 for rh, rp, _ in roads):
                        continue
                    if any(pip(q, b["poly"]) or poly_dist(q, b["poly"]) < 2.5 for b in buildings if near(q, b)):
                        continue
                    if any(math.dist(q, t[:2]) < 6 for t in street):
                        continue
                    street.append((q[0], q[1], 2.3))
                k += 10
    trees = sorted(trees + street, key=lambda t: t[1])

    os.makedirs(OUT, exist_ok=True)

    # ---- ground: 공원·운동장·산책길·도로·5호선·역 범위 ----
    g = []
    g += [f'<path d="{d_line(p, True)}" fill="#D2E2C2" stroke="#BCD1A9" stroke-width="1"/>' for p in parks]
    g += [f'<path d="{d_line(p, True)}" fill="#C5DBB2" stroke="#FFFFFF" stroke-opacity=".8" stroke-width="1"/>' for p in pitches]
    g += [f'<path d="{d_line(p)}" fill="none" stroke="#F4EFE4" stroke-width="1.6" stroke-linecap="round"/>' for p in foot]
    for h, p, _ in roads:
        g.append(f'<path d="{d_line(p)}" fill="none" stroke="#DCD3C2" stroke-width="{f(rw(h) + 2.2)}" stroke-linecap="round" stroke-linejoin="round"/>')
    for h, p, _ in roads:
        g.append(f'<path d="{d_line(p)}" fill="none" stroke="#FFFFFF" stroke-width="{f(rw(h))}" stroke-linecap="round" stroke-linejoin="round"/>')
    # 역 범위: 2·8번 출구 ~ 3·4번 출구 사이 오목로 아래 승강장 띠(먹 옅게). 그 위에 5호선 선로를 점선으로
    sx, sy = px(STATION_M)
    ang = 10.4
    g.append(f'<rect x="{f(sx - 92)}" y="{f(sy - 9)}" width="184" height="18" rx="9" fill="#31302E" fill-opacity=".10" '
             f'stroke="#31302E" stroke-opacity=".45" stroke-width="1" stroke-dasharray="3 2.5" transform="rotate({ang} {f(sx)} {f(sy)})"/>')
    g += [f'<path d="{d_line(p)}" fill="none" stroke="#31302E" stroke-opacity=".55" stroke-width="1.6" stroke-dasharray="5 3.5" stroke-linecap="round"/>'
          for p in subway]
    open(os.path.join(OUT, "mokdong-map-ground.svg"), "w").write(
        svg(f'<rect width="{W}" height="{H}" fill="#ECE7DC"/>' + "".join(g)))

    # ---- trees ----
    t1 = [f'<ellipse cx="{f(x + 1.6)}" cy="{f(y + 1.8)}" rx="{f(r)}" ry="{f(r * .7)}" fill="#6E8A57" fill-opacity=".22"/>' for x, y, r in trees]
    t2 = [f'<circle cx="{f(x)}" cy="{f(y - 1.2)}" r="{f(r)}" fill="#9DC487"/><circle cx="{f(x - r * .3)}" cy="{f(y - 1.2 - r * .35)}" r="{f(r * .45)}" fill="#BCD9A6"/>'
          for x, y, r in trees]
    open(os.path.join(OUT, "mokdong-map-trees.svg"), "w").write(svg("".join(t1 + t2)))

    # ---- buildings: 남쪽 면만 돌출(빛은 북서), 북쪽 건물부터 ----
    PAL = {
        "": ("#FFFDF8", "#E5DCCD", "#D8CDBA", "#D9D0BF", "rgba(70,55,30,.12)"),
        "office": ("#0B7A52", "#086444", "#075638", "#06513A", "rgba(40,50,30,.16)"),
        "sbs": ("#F2D7A4", "#E2BF83", "#D2AC6B", "#C9A060", "rgba(70,55,30,.16)"),
        "hyundai": ("#FBF4E8", "#E6D6BE", "#D8C5A8", "#D6C6AD", "rgba(70,55,30,.13)"),
    }
    TYPE_H = {"apartments": 13, "commercial": 11, "school": 6, "residential": 7, "house": 5, "retail": 7,
              "tower": 16, "public": 8, "roof": 3, "yes": 8}
    tops = {}
    out = []
    for b in sorted(buildings, key=lambda b: max(y for _, y in b["poly"])):
        poly = b["poly"]
        if b["role"] == "office":
            hg = 22
        elif b["role"] == "sbs":
            hg = SBS_IDS[b["id"]]
        elif b["role"] == "hyundai":
            hg = 15
        elif b["levels"] and b["levels"].isdigit():
            hg = min(4 + int(b["levels"]) * 0.5, 18)
        else:
            hg = TYPE_H.get(b["type"], 7)
        if abs(area(poly)) < 60:
            hg = min(hg, 5)
        roof, wall_s, wall_e, stroke, shadow = PAL[b["role"]]
        sh = [(x + hg * .55, y + hg * .25) for x, y in poly]
        out.append(f'<path d="{d_line(poly, True)} {d_line(sh, True)}" fill="{shadow}"/>')
        n = len(poly)
        for i in range(n):
            p1, p2 = poly[i], poly[(i + 1) % n]
            L = math.hypot(p2[0] - p1[0], p2[1] - p1[1]) or 1
            nx, ny = (p2[1] - p1[1]) / L, -(p2[0] - p1[0]) / L
            if ny <= 0.02:
                continue
            col = wall_e if abs(nx) > .75 else wall_s
            q = [p1, p2, (p2[0], p2[1] - hg), (p1[0], p1[1] - hg)]
            out.append(f'<path d="{d_line(q, True)}" fill="{col}" stroke="{col}" stroke-width=".4" stroke-linejoin="round"/>')
        top = [(x, y - hg) for x, y in poly]
        out.append(f'<path d="{d_line(top, True)}" fill="{roof}" stroke="{stroke}" stroke-width=".6" stroke-linejoin="round"/>')
        if b["role"]:
            cx = sum(x for x, _ in top) / len(top); cy = sum(y for _, y in top) / len(top)
            tops.setdefault(b["role"], []).append((cx, cy, min(y for _, y in top)))
    open(os.path.join(OUT, "mokdong-map-buildings.svg"), "w").write(svg("".join(out)))

    # ---- 오버레이 위치(%) ----
    pct = lambda p: {"x": round(p[0] / W * 100, 2), "y": round(p[1] / H * 100, 2)}
    lay = {
        "office_roof": pct(tops["office"][0][:2]),
        "sbs_roof": pct(max(tops["sbs"], key=lambda t: -t[2])[:2]),
        "sbs_top": round(min(t[2] for t in tops["sbs"]) / H * 100, 2),
        "station": pct(px(STATION_M)),
        "exits": {k: pct(px(v)) for k, v in EXITS_M.items()},
        "park": pct(px(PARK_M)),
        "hyundai_roof": pct(tops["hyundai"][0][:2]) if "hyundai" in tops else None,
        "roads": {},
    }
    for h, p, name in roads:
        if name and h in ("secondary", "tertiary"):
            vis = [q for q in p if 20 < q[0] < W - 20 and 20 < q[1] < H - 20]
            if len(vis) >= 2:
                (x1, y1), (x2, y2) = vis[0], vis[-1]
                L = math.hypot(x2 - x1, y2 - y1)
                if L > lay["roads"].get(name, {}).get("len", 0):
                    ang = math.degrees(math.atan2(y2 - y1, x2 - x1))
                    if ang > 90: ang -= 180
                    if ang < -90: ang += 180
                    lay["roads"][name] = {**pct(((x1 + x2) / 2, (y1 + y2) / 2)), "deg": round(ang, 1), "len": round(L)}
    print(json.dumps(lay, ensure_ascii=False, indent=1))
    for fn in sorted(os.listdir(OUT)):
        if fn.startswith("mokdong-map-"):
            print(fn, os.path.getsize(os.path.join(OUT, fn)), file=sys.stderr)


if __name__ == "__main__":
    main()
