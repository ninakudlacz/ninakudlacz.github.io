(function () {
    const { years, majors } = window.DATA;
    const last = years.length - 1;
    const $ = (id) => document.getElementById(id);
    const q = $("q"), list = $("list"), hint = $("hint"), detail = $("detail");
    const fmt = (n) => (n == null ? "–" : n.toLocaleString("en-US"));
    const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    majors.forEach((m) => {
        m.lower = m.name.toLowerCase();
        m.slug = slug(m.name);
        m.now = m.total[last];
        m.peak = Math.max(...m.total.map((v) => v || 0));
    });

    let matches = [], active = -1, current = null;

    // ---------- search ----------
    function search(term) {
        const t = term.trim().toLowerCase();
        if (!t) {
            return majors.filter((m) => m.now).sort((a, b) => b.now - a.now).slice(0, 8);
        }
        const words = t.split(/\s+/);
        return majors
            .map((m) => {
                if (!words.every((w) => m.lower.includes(w))) return null;
                let score = 3;
                if (m.lower.startsWith(t)) score = 0;
                else if (m.lower.includes(" " + t) || m.lower.includes("-" + t)) score = 1;
                else if (words.every((w) => new RegExp("(^|[^a-z])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(m.lower))) score = 2;
                return { m, score };
            })
            .filter(Boolean)
            .sort((a, b) => a.score - b.score || (b.m.now || 0) - (a.m.now || 0) || a.m.name.localeCompare(b.m.name))
            .map((x) => x.m);
    }

    function highlight(name, term) {
        const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
        if (!words.length) return esc(name);
        const re = new RegExp("(" + words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
        return esc(name).replace(re, "<mark>$1</mark>");
    }

    function renderList() {
        const term = q.value;
        const all = search(term);
        matches = all.slice(0, term.trim() ? 50 : 8);
        active = -1;
        hint.textContent = term.trim()
            ? all.length ? `${all.length} major${all.length === 1 ? "" : "s"} found${all.length > 50 ? " (showing the first 50)" : ""}.` : "No majors match. Try a shorter or different word."
            : "Largest majors this fall. Start typing to search all " + majors.length + ".";
        list.innerHTML = matches
            .map((m, i) => `<li role="option" id="opt${i}" data-i="${i}"><span class="n">${highlight(m.name, term)}</span><span class="m">${m.now ? fmt(m.now) + " in " + years[last] : "not offered in " + years[last]}</span></li>`)
            .join("");
        q.setAttribute("aria-expanded", matches.length ? "true" : "false");
    }

    function setActive(i) {
        const items = list.children;
        if (!items.length) return;
        active = (i + items.length) % items.length;
        [...items].forEach((li, n) => li.setAttribute("aria-selected", n === active));
        q.setAttribute("aria-activedescendant", "opt" + active);
        items[active].scrollIntoView({ block: "nearest" });
    }

    q.addEventListener("input", renderList);
    q.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
        else if (e.key === "Enter" && matches.length) { e.preventDefault(); select(matches[active < 0 ? 0 : active]); }
    });
    list.addEventListener("click", (e) => {
        const li = e.target.closest("li");
        if (li) select(matches[+li.dataset.i]);
    });

    // ---------- detail ----------
    function select(m, fromHash) {
        current = m;
        if (!fromHash) history.replaceState(null, "", "#" + m.slug);
        renderDetail(m);
    }

    function renderDetail(m) {
        detail.hidden = false;
        $("title").textContent = m.name;
        const t = m.total;
        const known = t.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0);
        const first = known[0], lastKnown = known[known.length - 1];
        const stopped = t[last] == null;

        $("summary").textContent = stopped
            ? `No students enrolled in fall ${years[last]}. Last enrolled in fall ${years[lastKnown]}.`
            : first === 0 ? `Fall ${years[0]} to fall ${years[last]}` : `First appears in fall ${years[first]}`;

        // stats
        const peakIdx = t.indexOf(m.peak);
        const base = first, end = lastKnown;
        let change = "";
        if (end > base) {
            const d = t[end] - t[base], p = t[base] ? Math.round((d / t[base]) * 100) : null;
            change = `<div class="stat"><div class="k">Change since ${years[base]}</div><div class="v ${d >= 0 ? "up" : "down"}">${d >= 0 ? "+" : "−"}${fmt(Math.abs(d))}</div><div class="s">${p == null ? "" : (p >= 0 ? "+" : "−") + Math.abs(p) + "% · "}${fmt(t[base])} → ${fmt(t[end])}</div></div>`;
        } else {
            change = `<div class="stat"><div class="k">Change</div><div class="v">–</div><div class="s">Only one year of data</div></div>`;
        }
        $("stats").innerHTML =
            `<div class="stat"><div class="k">${stopped ? "Last count (" + years[lastKnown] + ")" : "Fall " + years[last]}</div><div class="v">${fmt(t[lastKnown])}</div><div class="s">students</div></div>` +
            change +
            `<div class="stat"><div class="k">Peak</div><div class="v">${fmt(m.peak)}</div><div class="s">fall ${years[peakIdx]}</div></div>`;

        drawChart(m);
        drawTable(m);
        const multi = m.programs.length > 1;
        $("programs-box").open = false;
        $("programs-box").querySelector("summary").textContent = multi ? `See the numbers by program (${m.programs.length})` : "See the numbers by year";
        postHeight();
    }

    function drawChart(m) {
        const W = Math.max(300, Math.round($("chart").clientWidth || 760)), narrow = W < 560;
        const H = narrow ? 260 : 320, L = narrow ? 40 : 52, R = narrow ? 8 : 20, T = 28, B = 36;
        const t = m.total;
        const max = Math.max(...t.map((v) => v || 0), 1);
        const step = niceStep(max / 4);
        const top = Math.ceil(max / step) * step;
        const pad = narrow ? 10 : 24;
        const x = (i) => L + pad + (i * (W - L - R - 2 * pad)) / (years.length - 1);
        const y = (v) => T + (1 - v / top) * (H - T - B);

        let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart of students in ${esc(m.name)} by fall term, ${years[0]} to ${years[last]}. Values are listed in the table below.">`;
        s += `<g class="grid axis">`;
        for (let v = 0; v <= top; v += step) {
            s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
        }
        s += `</g><g class="axis">`;
        years.forEach((yr, i) => { if (!narrow || i % 2 === last % 2) s += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle">${narrow ? "’" + String(yr).slice(2) : yr}</text>`; });
        s += `</g>`;

        // line segments (break at gaps)
        const first = t.findIndex((v) => v != null);
        let seg = [];
        const segs = [];
        t.forEach((v, i) => {
            if (v == null) { if (seg.length) segs.push(seg); seg = []; }
            else seg.push(i);
        });
        if (seg.length) segs.push(seg);
        segs.forEach((sg) => {
            if (sg.length > 1) s += `<polyline class="line" points="${sg.map((i) => x(i) + "," + y(t[i])).join(" ")}"/>`;
        });
        t.forEach((v, i) => {
            if (v == null) return;
            s += `<circle class="dot${i === last ? " on" : ""}" cx="${x(i)}" cy="${y(v)}" r="4.5"/>`;
            if (!narrow || i === first || i === last || v === m.peak) s += `<text class="lbl" x="${x(i)}" y="${y(v) - 11}">${fmt(v)}</text>`;
        });
        years.forEach((yr, i) => {
            if (t[i] != null) s += `<circle class="hit" data-i="${i}" cx="${x(i)}" cy="${y(t[i])}" r="16"/>`;
        });
        s += `</svg>`;
        $("chart").innerHTML = s;
        $("tip").hidden = true;

        // hide value labels when crowded on narrow screens handled by CSS-free approach: tooltip on tap
        const tip = $("tip"), wrap = $("chart").parentElement;
        $("chart").querySelectorAll(".hit").forEach((c) => {
            const show = () => {
                const i = +c.dataset.i;
                const r = c.getBoundingClientRect(), w = wrap.getBoundingClientRect();
                tip.textContent = `Fall ${years[i]}: ${fmt(t[i])} students`;
                tip.style.left = r.left + r.width / 2 - w.left + "px";
                tip.style.top = r.top + r.height / 2 - w.top - 8 + "px";
                tip.hidden = false;
            };
            c.addEventListener("mouseenter", show);
            c.addEventListener("click", show);
            c.addEventListener("mouseleave", () => (tip.hidden = true));
        });
    }

    function niceStep(raw) {
        const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
        const f = raw / p;
        return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
    }

    function drawTable(m) {
        let h = `<thead><tr><th>Program</th>${years.map((y) => `<th>${y}</th>`).join("")}</tr></thead><tbody>`;
        m.programs.forEach((p) => {
            h += `<tr><td>${esc(p.college)} (${esc(p.deg || "n/a")})</td>${p.n.map((v) => `<td>${fmt(v)}</td>`).join("")}</tr>`;
        });
        h += `</tbody>`;
        if (m.programs.length > 1) h += `<tfoot><tr><td>Total</td>${m.total.map((v) => `<td>${fmt(v)}</td>`).join("")}</tr></tfoot>`;
        $("table").innerHTML = h;
    }

    // ---------- iframe support ----------
    function postHeight() {
        if (window.parent === window) return;
        const h = document.documentElement.scrollHeight;
        window.parent.postMessage({ type: "enrollment-search-height", height: h }, "*");
    }
    let lastW = 0;
    new ResizeObserver(() => {
        const w = $("chart").clientWidth;
        if (current && w && w !== lastW) { lastW = w; drawChart(current); }
        postHeight();
    }).observe(document.body);
    $("programs-box").addEventListener("toggle", postHeight);

    // ---------- init ----------
    function fromHash() {
        const s = decodeURIComponent(location.hash.slice(1));
        const m = s && majors.find((x) => x.slug === s);
        if (m) { q.value = m.name; renderList(); select(m, true); return true; }
        return false;
    }
    window.addEventListener("hashchange", fromHash);
    renderList();
    fromHash();
})();
