"""Downloads NOAA NCEI statewide Feb-Mar average temperature departures (vs 1991-2020)
into weather.json.  Run:  python3 fetch_weather.py
"""
import json, urllib.request

# NCEI statewide codes (alphabetical, contiguous US). DC has no series; Maryland stands in.
STATES = ['Alabama','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida',
 'Georgia','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland',
 'Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
 'New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio',
 'Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee',
 'Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming']
URL = ('https://www.ncei.noaa.gov/access/monitoring/climate-at-a-glance/statewide/time-series/'
       '{}/tavg/2/3/1990-2026/data.csv?base_prd=true&begbaseyear=1991&endbaseyear=2020')

out = {}
for i, name in enumerate(STATES, 1):
    rows = urllib.request.urlopen(URL.format(i), timeout=60).read().decode().splitlines()
    series = {}
    for line in rows:
        parts = line.split(',')
        if len(parts) == 3 and parts[0].isdigit():
            series[int(parts[0][:4])] = float(parts[2])
    out[name] = series
    print(name, len(series), series.get(2026))
out['District of Columbia'] = out['Maryland']
json.dump(out, open('weather.json', 'w'), indent=0)
