"""Build data.js from the Majors by College spreadsheet (one sheet per fall term)."""
import json, re, sys, collections
import openpyxl

SRC = sys.argv[1]
wb = openpyxl.load_workbook(SRC, data_only=True)
COLLEGE = {"Business Administration": "Business"}
progs = collections.defaultdict(dict)   # (major, college, deg) -> {year: n}
years = set()
ACR = {"It", "Cyaf", "Hrtm", "Tmfd", "Casnr", "Anr", "Ehs", "Unl", "Unk", "Uno", "Ncta", "Unmc", "Cfa", "Fpa", "Jmc", "Hr", "Ii", "Iii"}
SMALL = {"And", "Of", "In", "For", "The", "On", "To", "Or"}

ALIAS = {
    "Architectural Engr": "Architectural Engineering",
    "Construction Engr": "Construction Engineering",
    "Construction Managemnt": "Construction Management",
    "Electronics Engr": "Electronics Engineering",
    "Pre-Agricultural Engr": "Pre-Agricultural Engineering",
    "Pre-Electrical Engr": "Pre-Electrical Engineering",
    "Pre-Mechanical Engr": "Pre-Mechanical Engineering",
}

def clean(raw):
    """Tidy ALL-CAPS names and fold Raikes/Omaha program-location variants into the base major."""
    n = re.sub(r"\s*\((?:Raikes|Omaha)[^)]*\)\s*$", "", raw.strip(), flags=re.I)
    n = re.sub(r"\s+", " ", n)
    def fix(m):
        w = m.group(0).title()
        return w.upper() if w in ACR else w
    n = re.sub(r"[A-Za-z]+", fix, n.lower().title() if False else n)
    n = re.sub(r"\b(%s)\b" % "|".join(SMALL), lambda m: m.group(0).lower(), n)
    n = n[:1].upper() + n[1:]
    return ALIAS.get(n, n)

for ws in wb:
    y = int(re.search(r"(20\d\d)", ws.title).group(1))
    years.add(y)
    for r in list(ws.iter_rows(values_only=True))[1:]:
        college, name, code, deg, n = (list(r) + [None] * 5)[:5]
        if not name or not isinstance(n, (int, float)):
            continue  # skips blank rows and the grand-total row
        college = COLLEGE.get(college.strip(), college.strip())
        k = (clean(name), college, (deg or "").strip())
        progs[k][y] = progs[k].get(y, 0) + int(n)

years = sorted(years)
majors = collections.defaultdict(list)
for (name, college, deg), by in progs.items():
    majors[name].append({"college": college, "deg": deg, "n": [by.get(y) for y in years]})
out = []
for name, ps in sorted(majors.items()):
    tot = [sum(p["n"][i] or 0 for p in ps) if any(p["n"][i] is not None for p in ps) else None
           for i in range(len(years))]
    ps.sort(key=lambda p: -(p["n"][-1] or max(x or 0 for x in p["n"])))
    out.append({"name": name, "total": tot, "programs": ps})
open("enrollment-search/data.js", "w").write(
    "window.DATA=" + json.dumps({"years": years, "majors": out}, separators=(",", ":")) + ";\n")
print(len(out), "majors", years)
