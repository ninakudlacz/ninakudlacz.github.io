(() => {
    'use strict';

    const T = 32, COLS = 30, ROWS = 20, W = COLS * T, H = ROWS * T;
    const GRAV = 0.5, JUMP_V = 10, RUN = 3.6, AIR_RUN = 4.6, MAX_FALL = 12, PLAT_SPEED = 2;
    const PW = 24, PH = 38;
    const LIQUID = { R: 'red', B: 'blue', G: 'green' };
    // Fratboy can wade through red water, Wondergirl through blue. Green gets everyone.
    const SAFE_WATER = { frat: 'red', wonder: 'blue' };
    const LIQ_COLORS = {
        red: ['#ff6a4d', '#d8241c', '#8a0f0a'],
        blue: ['#7cc8ff', '#2a76e0', '#123f8a'],
        green: ['#a6f26a', '#3fae2a', '#1b5e12']
    };
    const LEVELS = window.LEVELS;
    const STORY = window.STORY;
    const STORE_KEY = 'fratboy-wondergirl-v2';

    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const overlay = document.getElementById('overlay');
    const $ = (id) => document.getElementById(id);

    // ---------- Persistence (best-effort) ----------
    let save = { unlocked: 1, best: {} };
    try {
        const raw = localStorage.getItem(STORE_KEY);
        if (raw) save = Object.assign(save, JSON.parse(raw));
    } catch (e) { /* storage unavailable */ }
    function persist() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
    }

    // ---------- Canvas sizing ----------
    function sizeCanvas() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    sizeCanvas();

    // ---------- Input ----------
    const controls = {
        frat: { left: false, right: false, jump: false, action: false, actionEdge: false },
        wonder: { left: false, right: false, jump: false, action: false, actionEdge: false }
    };
    const KEYMAP = {
        ArrowLeft: ['frat', 'left'], ArrowRight: ['frat', 'right'], ArrowUp: ['frat', 'jump'], ArrowDown: ['frat', 'action'],
        KeyA: ['wonder', 'left'], KeyD: ['wonder', 'right'], KeyW: ['wonder', 'jump'], KeyS: ['wonder', 'action']
    };
    function setControl(who, key, down) {
        const c = controls[who];
        if (key === 'action' && down && !c.action) c.actionEdge = true;
        c[key] = down;
    }
    window.addEventListener('keydown', (e) => {
        const m = KEYMAP[e.code];
        if (m) {
            if (state === 'playing') e.preventDefault();
            setControl(m[0], m[1], true);
            return;
        }
        if (e.code === 'KeyR' && (state === 'playing' || state === 'dead')) { startLevel(levelIndex); }
        if (e.code === 'Escape' || e.code === 'KeyP') {
            if (state === 'playing') pause();
            else if (state === 'paused') resume();
        }
        if ((e.code === 'Enter' || e.code === 'Space') && overlay.firstChild) {
            const primary = overlay.querySelector('[data-primary]');
            if (primary) { e.preventDefault(); primary.click(); }
        }
    });
    window.addEventListener('keyup', (e) => {
        const m = KEYMAP[e.code];
        if (m) setControl(m[0], m[1], false);
    });
    window.addEventListener('blur', releaseAll);
    function releaseAll() {
        for (const who in controls) for (const k in controls[who]) controls[who][k] = false;
        document.querySelectorAll('.pad button.on').forEach((b) => b.classList.remove('on'));
    }

    // Touch pads
    const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (isTouch) $('touch').hidden = false;
    document.querySelectorAll('.pad button').forEach((btn) => {
        const who = btn.dataset.who, key = btn.dataset.key;
        const down = (e) => { e.preventDefault(); btn.setPointerCapture && btn.setPointerCapture(e.pointerId); btn.classList.add('on'); setControl(who, key, true); };
        const up = (e) => { e.preventDefault(); btn.classList.remove('on'); setControl(who, key, false); };
        btn.addEventListener('pointerdown', down);
        btn.addEventListener('pointerup', up);
        btn.addEventListener('pointercancel', up);
        btn.addEventListener('lostpointercapture', up);
        btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    // ---------- World state ----------
    let state = 'menu';
    let levelIndex = 0;
    let level, grid, platforms, buttons, levers, doors, gems, kegs, players, popups, particles;
    let frame = 0, levelFrames = 0, winTimer = 0, deathTimer = 0, death = null;
    let dd = null, sticky = new Set(), chatDone = null;
    const darkCanvas = document.createElement('canvas');
    darkCanvas.width = W; darkCanvas.height = H;
    const darkCtx = darkCanvas.getContext('2d');
    let bgLayer, tileLayer;

    const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const tileAt = (c, r) => (c < 0 || c >= COLS || r < 0 || r >= ROWS) ? '#' : grid[r][c];

    function makeEnt(kind, x, y, w, h, who) {
        return { kind, who, x, y, w, h, vx: 0, vy: 0, onGround: false, facing: 1, walk: 0, moving: false, dead: false, atDoor: false };
    }

    function loadLevel(i) {
        level = LEVELS[i];
        grid = level.map.map((row) => row.split(''));
        gems = []; kegs = []; doors = {}; popups = []; particles = [];
        const spawns = {};
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const ch = grid[r][c];
                if (ch === 'f') spawns.frat = { c, r };
                else if (ch === 'w') spawns.wonder = { c, r };
                else if (ch === 'F') doors.frat = { x: c * T, y: (r - 1) * T, w: T, h: 2 * T, open: 0 };
                else if (ch === 'W') doors.wonder = { x: c * T, y: (r - 1) * T, w: T, h: 2 * T, open: 0 };
                else if (ch === 'r' || ch === 'b') gems.push({ x: c * T + 6, y: r * T + 6, w: 20, h: 20, kind: ch === 'r' ? 'beer' : 'shot', got: false, phase: (c + r) * 0.7 });
                else if (ch === 'K') kegs.push(makeEnt('keg', c * T + 2, (r + 1) * T - 30, 28, 30));
                else continue;
                grid[r][c] = '.';
            }
        }
        platforms = (level.platforms || []).map((p) => ({
            kind: 'platform', id: p.id, color: p.color,
            x0: p.x * T, y0: p.y * T, x: p.x * T, y: p.y * T, w: p.w * T, h: p.h * T,
            dx: p.dx * T, dy: p.dy * T, t: 0, active: false, ghost: false
        }));
        const colorOf = (id) => (platforms.find((p) => p.id === id) || {}).color || '#f2b33d';
        buttons = (level.buttons || []).map((b) => ({ x: b.x * T + 3, y: (b.y + 1) * T - 7, w: 26, h: 7, target: b.target, color: colorOf(b.target), pressed: false }));
        levers = (level.levers || []).map((l) => ({ x: l.x * T, y: l.y * T, w: T, h: T, target: l.target, color: colorOf(l.target), on: false, swing: -1 }));

        players = ['frat', 'wonder'].map((who) => {
            const s = spawns[who];
            const p = makeEnt('player', s.c * T + (T - PW) / 2, (s.r + 1) * T - PH, PW, PH, who);
            p.facing = 1;
            p.spawn = { x: p.x, y: p.y };
            p.inv = 0;
            let guard = 0;
            while (solidAt(p, p) && guard++ < 64) p.y -= 1;
            return p;
        });

        const tw = level.twists || {};
        dd = null;
        if (tw.dd && level.dd) {
            const [c, r] = level.dd;
            dd = { x: c * T + 5, y: r * T - 36, w: 22, h: 36, row: r, dir: 1, speed: tw.timer ? 1.4 : 1.1, walk: 0 };
        }
        sticky = new Set();
        if (tw.sticky) {
            // Jungle juice pools up on the floor right next to each pool of water
            for (let r = 1; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (!LIQUID[grid[r][c]]) continue;
                    for (const dc of [-1, -2, 1, 2]) {
                        const cc = c + dc;
                        if (tileAt(cc, r) === '#' && tileAt(cc, r - 1) !== '#' && !LIQUID[tileAt(cc, r - 1)]) sticky.add(cc + ',' + r);
                    }
                }
            }
        }
        buildStatic();
    }

    // ---------- Collision ----------
    function solidAt(r, self) {
        const c0 = Math.floor(r.x / T), c1 = Math.floor((r.x + r.w - 0.001) / T);
        const r0 = Math.floor(r.y / T), r1 = Math.floor((r.y + r.h - 0.001) / T);
        for (let rr = r0; rr <= r1; rr++) {
            for (let cc = c0; cc <= c1; cc++) {
                const ch = tileAt(cc, rr);
                if (ch === '#') return true;
                if (LIQUID[ch] && overlap(r, { x: cc * T, y: rr * T + 20, w: T, h: T - 20 })) return true;
            }
        }
        for (const p of platforms) if (!p.ghost && overlap(r, p)) return p;
        for (const k of kegs) if (k !== self && overlap(r, k)) return k;
        return null;
    }

    function moveX(e, dx) {
        const steps = Math.ceil(Math.abs(dx));
        if (!steps) return 0;
        const s = dx / steps;
        let moved = 0;
        for (let i = 0; i < steps; i++) {
            const nr = { x: e.x + s, y: e.y, w: e.w, h: e.h };
            const hit = solidAt(nr, e);
            if (!hit) { e.x += s; moved += s; continue; }
            // Step up small ledges (out of a pool, onto an elevator) while walking
            if (e.kind === 'player' && e.onGround && hit.kind !== 'keg') {
                let lifted = false;
                for (let lift = 1; lift <= 21; lift++) {
                    if (!solidAt({ x: e.x + s, y: e.y - lift, w: e.w, h: e.h }, e)) { e.y -= lift; e.x += s; moved += s; lifted = true; break; }
                }
                if (lifted) continue;
            }
            if (e.kind === 'player' && hit.kind === 'keg') {
                const km = moveX(hit, s * 0.6);
                if (Math.abs(km) > 0.001) {
                    const nr2 = { x: e.x + km, y: e.y, w: e.w, h: e.h };
                    if (!solidAt(nr2, e)) { e.x += km; moved += km; e.pushing = true; continue; }
                }
            }
            break;
        }
        return moved;
    }

    function moveY(e, dy) {
        const steps = Math.ceil(Math.abs(dy));
        if (!steps) return 0;
        const s = dy / steps;
        let moved = 0;
        for (let i = 0; i < steps; i++) {
            const nr = { x: e.x, y: e.y + s, w: e.w, h: e.h };
            if (solidAt(nr, e)) {
                if (s > 0) e.onGround = true;
                e.vy = 0;
                break;
            }
            e.y += s; moved += s;
        }
        return moved;
    }

    // ---------- Simulation ----------
    function step() {
        frame++;
        const ents = players.concat(kegs);

        for (const b of buttons) {
            b.pressed = ents.some((e) => !e.dead && overlap({ x: e.x + 2, y: e.y + e.h - 2, w: e.w - 4, h: 6 }, b));
        }
        for (const p of platforms) {
            p.active = buttons.some((b) => b.target === p.id && b.pressed) || levers.some((l) => l.target === p.id && l.on);
        }
        updatePlatforms(ents);

        for (const pl of players) updatePlayer(pl);
        for (const k of kegs) {
            k.vy = Math.min(k.vy + GRAV, MAX_FALL);
            k.onGround = false;
            moveY(k, k.vy);
        }

        for (const l of levers) l.swing += ((l.on ? 1 : -1) - l.swing) * 0.25;

        // Gems
        for (const g of gems) {
            if (g.got) continue;
            const who = g.kind === 'beer' ? 'frat' : 'wonder';
            const pl = players.find((p) => p.who === who);
            if (overlap(pl, g)) {
                g.got = true;
                const msgs = g.kind === 'beer'
                    ? ['Free beer!', 'Free beer!', 'Free beer! Shotgun it!', 'Free beer! (it’s warm)']
                    : ['Free shooter!', 'Free shooter!', 'Free shooter! Bottoms up!', 'Free shooter! (it’s blue?)'];
                popups.push({ x: g.x + 10, y: g.y, text: (g.kind === 'beer' ? '\u{1F37A} ' : '\u{1F943} ') + msgs[Math.floor(Math.random() * msgs.length)], t: 0, color: g.kind === 'beer' ? '#ffcf4a' : '#9fe0ff' });
                for (let i = 0; i < 10; i++) particles.push(spark(g.x + 10, g.y + 10, g.kind === 'beer' ? '#ff6a5a' : '#6ad0ff'));
                updateHud();
            }
        }

        // Liquids
        for (const pl of players) {
            const cx = pl.x + pl.w / 2, bottom = pl.y + pl.h;
            const c = Math.floor(cx / T);
            for (let r = Math.floor(pl.y / T); r <= Math.floor((bottom - 0.01) / T); r++) {
                const type = LIQUID[tileAt(c, r)];
                if (type && bottom > r * T + 14 && type !== SAFE_WATER[pl.who]) { kill(pl, type); return; }
            }
        }

        // Designated Driver
        if (dd) {
            const nx = dd.x + dd.dir * dd.speed;
            const front = Math.floor((dd.dir > 0 ? nx + dd.w + 2 : nx - 2) / T);
            if (tileAt(front, dd.row) !== '#' || tileAt(front, dd.row - 1) === '#') dd.dir *= -1;
            else dd.x = nx;
            dd.walk += 0.2;
            for (const pl of players) {
                if (pl.dead || pl.atDoor || pl.inv > 0) continue;
                if (overlap({ x: pl.x + 3, y: pl.y + 4, w: pl.w - 6, h: pl.h - 4 }, { x: dd.x + 3, y: dd.y + 4, w: dd.w - 6, h: dd.h - 4 })) {
                    popups.push({ x: dd.x + dd.w / 2, y: dd.y - 6, text: pick(['DD: \u201CLet\u2019s get you home.\u201D', 'DD: \u201CCar\u2019s outside. Let\u2019s go.\u201D', 'DD: \u201CYou\u2019re done, buddy.\u201D']), t: 0, color: '#f4ff4a' });
                    pl.x = pl.spawn.x; pl.y = pl.spawn.y; pl.vy = 0; pl.inv = 90;
                    let guard = 0;
                    while (solidAt(pl, pl) && guard++ < 64) pl.y -= 1;
                }
            }
        }

        // Nationals walkthrough countdown
        if (level.twists && level.twists.timer && levelFrames >= level.twists.timer * 60) { timeUp(); return; }

        // Doors
        let both = true;
        for (const pl of players) {
            const d = doors[pl.who];
            const cx = pl.x + pl.w / 2;
            pl.atDoor = cx > d.x + 2 && cx < d.x + d.w - 2 && Math.abs(pl.y + pl.h - (d.y + d.h)) < 4;
            d.open += ((pl.atDoor ? 1 : 0) - d.open) * 0.15;
            if (!pl.atDoor) both = false;
        }
        winTimer = both ? winTimer + 1 : 0;
        if (winTimer > 32) { winLevel(); return; }

        levelFrames++;
        if (levelFrames % 15 === 0) updateHud();
    }

    function updatePlayer(pl) {
        const c = controls[pl.who];
        const dir = (c.right ? 1 : 0) - (c.left ? 1 : 0);
        pl.moving = dir !== 0;
        pl.pushing = false;
        if (dir) pl.facing = dir;
        const onJuice = pl.onGround && sticky.has(Math.floor((pl.x + pl.w / 2) / T) + ',' + Math.floor((pl.y + pl.h + 1) / T));
        moveX(pl, dir * (pl.onGround ? (onJuice ? 1.9 : RUN) : AIR_RUN));

        pl.onGround = !!solidAt({ x: pl.x, y: pl.y + 1, w: pl.w, h: pl.h }, pl);
        if (c.jump && pl.onGround) { pl.vy = onJuice ? -8.8 : -JUMP_V; pl.onGround = false; }
        if (pl.inv > 0) pl.inv--;
        if (!c.jump && pl.vy < -4) pl.vy = -4;
        pl.vy = Math.min(pl.vy + GRAV, MAX_FALL);
        pl.onGround = false;
        moveY(pl, pl.vy);

        if (c.actionEdge) {
            c.actionEdge = false;
            for (const l of levers) {
                if (overlap(pl, { x: l.x - 4, y: l.y, w: l.w + 8, h: l.h })) {
                    l.on = !l.on;
                    popups.push({ x: l.x + 16, y: l.y - 4, text: l.on ? 'Click!' : 'Clack!', t: 0, color: '#fff' });
                }
            }
        }
        pl.walk = pl.moving && pl.onGround ? pl.walk + 0.3 : pl.walk * 0.8;
    }

    function updatePlatforms(ents) {
        for (const p of platforms) {
            const goal = p.active ? 1 : 0;
            if (p.t === goal) continue;
            const len = Math.hypot(p.dx, p.dy);
            const dt = (level.platformSpeed || PLAT_SPEED) / len;
            const nt = goal > p.t ? Math.min(goal, p.t + dt) : Math.max(goal, p.t - dt);
            const nx = p.x0 + p.dx * nt, ny = p.y0 + p.dy * nt;
            const my = ny - p.y;
            const live = ents.filter((e) => !e.dead);
            const riders = live.filter((e) => Math.abs(e.y + e.h - p.y) < 1.5 && e.x + e.w > p.x && e.x < p.x + p.w);
            const ox = p.x, oy = p.y;
            p.x = nx; p.y = ny;
            if (my < 0) {
                p.ghost = true;
                let ok = true;
                for (const e of live) {
                    if (riders.includes(e) || overlap(e, p)) {
                        const need = p.y - (e.y + e.h);
                        if (need < 0) {
                            moveY(e, need);
                            if (e.vy > 0) e.vy = 0;
                            if (e.y + e.h > p.y + 0.01) ok = false;
                        }
                    }
                }
                p.ghost = false;
                if (!ok) { p.x = ox; p.y = oy; continue; }
            } else {
                if (live.some((e) => !riders.includes(e) && overlap(e, p))) { p.x = ox; p.y = oy; continue; }
                for (const e of riders) moveY(e, my);
            }
            p.t = nt;
        }
    }

    function spark(x, y, color) {
        const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.5;
        return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 30 + Math.random() * 20, color };
    }

    function kill(pl, type) {
        pl.dead = true;
        death = { who: pl.who, type, x: pl.x + pl.w / 2, y: pl.y + pl.h - 8 };
        const col = LIQ_COLORS[type];
        for (let i = 0; i < 26; i++) particles.push(spark(death.x, death.y, col[i % 3]));
        deathTimer = 55;
        state = 'dying';
        releaseAll();
    }

    function timeUp() {
        death = { who: null, type: 'timer' };
        deathTimer = 30;
        state = 'dying';
        releaseAll();
    }

    // ---------- Flow ----------
    // Start a house, showing the group chat first when a new chapter begins.
    function begin(i) {
        const ch = STORY.chapters.find((c) => c.from === i);
        if (ch) showChat(ch, () => startLevel(i));
        else startLevel(i);
    }
    function startLevel(i) {
        levelIndex = i;
        loadLevel(i);
        frame = 0; levelFrames = 0; winTimer = 0; death = null;
        releaseAll();
        state = 'playing';
        overlay.innerHTML = '';
        updateHud();
        if (i === 0 && !save.seenTip) {
            save.seenTip = true; persist();
        }
        const hint = STORY.chapters[level.chapter || 0].hint;
        if (hint) popups.push({ x: W / 2, y: 70, text: hint, t: -150, color: '#f4ff4a', big: true });
        popups.push({ x: W / 2, y: hint ? 112 : 80, text: level.tip, t: -120, color: '#fff', big: true });
    }

    function pause() {
        state = 'paused';
        releaseAll();
        showMenu(true);
    }
    function resume() {
        state = 'playing';
        overlay.innerHTML = '';
    }

    const fmtTime = (f) => { const s = Math.floor(f / 60); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const counts = () => {
        const beer = gems.filter((g) => g.kind === 'beer'), shot = gems.filter((g) => g.kind === 'shot');
        return { beer: beer.filter((g) => g.got).length, beerTotal: beer.length, shot: shot.filter((g) => g.got).length, shotTotal: shot.length };
    };

    const houseTitle = (L) => (L.letters.toUpperCase() === L.name.toUpperCase() ? L.name : L.letters + '  ' + L.name);

    function updateHud() {
        if (!level) return;
        const c = counts();
        $('hud-house').textContent = houseTitle(level);
        $('hud-theme').textContent = 'Theme: ' + level.theme;
        $('hud-beer').textContent = c.beer + '/' + c.beerTotal;
        $('hud-shot').textContent = c.shot + '/' + c.shotTotal;
        const limit = level.twists && level.twists.timer;
        const timeEl = $('hud-time');
        if (limit) {
            const left = Math.max(0, limit * 60 - levelFrames);
            timeEl.textContent = fmtTime(left + 59) + ' left';
            timeEl.classList.toggle('hud-warn', left < 20 * 60);
        } else {
            timeEl.textContent = fmtTime(levelFrames);
            timeEl.classList.remove('hud-warn');
        }
        // Every free drink makes things a tiny bit blurrier
        const drinks = c.beer + c.shot;
        canvas.style.filter = drinks ? `blur(${(drinks * 0.14).toFixed(2)}px)` : '';
    }

    const DIAG = {
        red: {
            head: 'You got gonorrhea.',
            lines: ['Should’ve stayed out of the red water.', 'The burning sensation is not the shots.', 'Level over. Get tested and try again.']
        },
        blue: {
            head: 'You got chlamydia.',
            lines: ['The blue water was not a vibe.', 'It’s treatable, but this night is over.', 'Level over. Get tested and try again.']
        },
        timer: {
            head: 'Your frat is on probation.',
            lines: ['Risk management found 40 people and one working light bulb.', 'The walkthrough report is already in someone\u2019s inbox.', 'No socials until further notice.']
        },
        green: [
            { head: 'Your frat got kicked off campus.', lines: ['Nationals has been notified.', 'The green water was a conduct violation.', 'The composite photo is coming down.'] },
            { head: 'Your frat is on probation.', lines: ['No socials for the rest of the semester.', 'The green water got reported to Student Conduct.', 'Your president has to write an apology email.'] }
        ]
    };
    const pick = (a) => a[Math.floor(Math.random() * a.length)];

    function showDeath() {
        state = 'dead';
        const name = death.who === 'frat' ? 'Fratboy' : 'Wondergirl';
        const d = death.type === 'green' ? pick(DIAG.green) : DIAG[death.type];
        const lead = death.type === 'timer' ? 'Nationals walked in before you got out.' : `${name} fell in the ${death.type} water.`;
        overlay.innerHTML = `
            <div class="ov-card ov-${death.type === 'timer' ? 'green' : death.type}" role="dialog" aria-live="assertive">
                <p class="kicker">${houseTitle(level)} &middot; Night over</p>
                <p>${lead}</p>
                <p class="big">${d.head}</p>
                <p>${pick(d.lines)}</p>
                <div class="actions">
                    <button class="btn btn-primary" data-primary data-act="retry" type="button">Try again</button>
                    <button class="btn" data-act="menu" type="button">Houses</button>
                </div>
                <p class="fine">Press Enter or R to try again.</p>
            </div>`;
        bindOverlay();
    }

    function winLevel() {
        state = 'won';
        const c = counts();
        const secs = Math.floor(levelFrames / 60);
        const got = c.beer + c.shot, total = c.beerTotal + c.shotTotal;
        let rating;
        if (got === total) rating = ['Legendary night.', 'You escaped with the goods. On to the next house.'];
        else if (got >= total / 2) rating = ['Solid night out.', 'You got out clean and nobody caught anything. Next house.'];
        else rating = ['Lame night.', 'You got out, but left the free drinks behind. Next house anyway.'];
        const prev = save.best[levelIndex];
        if (!prev || got > prev.got || (got === prev.got && secs < prev.secs)) save.best[levelIndex] = { got, total, secs };
        save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, levelIndex + 2));
        persist();
        const last = levelIndex === LEVELS.length - 1;
        overlay.innerHTML = `
            <div class="ov-card" role="dialog" aria-live="polite">
                <p class="kicker">${houseTitle(level)} &middot; Escaped</p>
                <p class="big">${rating[0]}</p>
                <p>${rating[1]}</p>
                <div class="stats">
                    <div><span class="v">&#127866; ${c.beer}/${c.beerTotal}</span><span class="k">Free beers</span></div>
                    <div><span class="v">&#129347; ${c.shot}/${c.shotTotal}</span><span class="k">Free shooters</span></div>
                    <div><span class="v">${fmtTime(levelFrames)}</span><span class="k">Time</span></div>
                </div>
                <div class="actions">
                    <button class="btn btn-primary" data-primary data-act="${last ? 'final' : 'next'}" type="button">${last ? 'Finish the night' : 'On to the next house'}</button>
                    <button class="btn" data-act="retry" type="button">Replay</button>
                    <button class="btn" data-act="menu" type="button">Houses</button>
                </div>
            </div>`;
        bindOverlay();
    }

    function showChat(ch, done, finale) {
        state = 'story';
        releaseAll();
        chatDone = done;
        const side = (who) => (who === 'Fratboy' ? 'me' : who === 'Wondergirl' ? 'wg' : 'other');
        const bubbles = ch.chat.map(([who, text], k) => `
            <div class="msg msg-${side(who)}" style="animation-delay:${0.25 + k * 0.55}s">
                <span class="who">${who}</span>
                <span class="bubble">${text}</span>
            </div>`).join('');
        const twist = ch.hint ? `<p class="twist" style="animation-delay:${0.4 + ch.chat.length * 0.55}s"><b>New tonight:</b> ${ch.hint}</p>` : '';
        overlay.innerHTML = `
            <div class="ov-card chat-card" role="dialog" aria-live="polite">
                <p class="kicker">${finale ? 'Walking home' : (ch.from === 0 ? 'Greek Row' : 'Houses ' + (ch.from + 1) + '\u2013' + Math.min(LEVELS.length, ch.from + 4))} &middot; ${ch.time}</p>
                <div class="phone">
                    <div class="phone-head"><span class="phone-title">Greek Row Tonight &#127867;</span><span class="phone-sub">group chat</span></div>
                    <div class="msgs">${bubbles}</div>
                </div>
                ${twist}
                <div class="actions">
                    <button class="btn btn-primary" data-primary data-act="chat-go" type="button">${finale ? 'See how you did' : 'Let\u2019s go'}</button>
                </div>
            </div>`;
        bindOverlay();
    }

    function showFinal() {
        showChat(STORY.finale, showFinalCard, true);
    }

    function showFinalCard() {
        state = 'final';
        let got = 0, total = 0, secs = 0;
        LEVELS.forEach((_, i) => { const b = save.best[i]; if (b) { got += b.got; total += b.total; secs += b.secs; } });
        overlay.innerHTML = `
            <div class="ov-card" role="dialog">
                <p class="kicker">Greek Row &middot; Complete</p>
                <h2 class="logo"><span class="f">Fratboy</span> <span class="amp">&amp;</span> <span class="w">Wondergirl</span></h2>
                <p class="big">You escaped Greek Row.</p>
                <p>Every house on the row, escaped. No diagnoses, no sanctions and a genuinely fun, lighthearted night. Wondergirl says she&rsquo;d hang out again. Maybe.</p>
                <div class="stats">
                    <div><span class="v">${got}/${total}</span><span class="k">Best drinks grabbed</span></div>
                    <div><span class="v">${fmtTime(secs * 60)}</span><span class="k">Best total time</span></div>
                </div>
                <div class="actions">
                    <button class="btn btn-primary" data-primary data-act="menu" type="button">Back to houses</button>
                </div>
                <p class="fine">Get home safe. Call a ride, and look out for your friends.</p>
            </div>`;
        bindOverlay();
    }

    function showMenu(paused) {
        if (!paused) state = 'menu';
        const lvls = LEVELS.map((L, i) => {
            const b = save.best[i];
            const locked = i + 1 > save.unlocked;
            return `<button class="lvl" type="button" data-act="level" data-i="${i}" ${locked ? 'disabled' : ''}>
                <span class="num">House ${i + 1}${L.letters.toUpperCase() === L.name.toUpperCase() ? '' : ' &middot; ' + L.letters}</span>
                <span class="nm">${L.name}</span>
                <span class="diff" title="Difficulty">${'\u25CF'.repeat(L.difficulty || 1)}${'\u25CB'.repeat(5 - (L.difficulty || 1))}</span>
                <span class="best">${locked ? 'Locked' : b ? `Best: ${b.got}/${b.total} drinks, ${fmtTime(b.secs * 60)}` : 'Not yet escaped'}</span>
            </button>`;
        }).join('');
        overlay.innerHTML = `
            <div class="ov-card" role="dialog">
                <p class="kicker">${paused ? 'Paused' : 'A Daily Nebraskan parody'}</p>
                <h2 class="logo"><span class="f">Fratboy</span> <span class="amp">&amp;</span> <span class="w">Wondergirl</span></h2>
                <p>A fun, lighthearted night out on UNL&rsquo;s Greek Row. Escape each house through your own exit and head to the next one. Grab the free drinks. Fratboy is safe in red water, Wondergirl in blue. Nobody survives green.</p>
                <div class="actions">
                    ${paused
                        ? '<button class="btn btn-primary" data-primary data-act="resume" type="button">Resume</button><button class="btn" data-act="retry" type="button">Restart house</button>'
                        : `<button class="btn btn-primary" data-primary data-act="level" data-i="${Math.min(save.unlocked, LEVELS.length) - 1}" type="button">${save.unlocked > 1 ? 'Continue' : 'Play'}</button>`}
                    <button class="btn" data-act="how" type="button">How to play</button>
                </div>
                <div class="levels">${lvls}</div>
            </div>`;
        bindOverlay();
    }

    function showHow() {
        const back = state === 'paused' ? 'resume' : (state === 'menu' ? 'menu' : null);
        const wasPlaying = state === 'playing';
        if (wasPlaying) { state = 'paused'; releaseAll(); }
        overlay.innerHTML = `
            <div class="ov-card" role="dialog">
                <p class="kicker">How to play</p>
                <h2>Two players, one keyboard</h2>
                <ul class="how">
                    <li><b style="color:var(--frat)">Fratboy</b>: arrow keys. &uarr; jumps, &darr; pulls levers.</li>
                    <li><b style="color:var(--wonder)">Wondergirl</b>: A and D move, W jumps, S pulls levers.</li>
                    <li>Escape each house to get to the next one. Both of you have to reach your own exit: Fratboy&rsquo;s has the red EXIT sign and cap, Wondergirl&rsquo;s has the blue EXIT sign and star.</li>
                    <li>Red diamonds are Fratboy&rsquo;s free beers. Blue diamonds are Wondergirl&rsquo;s free shooters.</li>
                    <li>Fratboy is safe in red water but blue gives him chlamydia. Wondergirl is safe in blue water but red gives her gonorrhea. Green is deadly to both and gets your frat kicked off campus or put on probation.</li>
                    <li>Push kegs to climb. Stand on buttons and pull levers to move gates and elevators.</li>
                    <li>Stuck? Press R to restart the house.</li>
                </ul>
                <div class="actions">
                    <button class="btn btn-primary" data-primary data-act="${back || (wasPlaying ? 'resume' : 'menu')}" type="button">${(back === 'resume' || wasPlaying) ? 'Back to the party' : 'Got it'}</button>
                </div>
            </div>`;
        bindOverlay();
    }

    function bindOverlay() {
        overlay.querySelectorAll('[data-act]').forEach((b) => {
            b.addEventListener('click', () => {
                const act = b.dataset.act;
                if (act === 'retry') startLevel(levelIndex);
                else if (act === 'next') begin(levelIndex + 1);
                else if (act === 'level') begin(+b.dataset.i);
                else if (act === 'chat-go') { const fn = chatDone; chatDone = null; if (fn) fn(); }
                else if (act === 'menu') { showMenu(false); }
                else if (act === 'resume') resume();
                else if (act === 'how') showHow();
                else if (act === 'final') showFinal();
            });
        });
        const primary = overlay.querySelector('[data-primary]');
        if (primary && !isTouch) primary.focus({ preventScroll: true });
    }

    $('restart-btn').addEventListener('click', () => { if (level) startLevel(levelIndex); });
    $('menu-btn').addEventListener('click', () => { if (state === 'playing') pause(); else if (state !== 'paused') showMenu(false); });
    $('how-btn').addEventListener('click', showHow);
    document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pause(); });

    // ---------- Static rendering ----------
    function rand(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

    function buildStatic() {
        bgLayer = document.createElement('canvas');
        bgLayer.width = W; bgLayer.height = H;
        const b = bgLayer.getContext('2d');
        const rnd = rand(levelIndex * 97 + 13);
        const wall = level.facade || '#3a2a4a';

        // Interior wall with vertical paneling
        b.fillStyle = wall; b.fillRect(0, 0, W, H);
        for (let x = 0; x < W; x += 48) {
            b.fillStyle = 'rgba(0,0,0,0.18)'; b.fillRect(x, 0, 2, H);
            b.fillStyle = 'rgba(255,255,255,0.04)'; b.fillRect(x + 2, 0, 1, H);
        }
        // Wainscoting band on each floor
        for (let y = 0; y < H; y += 128) {
            b.fillStyle = 'rgba(0,0,0,0.22)'; b.fillRect(0, y + 84, W, 44);
            b.fillStyle = 'rgba(255,255,255,0.07)'; b.fillRect(0, y + 84, W, 2);
        }

        // Windows looking out at the next house over
        for (let i = 0; i < 4; i++) {
            const wx = 90 + i * 230 + rnd() * 40, wy = 40 + Math.floor(rnd() * 4) * 128;
            const g = b.createLinearGradient(0, wy, 0, wy + 70);
            g.addColorStop(0, '#0a0f2c'); g.addColorStop(1, '#262a5c');
            b.fillStyle = g; b.fillRect(wx, wy, 56, 70);
            b.fillStyle = 'rgba(255,255,255,0.7)';
            for (let s = 0; s < 6; s++) b.fillRect(wx + rnd() * 54, wy + rnd() * 30, 1, 1);
            b.fillStyle = '#11132e';
            b.beginPath(); b.moveTo(wx + 8, wy + 70); b.lineTo(wx + 8, wy + 46); b.lineTo(wx + 28, wy + 32); b.lineTo(wx + 48, wy + 46); b.lineTo(wx + 48, wy + 70); b.fill();
            b.fillStyle = 'rgba(255,214,120,0.7)';
            b.fillRect(wx + 15, wy + 52, 7, 8); b.fillRect(wx + 34, wy + 52, 7, 8);
            b.strokeStyle = '#e9e2d0'; b.lineWidth = 4; b.strokeRect(wx, wy, 56, 70);
            b.fillStyle = '#e9e2d0'; b.fillRect(wx + 26, wy, 4, 70); b.fillRect(wx, wy + 33, 56, 4);
        }

        // Composite photos and a paddle on the walls
        for (let i = 0; i < 7; i++) {
            const px = 40 + rnd() * (W - 120), py = 20 + Math.floor(rnd() * 5) * 128 + 30;
            b.fillStyle = '#c9a25a'; b.fillRect(px, py, 46, 34);
            b.fillStyle = '#2a2420'; b.fillRect(px + 3, py + 3, 40, 28);
            b.fillStyle = 'rgba(240,220,190,0.55)';
            for (let fy = 0; fy < 3; fy++) for (let fx = 0; fx < 6; fx++) {
                b.beginPath(); b.arc(px + 7 + fx * 6.4, py + 8 + fy * 8, 1.8, 0, Math.PI * 2); b.fill();
            }
        }

        // Big house letters on the wall
        let fs = 120;
        b.font = `bold ${fs}px Georgia, "Times New Roman", serif`;
        while (b.measureText(level.letters).width > W - 120 && fs > 40) { fs -= 6; b.font = `bold ${fs}px Georgia, "Times New Roman", serif`; }
        b.textAlign = 'center'; b.textBaseline = 'middle';
        b.fillStyle = 'rgba(244,211,106,0.16)';
        b.fillText(level.letters, W / 2, 300);

        // String lights along the ceiling of every floor
        for (let y = 36; y < H; y += 128) {
            b.strokeStyle = 'rgba(20,20,20,0.6)'; b.lineWidth = 1;
            b.beginPath();
            for (let x = 0; x <= W; x += 8) b.lineTo(x, y + Math.sin(x / 60) * 6);
            b.stroke();
            const cols = ['#ff5a5a', '#ffd35a', '#5ad1ff', '#9aff6a', '#ff7ae0'];
            for (let x = 20, i = 0; x < W; x += 40, i++) {
                const ly = y + Math.sin(x / 60) * 6 + 4;
                b.fillStyle = cols[i % cols.length];
                b.globalAlpha = 0.25; b.beginPath(); b.arc(x, ly, 8, 0, Math.PI * 2); b.fill();
                b.globalAlpha = 1; b.beginPath(); b.arc(x, ly, 2.5, 0, Math.PI * 2); b.fill();
            }
        }
        b.fillStyle = 'rgba(7,10,30,0.28)';
        b.fillRect(0, 0, W, H);

        // Tiles
        tileLayer = document.createElement('canvas');
        tileLayer.width = W; tileLayer.height = H;
        const t = tileLayer.getContext('2d');
        const isSolid = (c, r) => tileAt(c, r) === '#';
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const ch = tileAt(c, r);
                if (ch !== '#' && !LIQUID[ch]) continue;
                const x = c * T, y = r * T;
                if (ch === '#') {
                    drawBrick(t, x, y, r, c);
                    if (!isSolid(c, r - 1) && !LIQUID[tileAt(c, r - 1)]) {
                        t.fillStyle = '#c9c1ad'; t.fillRect(x, y, T, 5);
                        t.fillStyle = '#ece6d4'; t.fillRect(x, y, T, 2);
                    }
                    if (sticky.has(c + ',' + r)) {
                        t.fillStyle = 'rgba(150,40,190,0.85)';
                        t.beginPath(); t.ellipse(x + 16, y + 2, 17, 4.5, 0, 0, Math.PI * 2); t.fill();
                        t.fillStyle = 'rgba(220,120,255,0.6)';
                        t.beginPath(); t.ellipse(x + 11, y + 1, 5, 1.5, 0, 0, Math.PI * 2); t.fill();
                    }
                } else {
                    // Liquid basin: brick below the waterline
                    t.save(); t.beginPath(); t.rect(x, y + 12, T, T - 12); t.clip();
                    drawBrick(t, x, y, r, c); t.restore();
                }
            }
        }
    }

    function drawBrick(t, x, y, r, c) {
        t.fillStyle = '#7d3326';
        t.fillRect(x, y, T, T);
        t.fillStyle = '#5a2219';
        for (let row = 0; row < 4; row++) {
            const by = y + row * 8;
            t.fillRect(x, by + 7, T, 1);
            const off = ((r * 4 + row) % 2) * 8;
            for (let bx = x - off; bx < x + T; bx += 16) if (bx > x) t.fillRect(bx, by, 1, 7);
        }
        t.fillStyle = 'rgba(255,255,255,0.05)';
        t.fillRect(x, y, T, 1);
        if ((r * 7 + c * 3) % 5 === 0) { t.fillStyle = 'rgba(0,0,0,0.12)'; t.fillRect(x + 8, y + 9, 14, 6); }
    }

    // ---------- Dynamic rendering ----------
    function render() {
        ctx.clearRect(0, 0, W, H);
        if (!level) { drawAttract(); return; }
        ctx.drawImage(bgLayer, 0, 0, W, H);
        for (const p of platforms) drawPlatform(p);
        ctx.drawImage(tileLayer, 0, 0, W, H);
        drawLiquids();
        drawDoor(doors.frat, 'frat');
        drawDoor(doors.wonder, 'wonder');
        for (const b of buttons) drawButton(b);
        for (const l of levers) drawLever(l);
        for (const g of gems) if (!g.got) drawGem(g);
        for (const k of kegs) drawKeg(k);
        if (dd) drawDD(dd);
        for (const pl of players) {
            if (pl.dead || (pl.inv > 0 && (frame >> 2) % 2)) continue;
            (pl.who === 'frat' ? drawFratboy : drawWondergirl)(ctx, pl, frame);
        }
        drawParticles();
        if (level.twists && level.twists.blackout) drawDarkness();
        drawPopups();
    }

    function drawDarkness() {
        const d = darkCtx;
        d.globalCompositeOperation = 'source-over';
        d.clearRect(0, 0, W, H);
        d.fillStyle = 'rgba(3,4,12,0.95)';
        d.fillRect(0, 0, W, H);
        d.globalCompositeOperation = 'destination-out';
        const hole = (x, y, r, a) => {
            const g = d.createRadialGradient(x, y, r * 0.3, x, y, r);
            g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
            d.fillStyle = g; d.beginPath(); d.arc(x, y, r, 0, Math.PI * 2); d.fill();
        };
        for (const pl of players) if (!pl.dead) hole(pl.x + pl.w / 2, pl.y + pl.h / 2, 135 + Math.sin(frame * 0.05) * 4, 1);
        for (const who of ['frat', 'wonder']) { const dr = doors[who]; hole(dr.x + 16, dr.y - 14, 34, 0.85); }
        if (death && death.x) hole(death.x, death.y, 90, 1);
        d.globalCompositeOperation = 'source-over';
        ctx.drawImage(darkCanvas, 0, 0, W, H);
    }

    function drawDD(e) {
        const f = e.dir;
        ctx.save();
        ctx.translate(e.x + e.w / 2, e.y);
        // legs
        const sw = Math.sin(e.walk) * 3;
        ctx.fillStyle = '#2d3a5c';
        roundRect(ctx, -6 + sw, 27, 5, 9, 2); ctx.fill();
        roundRect(ctx, 1 - sw, 27, 5, 9, 2); ctx.fill();
        // hoodie
        ctx.fillStyle = '#6b7280';
        roundRect(ctx, -9, 14, 18, 15, 5); ctx.fill();
        // neon vest
        ctx.fillStyle = '#d7ff1f';
        ctx.fillRect(-9, 15, 6, 13); ctx.fillRect(3, 15, 6, 13);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-9, 22, 18, 2);
        ctx.fillStyle = '#1a1a1a';
        ctx.font = 'bold 7px "Open Sans", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('DD', 0, 18.5);
        // car keys swinging
        ctx.strokeStyle = '#d9d9d9'; ctx.lineWidth = 1.2;
        const kx = f * 11, ky = 24 + Math.sin(e.walk * 1.3) * 1.5;
        ctx.beginPath(); ctx.arc(kx, ky, 2.4, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#f2c94c'; ctx.fillRect(kx - 1, ky + 2, 2, 5);
        // head
        ctx.fillStyle = '#e8b58c';
        ctx.beginPath(); ctx.arc(0, 8, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4a3222';
        ctx.beginPath(); ctx.arc(0, 6, 8.2, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
        // sober, judging face
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(f * 2 - 3.5, 8, 2, 2); ctx.fillRect(f * 2 + 1.5, 8, 2, 2);
        ctx.fillRect(f * 2 - 2, 12.5, 4, 1.2);
        ctx.restore();
    }

    function drawAttract() {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#070b22'); g.addColorStop(1, '#3a2a55');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    function drawLiquids() {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const type = LIQUID[grid[r][c]];
                if (!type) continue;
                const [hi, mid, lo] = LIQ_COLORS[type];
                const x = c * T, y = r * T + 12;
                const g = ctx.createLinearGradient(0, y, 0, y + 16);
                g.addColorStop(0, mid); g.addColorStop(1, lo);
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.moveTo(x, y + 18);
                for (let i = 0; i <= 8; i++) {
                    const px = x + i * 4;
                    ctx.lineTo(px, y + 2 + Math.sin((px + frame * 2.2) * 0.12) * 1.8);
                }
                ctx.lineTo(x + T, y + 18);
                ctx.closePath(); ctx.fill();
                ctx.strokeStyle = hi; ctx.lineWidth = 2;
                ctx.beginPath();
                for (let i = 0; i <= 8; i++) {
                    const px = x + i * 4;
                    const py = y + 2 + Math.sin((px + frame * 2.2) * 0.12) * 1.8;
                    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
                }
                ctx.stroke();
                // Bubbles
                const bp = (frame * 0.6 + c * 37) % 60;
                if (bp < 20) {
                    ctx.fillStyle = hi;
                    ctx.globalAlpha = 1 - bp / 20;
                    ctx.beginPath(); ctx.arc(x + 8 + (c * 11) % 16, y + 14 - bp * 0.5, 1.8, 0, Math.PI * 2); ctx.fill();
                    ctx.globalAlpha = 1;
                }
                // Glow
                ctx.fillStyle = mid; ctx.globalAlpha = 0.12;
                ctx.fillRect(x, y - 10, T, 10);
                ctx.globalAlpha = 1;
            }
        }
    }

    function roundRect(c, x, y, w, h, r) {
        c.beginPath();
        c.moveTo(x + r, y);
        c.arcTo(x + w, y, x + w, y + h, r);
        c.arcTo(x + w, y + h, x, y + h, r);
        c.arcTo(x, y + h, x, y, r);
        c.arcTo(x, y, x + w, y, r);
        c.closePath();
    }

    function drawPlatform(p) {
        ctx.fillStyle = '#3a3a44';
        roundRect(ctx, p.x, p.y, p.w, p.h, 3); ctx.fill();
        ctx.fillStyle = p.color;
        if (p.h <= 20) {
            ctx.fillRect(p.x + 2, p.y + 2, p.w - 4, 4);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            for (let x = p.x + 6; x < p.x + p.w - 6; x += 12) ctx.fillRect(x, p.y + 8, 6, p.h - 10);
        } else {
            ctx.fillRect(p.x + 3, p.y + 2, p.w - 6, p.h - 4);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            for (let y = p.y + 6; y < p.y + p.h - 4; y += 10) ctx.fillRect(p.x + 3, y, p.w - 6, 3);
        }
    }

    function drawButton(b) {
        const h = b.pressed ? 3 : 7;
        ctx.fillStyle = '#2b2b33';
        ctx.fillRect(b.x - 3, b.y + 4, b.w + 6, 3);
        ctx.fillStyle = b.color;
        roundRect(ctx, b.x, b.y + 7 - h, b.w, h, 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(b.x + 3, b.y + 7 - h, b.w - 6, 1);
    }

    function drawLever(l) {
        const bx = l.x + 16, by = l.y + T;
        const ang = l.swing * 0.7;
        ctx.strokeStyle = '#ddd'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(bx, by - 6); ctx.lineTo(bx + Math.sin(ang) * 20, by - 6 - Math.cos(ang) * 20); ctx.stroke();
        ctx.fillStyle = l.color;
        ctx.beginPath(); ctx.arc(bx + Math.sin(ang) * 20, by - 6 - Math.cos(ang) * 20, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2b2b33';
        roundRect(ctx, bx - 12, by - 8, 24, 8, 3); ctx.fill();
        ctx.fillStyle = l.color;
        ctx.fillRect(bx - 9, by - 5, 18, 2);
        // Hint when a player is near
        if (players.some((p) => !p.dead && overlap(p, { x: l.x - 4, y: l.y, w: l.w + 8, h: l.h }))) {
            ctx.font = 'bold 11px "Open Sans", sans-serif';
            ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
            ctx.fillText('↓ / S', bx, l.y - 30);
        }
    }

    function drawGem(g) {
        const cx = g.x + 10, cy = g.y + 10 + Math.sin(frame * 0.07 + g.phase) * 2.5;
        const red = g.kind === 'beer';
        ctx.save();
        ctx.shadowColor = red ? '#ff5a4a' : '#4ac0ff'; ctx.shadowBlur = 10;
        ctx.fillStyle = red ? '#ff4a4a' : '#3fb6ff';
        ctx.beginPath(); ctx.moveTo(cx, cy - 10); ctx.lineTo(cx + 9, cy - 2); ctx.lineTo(cx, cy + 10); ctx.lineTo(cx - 9, cy - 2); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.fillStyle = red ? '#ffb0a8' : '#c8ecff';
        ctx.beginPath(); ctx.moveTo(cx, cy - 10); ctx.lineTo(cx + 9, cy - 2); ctx.lineTo(cx, cy - 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = red ? '#b31f1f' : '#1c6fb8';
        ctx.beginPath(); ctx.moveTo(cx, cy + 10); ctx.lineTo(cx + 9, cy - 2); ctx.lineTo(cx, cy - 2); ctx.closePath(); ctx.fill();
    }

    function drawDoor(d, who) {
        const frat = who === 'frat';
        const x = d.x, y = d.y;
        ctx.fillStyle = '#e9e2d0';
        roundRect(ctx, x - 3, y - 6, T + 6, 2 * T + 6, 4); ctx.fill();
        // The night outside, toward the next house
        const out = ctx.createLinearGradient(0, y, 0, y + 2 * T);
        out.addColorStop(0, '#0a0f2c'); out.addColorStop(1, '#2a2f66');
        ctx.fillStyle = out;
        ctx.fillRect(x + 2, y + 2, T - 4, 2 * T - 2);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + 8, y + 9, 1, 1); ctx.fillRect(x + 21, y + 14, 1, 1); ctx.fillRect(x + 13, y + 22, 1, 1);
        ctx.fillStyle = '#11132e';
        ctx.beginPath(); ctx.moveTo(x + 4, y + 2 * T); ctx.lineTo(x + 4, y + 44); ctx.lineTo(x + 16, y + 34); ctx.lineTo(x + 28, y + 44); ctx.lineTo(x + 28, y + 2 * T); ctx.fill();
        ctx.fillStyle = 'rgba(255,214,120,0.8)';
        ctx.fillRect(x + 9, y + 48, 4, 5); ctx.fillRect(x + 19, y + 48, 4, 5);
        // Door panel slides open
        const pw = (T - 4) * (1 - d.open * 0.85);
        ctx.fillStyle = '#6b3d1f';
        ctx.fillRect(x + 2 + (T - 4) - pw, y + 2, pw, 2 * T - 2);
        ctx.fillStyle = '#4c2a14';
        if (pw > 10) {
            ctx.fillRect(x + 2 + (T - 4) - pw + 4, y + 8, pw - 8, 20);
            ctx.fillRect(x + 2 + (T - 4) - pw + 4, y + 34, pw - 8, 22);
            ctx.fillStyle = '#f4d36a';
            ctx.beginPath(); ctx.arc(x + 2 + (T - 4) - pw + 5, y + 36, 2, 0, Math.PI * 2); ctx.fill();
        }
        // EXIT sign above, color-coded for who it belongs to
        ctx.fillStyle = '#111';
        roundRect(ctx, x - 6, y - 24, T + 12, 16, 3); ctx.fill();
        ctx.font = 'bold 10px "Open Sans", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = frat ? '#ff5a3d' : '#5ab8ff';
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 6;
        ctx.fillText('EXIT', x + 12, y - 15.5);
        ctx.shadowBlur = 0;
        if (frat) {
            ctx.beginPath(); ctx.arc(x + 32, y - 14, 4, Math.PI, 0); ctx.fill();
            ctx.fillRect(x + 24, y - 15, 5, 1.6);
        } else {
            star(ctx, x + 31, y - 16, 4.5, 2);
        }
        // glow when standing
        if (d.open > 0.05) {
            ctx.fillStyle = frat ? `rgba(255,120,60,${0.25 * d.open})` : `rgba(90,170,255,${0.25 * d.open})`;
            ctx.beginPath(); ctx.ellipse(x + 16, y + 2 * T, 28, 8, 0, 0, Math.PI * 2); ctx.fill();
        }
    }

    function star(c, x, y, ro, ri) {
        c.beginPath();
        for (let i = 0; i < 10; i++) {
            const r = i % 2 ? ri : ro, a = -Math.PI / 2 + i * Math.PI / 5;
            c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        c.closePath(); c.fill();
    }

    function drawKeg(k) {
        const x = k.x, y = k.y;
        const g = ctx.createLinearGradient(x, 0, x + k.w, 0);
        g.addColorStop(0, '#8b8f98'); g.addColorStop(0.35, '#f1f3f6'); g.addColorStop(0.7, '#b9bdc6'); g.addColorStop(1, '#6d717a');
        ctx.fillStyle = g;
        roundRect(ctx, x, y, k.w, k.h, 5); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x, y + 6, k.w, 2);
        ctx.fillRect(x, y + k.h - 8, k.w, 2);
        ctx.fillRect(x, y + k.h / 2 - 1, k.w, 2);
        ctx.fillStyle = '#3a3d44';
        ctx.fillRect(x + k.w / 2 - 4, y - 3, 8, 4);
        ctx.fillStyle = '#e30613';
        ctx.font = 'bold 8px "Open Sans", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('KEG', x + k.w / 2, y + 11);
    }

    function legs(c, e, color) {
        const sw = e.moving && e.onGround ? Math.sin(e.walk) * 3.5 : 0;
        const air = !e.onGround;
        c.fillStyle = color;
        roundRect(c, -7 + sw, 30 - (air ? 2 : 0), 6, 8, 2.5); c.fill();
        roundRect(c, 1 - sw, 30, 6, 8, 2.5); c.fill();
    }

    function eyes(c, f, y, lashes) {
        for (const dx of [-4.5, 4.5]) {
            const ex = f * 3 + dx;
            c.fillStyle = '#fff';
            c.beginPath(); c.ellipse(ex, y, 3.4, 4.4, 0, 0, Math.PI * 2); c.fill();
            c.fillStyle = '#111';
            c.beginPath(); c.ellipse(ex + f * 1.3, y + 0.6, 1.9, 2.6, 0, 0, Math.PI * 2); c.fill();
            c.fillStyle = '#fff';
            c.fillRect(ex + f * 1.3 - 0.5, y - 1.2, 1, 1);
            if (lashes) {
                c.strokeStyle = '#0b2a5a'; c.lineWidth = 1.2;
                c.beginPath(); c.moveTo(ex - 2.5, y - 4); c.lineTo(ex - 3.8, y - 6); c.moveTo(ex + 2.5, y - 4); c.lineTo(ex + 3.8, y - 6); c.stroke();
            }
        }
    }

    function drawFratboy(c, e, t) {
        const f = e.facing;
        const bob = e.moving && e.onGround ? Math.abs(Math.sin(e.walk)) * 1.5 : 0;
        c.save();
        c.translate(e.x + e.w / 2, e.y - bob);
        legs(c, e, '#2b2f4a');
        // Polo body
        c.fillStyle = '#d6332a';
        roundRect(c, -8, 22, 16, 11, 4); c.fill();
        c.fillStyle = '#ffffff';
        c.beginPath(); c.moveTo(-3, 22); c.lineTo(0, 26); c.lineTo(3, 22); c.closePath(); c.fill();
        // Arms
        const arm = e.moving ? Math.sin(e.walk) * 2 : 0;
        c.fillStyle = '#ff9a3a';
        roundRect(c, -11, 24 + arm, 4, 7, 2); c.fill();
        roundRect(c, 7, 24 - arm, 4, 7, 2); c.fill();
        // Back flames
        const fl = Math.sin(t * 0.35) * 1.5;
        c.fillStyle = '#ff6a1f';
        flame(c, -f * 11, 9, -f, 9 + fl);
        c.fillStyle = '#ffb02e';
        flame(c, -f * 12, 15, -f, 6 - fl);
        // Head
        const g = c.createRadialGradient(-2, 10, 2, 0, 14, 14);
        g.addColorStop(0, '#ffe07a'); g.addColorStop(0.55, '#ff9a2a'); g.addColorStop(1, '#e2421c');
        c.fillStyle = g;
        c.beginPath(); c.arc(0, 14, 13, 0, Math.PI * 2); c.fill();
        // Backwards cap: dome plus brim pointing behind him
        c.fillStyle = '#f5f5f2';
        c.beginPath(); c.arc(0, 13.5, 14, Math.PI * 1.06, Math.PI * 1.94); c.closePath(); c.fill();
        c.fillStyle = '#d6332a';
        c.fillRect(-12.5, 8.6, 25, 2.4);
        c.fillStyle = '#f5f5f2';
        roundRect(c, f > 0 ? -24 : 9, 8, 15, 3.6, 1.8); c.fill();
        c.fillStyle = '#d6332a';
        c.beginPath(); c.arc(0, -0.2, 1.8, 0, Math.PI * 2); c.fill();
        // Flame poking out of the snapback gap
        c.fillStyle = '#ffcf3a';
        flame(c, f * 7, 6, f, 6 + fl * 0.6);
        // Face
        eyes(c, f, 16, false);
        c.strokeStyle = '#7a1d0c'; c.lineWidth = 1.6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(f * 3 - 3, 22); c.quadraticCurveTo(f * 3 + 1, 24.5, f * 3 + 5, 21.2); c.stroke();
        c.restore();
    }

    function flame(c, x, y, dir, len) {
        c.beginPath();
        c.moveTo(x, y - 3);
        c.quadraticCurveTo(x + dir * len * 0.6, y - 4, x + dir * len, y - len * 0.6);
        c.quadraticCurveTo(x + dir * len * 0.5, y + 1, x + dir * len * 0.9, y + 3);
        c.quadraticCurveTo(x + dir * len * 0.3, y + 4, x, y + 4);
        c.closePath(); c.fill();
    }

    function drawWondergirl(c, e, t) {
        const f = e.facing;
        const bob = e.moving && e.onGround ? Math.abs(Math.sin(e.walk)) * 1.5 : 0;
        c.save();
        c.translate(e.x + e.w / 2, e.y - bob);
        legs(c, e, '#1f5fbf');
        // Ponytail wave flowing behind
        const sway = Math.sin(t * 0.12) * 2 + (e.moving ? 3 : 0);
        const pg = c.createLinearGradient(-f * 4, 0, -f * 24, 20);
        pg.addColorStop(0, '#62b8f5'); pg.addColorStop(1, '#2a6fd6');
        c.fillStyle = pg;
        c.beginPath();
        c.moveTo(-f * 6, 2);
        c.quadraticCurveTo(-f * (20 + sway), 0, -f * (21 + sway), 12);
        c.quadraticCurveTo(-f * (22 + sway), 22, -f * (14 + sway * 0.5), 26);
        c.quadraticCurveTo(-f * (16 + sway * 0.4), 16, -f * 9, 14);
        c.closePath(); c.fill();
        // Plain body, no outfit
        const bg = c.createLinearGradient(0, 22, 0, 34);
        bg.addColorStop(0, '#5fb4f2'); bg.addColorStop(1, '#2a6fd6');
        c.fillStyle = bg;
        roundRect(c, -7.5, 22, 15, 11, 5); c.fill();
        // Arms
        const arm = e.moving ? Math.sin(e.walk) * 2 : 0;
        c.fillStyle = '#8fd0ff';
        roundRect(c, -11, 24 + arm, 4, 7, 2); c.fill();
        roundRect(c, 7, 24 - arm, 4, 7, 2); c.fill();
        // Head
        const g = c.createRadialGradient(-2, 10, 2, 0, 14, 14);
        g.addColorStop(0, '#d8f4ff'); g.addColorStop(0.55, '#6cc0f7'); g.addColorStop(1, '#2a6fd6');
        c.fillStyle = g;
        c.beginPath(); c.arc(0, 14, 13, 0, Math.PI * 2); c.fill();
        // Wavy bangs
        c.fillStyle = '#1f5fbf';
        c.beginPath();
        c.arc(0, 14, 13.4, Math.PI * 1.02, Math.PI * 1.98);
        c.quadraticCurveTo(f * 8, 6, f * 3, 9);
        c.quadraticCurveTo(-f * 2, 5, -f * 6, 9);
        c.quadraticCurveTo(-f * 10, 6, -13, 13);
        c.closePath(); c.fill();
        // Face
        eyes(c, f, 16, true);
        c.fillStyle = '#ff8fb0'; c.globalAlpha = 0.5;
        c.beginPath(); c.arc(f * 3 - 8, 20, 2, 0, Math.PI * 2); c.arc(f * 3 + 8, 20, 2, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
        c.strokeStyle = '#0b2a5a'; c.lineWidth = 1.5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(f * 3 - 3, 21.5); c.quadraticCurveTo(f * 3, 24, f * 3 + 3, 21.5); c.stroke();
        c.restore();
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 30));
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
        }
        ctx.globalAlpha = 1;
    }

    function drawPopups() {
        for (const p of popups) {
            const a = p.big ? Math.min(1, Math.min(p.t + 120, 220 - p.t) / 30) : Math.min(1, (70 - p.t) / 20);
            if (a <= 0) continue;
            ctx.globalAlpha = Math.max(0, a);
            if (p.big) {
                ctx.font = '600 15px "Open Sans", sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                const w = Math.min(ctx.measureText(p.text).width + 30, W - 40);
                ctx.fillStyle = 'rgba(0,0,0,0.65)';
                roundRect(ctx, p.x - w / 2, p.y - 18, w, 36, 6); ctx.fill();
                ctx.fillStyle = p.color;
                ctx.fillText(p.text, p.x, p.y, W - 70);
            } else {
                ctx.font = 'bold 15px "Open Sans", sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                const y = p.y - p.t * 0.6;
                ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
                ctx.strokeText(p.text, p.x, y);
                ctx.fillStyle = p.color;
                ctx.fillText(p.text, p.x, y);
            }
        }
        ctx.globalAlpha = 1;
    }

    function tickEffects() {
        for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--; }
        particles = particles.filter((p) => p.life > 0);
        for (const p of popups) p.t++;
        popups = popups.filter((p) => (p.big ? p.t < 220 : p.t < 70));
    }

    // ---------- Main loop ----------
    let last = performance.now(), acc = 0;
    const STEP = 1000 / 60;
    function loop(now) {
        acc += Math.min(now - last, 100);
        last = now;
        while (acc >= STEP) {
            acc -= STEP;
            if (state === 'playing') step();
            if (state === 'dying') {
                frame++;
                if (--deathTimer <= 0) showDeath();
            }
            if (level && state !== 'paused') tickEffects();
        }
        render();
        requestAnimationFrame(loop);
    }

    // Debug hook for testing in the console
    window.__fw = {
        get state() { return state; }, get players() { return players; }, get platforms() { return platforms; },
        get levers() { return levers; }, get kegs() { return kegs; }, get gems() { return gems; }, get dd() { return dd; }, get death() { return death; },
        start: startLevel, controls,
        tick(n) { for (let i = 0; i < n && state === 'playing'; i++) step(); render(); return state; }
    };

    loadLevel(0);
    showMenu(false);
    requestAnimationFrame(loop);
})();
