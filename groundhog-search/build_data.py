"""Builds data.js from predictions.csv (one CSV row per predictor per year).

Run from this folder:  python3 build_data.py
"""
import csv, json, collections

GROUPS = {
    'Groundhog': 'live', 'Presumed groundhog': 'live',
    'Taxidermied groundhog': 'taxidermy', 'Taxidermied groundhogs': 'taxidermy',
    'Taxidermied yellow-bellied marmot': 'taxidermy',
    'Person in a groundhog suit': 'costume', 'Person in a gopher suit': 'costume',
    'Person in an owl suit': 'costume', 'Person in yellow-bellied marmot suit': 'costume',
    'Plush groundhog': 'plush', 'Plush prairie dog': 'plush',
    'Plush yellow-bellied marmot': 'plush', 'Groundhog puppet': 'plush',
    'Prairie dog': 'prairie', 'Vancouver Island marmot': 'prairie',
    'Statue of a prairie dog': 'object', 'Groundhog golf club cover': 'object',
    'Animatronic groundhog': 'object', 'Plastic lawn ornament': 'object',
    'Mural of a groundhog': 'object',
}  # everything else is "other" (opossum, armadillo, bullfrog, ...)

rows = list(csv.DictReader(open('predictions.csv', encoding='utf-8')))
years = sorted({int(r['year']) for r in rows})
y0, y1 = years[0], years[-1]

by_id = collections.OrderedDict()
for r in rows:
    by_id.setdefault(r['id'], []).append(r)

slug_name = {v[0]['slug']: v[0]['name'] for v in by_id.values()}
out = []
for v in by_id.values():
    f = v[0]
    h = ['.'] * (y1 - y0 + 1)   # '.' = not in the dataset that year
    notes = {}
    for r in v:
        i = int(r['year']) - y0
        h[i] = {'1': 'S', '0': 'N'}.get(r['shadow'], '-')  # S shadow, N no shadow, - no result recorded
        if r['details']:
            notes[r['year']] = r['details']
    out.append({
        'id': int(f['id']), 'name': f['name'], 'city': f['city'], 'region': f['region'],
        'country': f['country'], 'type': f['type'].replace('Taxidermied groundhogs', 'Taxidermied groundhog'),
        'group': GROUPS.get(f['type'], 'other'), 'active': f['active'] == '1',
        'image': f['image'], 'desc': f['description'], 'source': f['source'],
        'successor': slug_name.get(f['successor'], ''), 'h': ''.join(h), 'notes': notes,
    })

# Feb-Mar temperature departure (deg F vs 1991-2020) by state, from fetch_weather.py
weather = {st: [s.get(str(y)) for y in range(y0, y1 + 1)]
           for st, s in json.load(open('weather.json')).items()}

with open('data.js', 'w', encoding='utf-8') as fh:
    fh.write('window.GROUNDHOG_DATA = ' + json.dumps({'startYear': y0, 'endYear': y1, 'predictors': out, 'weather': weather},
                                                       ensure_ascii=False, separators=(',', ':')) + ';\n')
print(len(out), 'predictors', y0, y1)
