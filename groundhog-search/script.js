(function () {
    const { startYear, endYear, predictors, weather } = window.GROUNDHOG_DATA;
    const MIN_SCORED = 5; // fewer scored years than this is too small to rank

    const GROUPS = [
        { id: 'live', label: 'Groundhogs' },
        { id: 'taxidermy', label: 'Taxidermied' },
        { id: 'costume', label: 'Person in costume' },
        { id: 'plush', label: 'Plush & puppets' },
        { id: 'prairie', label: 'Prairie dogs & marmots' },
        { id: 'other', label: 'Other animals' },
        { id: 'object', label: 'Statues & objects' }
    ];

    const CALL = {
        S: { cls: 's', short: 'Shadow', text: 'Saw shadow (6 more weeks of winter)' },
        N: { cls: 'n', short: 'No shadow', text: 'No shadow (early spring)' },
        '-': { cls: 'x', short: 'No result', text: 'No result recorded' },
        '.': { cls: 'o', short: 'Not tracked', text: 'Not tracked' }
    };

    const $ = (id) => document.getElementById(id);
    const els = {
        q: $('q'), region: $('region'), sort: $('sort'), active: $('active'),
        groups: $('groups'), count: $('count'), reset: $('reset'),
        results: $('results'), empty: $('empty')
    };

    const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    // Precompute per-predictor record + search text
    predictors.forEach((p) => {
        const h = p.h;
        p.shadow = (h.match(/S/g) || []).length;
        p.noShadow = (h.match(/N/g) || []).length;
        p.made = p.shadow + p.noShadow;
        p.first = startYear + h.search(/[SN-]/);
        p.last = startYear + h.search(/[SN-][.]*$/);

        // Score each call against the Feb-Mar temperature departure for the predictor's state.
        // Shadow (long winter) is right if colder than normal; no shadow (early spring) if warmer.
        const dev = weather[p.region];
        p.dev = dev || null;
        p.res = [...h].map((c, i) => {
            const d = dev && dev[i];
            if (!(c === 'S' || c === 'N') || d == null || d === 0) return '.';
            return (c === 'S') === (d < 0) ? 'R' : 'W';
        }).join('');
        p.right = (p.res.match(/R/g) || []).length;
        p.scored = p.right + (p.res.match(/W/g) || []).length;
        p.acc = p.scored ? p.right / p.scored : null;
        p.haystack =norm([p.name, p.city, p.region, p.country, p.type].join(' '));
    });

    const state = { q: '', region: '', group: '', active: false, sort: 'name' };

    function el(tag, attrs, children) {
        const node = document.createElement(tag);
        Object.entries(attrs || {}).forEach(([k, v]) => {
            if (k === 'class') node.className = v;
            else if (k === 'text') node.textContent = v;
            else node.setAttribute(k, v);
        });
        (children || []).forEach((c) => c && node.appendChild(c));
        return node;
    }

    // ---- Filter controls ----
    function buildControls() {
        const byCountry = {};
        predictors.forEach((p) => { (byCountry[p.country] = byCountry[p.country] || new Set()).add(p.region); });
        Object.keys(byCountry).sort().forEach((country) => {
            const g = el('optgroup', { label: country === 'USA' ? 'United States' : country });
            [...byCountry[country]].sort().forEach((r) => {
                const n = predictors.filter((p) => p.region === r).length;
                g.appendChild(el('option', { value: r, text: `${r} (${n})` }));
            });
            els.region.appendChild(g);
        });

        const all = [{ id: '', label: 'All' }].concat(GROUPS);
        all.forEach((g) => {
            const n = g.id ? predictors.filter((p) => p.group === g.id).length : predictors.length;
            const b = el('button', { type: 'button', class: 'chip', 'data-group': g.id, 'aria-pressed': String(g.id === '') },
                [document.createTextNode(g.label), el('small', { text: String(n) })]);
            els.groups.appendChild(b);
        });
    }

    // ---- Rendering ----
    function recordBlock(p) {
        const pct = p.made ? Math.round((p.shadow / p.made) * 100) : 0;
        const accText = p.scored
            ? el('span', { class: 'acc' }, [el('b', { text: Math.round(p.acc * 100) + '%' }),
                document.createTextNode(` right (${p.right} of ${p.scored})`)])
            : el('span', { class: 'acc none', text: p.dev ? 'Too few years to score' : 'Not scored (no weather data for ' + p.country + ')' });
        const stats = el('div', { class: 'stats' }, [
            accText,
            el('span', {}, [el('b', { text: String(p.made) }), document.createTextNode(' predictions')]),
            p.made ? el('span', { class: 's' }, [el('b', { text: String(p.shadow) }), document.createTextNode(' shadow')]) : null,
            p.made ? el('span', { class: 'n' }, [el('b', { text: String(p.noShadow) }), document.createTextNode(' no shadow')]) : null,
            el('span', { text: p.first === p.last ? `Since ${p.first}` : `${p.first}–${p.last}` })
        ]);

        const split = p.made ? el('div', { class: 'split', 'aria-hidden': 'true' }, [
            el('i', { class: 's', style: `width:${pct}%` }),
            el('i', { class: 'n', style: `width:${100 - pct}%` })
        ]) : null;

        const strip = el('div', { class: 'strip', role: 'img',
            'aria-label': `Year-by-year calls ${startYear} to ${endYear}: ${p.shadow} shadow, ${p.noShadow} no shadow.` });
        [...p.h].forEach((c, i) => {
            const cell = el('span', { class: 'cell ' + CALL[c].cls, title: `${startYear + i}: ${CALL[c].text}` });
            strip.appendChild(cell);
        });
        const axis = el('div', { class: 'axis', 'aria-hidden': 'true' }, [
            el('span', { text: String(startYear) }), el('span', { text: String(endYear) })
        ]);
        let outcome = null;
        if (p.scored) {
            outcome = el('div', { class: 'strip result', role: 'img',
                'aria-label': `Right or wrong each year: ${p.right} right, ${p.scored - p.right} wrong.` });
            [...p.res].forEach((c, i) => outcome.appendChild(el('span', {
                class: 'cell ' + (c === 'R' ? 'r' : c === 'W' ? 'w' : 'o'),
                title: `${startYear + i}: ${c === 'R' ? 'Right' : c === 'W' ? 'Wrong' : 'Not scored'}`
            })));
        }
        return el('div', { class: 'record' }, [stats, split, strip, outcome, axis]);
    }

    function weatherNote(d, region) {
        return `Feb–Mar in ${region} was ${Math.abs(d).toFixed(1)}°F ${d < 0 ? 'colder' : 'warmer'} than normal.`;
    }

    function detailsBlock(p) {
        const d = el('details', { class: 'more' }, [el('summary', { text: 'About & full history' })]);
        if (p.desc) d.appendChild(el('p', { text: p.desc }));
        if (p.successor) d.appendChild(el('p', { text: `Succeeded by ${p.successor}.` }));
        if (p.source && /^https?:\/\//.test(p.source)) {
            d.appendChild(el('p', {}, [el('a', { href: p.source, target: '_blank', rel: 'noopener', text: 'Source' })]));
        }
        const body = el('tbody');
        [...p.h].forEach((c, i) => {
            if (c === '.') return;
            const y = startYear + i;
            body.appendChild(el('tr', {}, [
                el('th', { scope: 'row', text: String(y) }),
                el('td', {}, [
                    el('span', { class: 'pill ' + CALL[c].cls, text: CALL[c].short }),
                    p.res[i] !== '.' ? el('span', { class: 'verdict', text: ` → ${p.res[i] === 'R' ? 'Right' : 'Wrong'}` }) : null,
                    p.res[i] !== '.' ? el('div', { class: 'note', text: weatherNote(p.dev[i], p.region) }) : null,
                    p.notes[y] ? el('div', { class: 'note', text: p.notes[y] }) : null
                ])
            ]));
        });
        const table = el('table', { class: 'hist' }, [body]);
        d.appendChild(table);
        return d;
    }

    function card(p) {
        const avatar = el('div', { class: 'avatar', 'aria-hidden': 'true', text: '🦡' });
        if (p.image) {
            const img = el('img', { class: 'avatar', src: p.image, alt: '', loading: 'lazy', width: '56', height: '56' });
            img.addEventListener('error', () => img.replaceWith(avatar));
            var pic = img;
        }
        const place = [p.city, p.region].filter(Boolean).join(', ');
        return el('li', { class: 'card' }, [
            el('div', { class: 'card-head' }, [
                pic || avatar,
                el('div', { class: 'card-title' }, [
                    el('h2', { text: p.name }),
                    el('div', { class: 'place', text: `${place}, ${p.country}` }),
                    el('div', { class: 'tags' }, [
                        el('span', { class: 'tag', text: p.type }),
                        el('span', { class: 'tag' + (p.active ? '' : ' retired'), text: p.active ? 'Active' : 'Retired' })
                    ])
                ])
            ]),
            recordBlock(p),
            detailsBlock(p)
        ]);
    }

    function filtered() {
        const terms = norm(state.q).split(/\s+/).filter(Boolean);
        const list = predictors.filter((p) =>
            (!state.region || p.region === state.region) &&
            (!state.group || p.group === state.group) &&
            (!state.active || p.active) &&
            terms.every((t) => p.haystack.includes(t)));
        const by = {
            name: (a, b) => a.name.localeCompare(b.name),
            made: (a, b) => b.made - a.made || a.name.localeCompare(b.name),
            acc: (a, b) => {
                const ra = a.scored >= MIN_SCORED ? a.acc : -1, rb = b.scored >= MIN_SCORED ? b.acc : -1;
                return rb - ra || b.scored - a.scored || a.name.localeCompare(b.name);
            },
            recent: (a, b) => b.first - a.first || a.name.localeCompare(b.name)
        }[state.sort];
        return list.sort(by);
    }

    function render() {
        const list = filtered();
        els.results.replaceChildren(...list.map(card));
        els.empty.hidden = list.length > 0;
        els.count.textContent = `${list.length} of ${predictors.length} predictors`;
        const dirty = state.q || state.region || state.group || state.active;
        els.reset.hidden = !dirty;
        els.groups.querySelectorAll('.chip').forEach((b) =>
            b.setAttribute('aria-pressed', String(b.dataset.group === state.group)));
        reportHeight();
    }

    // ---- Events ----
    let timer;
    els.q.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => { state.q = els.q.value; render(); }, 120);
    });
    els.region.addEventListener('change', () => { state.region = els.region.value; render(); });
    els.sort.addEventListener('change', () => { state.sort = els.sort.value; render(); });
    els.active.addEventListener('change', () => { state.active = els.active.checked; render(); });
    els.groups.addEventListener('click', (e) => {
        const b = e.target.closest('.chip');
        if (b) { state.group = b.dataset.group; render(); }
    });
    els.reset.addEventListener('click', () => {
        Object.assign(state, { q: '', region: '', group: '', active: false });
        els.q.value = ''; els.region.value = ''; els.active.checked = false;
        render();
        els.q.focus();
    });

    // ---- Iframe support: tell the parent page how tall we are ----
    function reportHeight() {
        if (window.parent === window) return;
        const h = document.documentElement.scrollHeight;
        window.parent.postMessage({ type: 'groundhog-search-height', height: h }, '*');
    }
    if (window.ResizeObserver) new ResizeObserver(reportHeight).observe(document.body);

    buildControls();
    render();
})();
