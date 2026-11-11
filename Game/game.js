(() => {
"use strict";

// ---------- Config ----------
const ROUNDS = 5;
const MIN_YEAR = 1900;
const MAX_YEAR = 2026;
const START_YEAR = 1970;
const ROUND_SECONDS = 60;
const LAUNCH_DAY = "2026-11-11";           // Daily #1
const TZ = "America/Chicago";
const PEER_PREFIX = "dn-throwback-";
const STORE = "ct-";                        // localStorage key prefix

const BOUNDS_ALL  = [[40.8115, -96.7110], [40.8350, -96.6595]];
const BOUNDS_CITY = [[40.8130, -96.7090], [40.8240, -96.6950]];
const BOUNDS_EAST = [[40.8255, -96.6770], [40.8345, -96.6600]];
const MAX_BOUNDS  = [[40.800, -96.730], [40.850, -96.640]];
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const PHOTOS = window.PHOTOS || [];
const BY_ID = Object.fromEntries(PHOTOS.map(p => [p.id, p]));

// ---------- Helpers ----------
const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString("en-US");
const store = {
    get(k, d) { try { const v = localStorage.getItem(STORE + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(STORE + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

function hashStr(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; }
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle(arr, rand = Math.random) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function distanceM(lat1, lon1, lat2, lon2) {
    const R = 6371000, r = Math.PI / 180;
    const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}
function fmtDist(m) {
    if (m == null) return "No guess";
    const ft = m * 3.28084;
    return ft < 1000 ? `${fmt(ft)} ft away` : `${(m / 1609.34).toFixed(2)} mi away`;
}

// Location: full marks within 25 m, then decays. ~100 m = 4,000; ~300 m = 2,300; across to the other campus ≈ 0.
function locationScore(m) {
    if (m == null) return 0;
    if (m <= 25) return 5000;
    return Math.round(5000 * Math.exp(-(m - 25) / 350));
}
// Year: exact = 5,000, then steps down; 30+ years off = 0.
function yearScore(diff) {
    diff = Math.abs(diff);
    const near = [5000, 4800, 4600, 4300, 4000, 3700];
    if (diff <= 5) return near[diff];
    return Math.max(0, Math.round(3700 * (1 - (diff - 5) / 25)));
}
const square = pts => pts >= 4000 ? "🟩" : pts >= 2000 ? "🟨" : "🟥";

function todayKey(d = new Date()) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function dayDiff(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000); }
function dailyNumber(key) { return dayDiff(LAUNCH_DAY, key) + 1; }
function dailyPhotos(key) {
    // Same five for everyone: two older photos (before 1980) and three newer, in a shuffled order.
    const rand = rng(hashStr("daily:" + key));
    const old = shuffle(PHOTOS.filter(p => p.year < 1980), rand);
    const recent = shuffle(PHOTOS.filter(p => p.year >= 1980), rand);
    let pick = old.slice(0, 2).concat(recent.slice(0, 3));
    if (pick.length < ROUNDS) pick = pick.concat(shuffle(PHOTOS.filter(p => !pick.includes(p)), rand)).slice(0, ROUNDS);
    return shuffle(pick, rand);
}
function randomPhotos() {
    const seen = new Set(store.get("seen", []));
    let fresh = PHOTOS.filter(p => !seen.has(p.id));
    if (fresh.length < ROUNDS) { store.set("seen", []); fresh = PHOTOS.slice(); }
    const pick = shuffle(fresh).slice(0, ROUNDS);
    store.set("seen", [...seen, ...pick.map(p => p.id)]);
    return pick;
}

// ---------- State ----------
const S = {
    mode: null,          // "daily" | "solo" | "challenge" | "mp"
    photos: [],
    round: 0,
    guesses: [],         // {lat, lon, year, dist, loc, yr, pts}
    dailyKey: null,
    challenge: null,     // {ids, score, name}
    pin: null,
    submitted: false,
};
const MP = { peer: null, isHost: false, code: null, conn: null, conns: new Map(), players: new Map(), myId: null, timer: true, started: false, roundGuesses: new Map(), lastReveal: null };

// ---------- Screens ----------
const screens = ["home", "lobby", "game", "result", "final"];
function show(name) {
    screens.forEach(s => { $("screen-" + s).hidden = s !== name; });
    window.scrollTo({ top: 0 });
    if (name === "game") setTimeout(() => guessMap.invalidateSize(), 0);
    if (name === "result") setTimeout(() => resMap.invalidateSize(), 0);
}

// ---------- Maps ----------
function makeMap(el) {
    const m = L.map(el, { maxBounds: MAX_BOUNDS, maxBoundsViscosity: 0.8, minZoom: 13, maxZoom: 19, zoomSnap: 0.25 });
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(m);
    m.fitBounds(BOUNDS_ALL);
    return m;
}
const pinIcon = cls => L.divIcon({ className: "", html: `<div class="pin ${cls}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
const labelIcon = text => { const d = document.createElement("div"); d.className = "pin-label"; d.textContent = text; return L.divIcon({ className: "", html: d.outerHTML, iconSize: null, iconAnchor: [-12, 8] }); };

const guessMap = makeMap("map");
const resMap = makeMap("res-map");
const resLayer = L.layerGroup().addTo(resMap);
let guessMarker = null;

guessMap.on("click", e => {
    if (S.submitted) return;
    S.pin = e.latlng;
    if (guessMarker) guessMarker.setLatLng(e.latlng);
    else guessMarker = L.marker(e.latlng, { icon: pinIcon("pin-guess"), keyboard: false }).addTo(guessMap);
    updateGuessBtn();
});
document.querySelectorAll("[data-jump]").forEach(b => b.addEventListener("click", () => {
    guessMap.flyToBounds(b.dataset.jump === "east" ? BOUNDS_EAST : BOUNDS_CITY, { duration: 0.5 });
}));

// ---------- Year control ----------
const yearInput = $("year");
yearInput.max = MAX_YEAR; $("year-max").textContent = MAX_YEAR;
function setYear(y) { y = Math.min(MAX_YEAR, Math.max(MIN_YEAR, y)); yearInput.value = y; $("year-out").textContent = y; }
yearInput.addEventListener("input", () => setYear(+yearInput.value));
document.querySelectorAll("[data-step]").forEach(b => b.addEventListener("click", () => setYear(+yearInput.value + +b.dataset.step)));

function updateGuessBtn() {
    const btn = $("guess-btn");
    if (S.submitted) { btn.disabled = true; return; }
    btn.disabled = !S.pin;
    btn.textContent = S.pin ? "Make guess" : "Place a pin on the map";
}

// ---------- Game flow ----------
function startGame(mode, photos) {
    S.mode = mode; S.photos = photos; S.round = 0; S.guesses = [];
    $("mode-label").textContent = { daily: `Daily #${dailyNumber(S.dailyKey || todayKey())}`, solo: "Unlimited", challenge: "Challenge", mp: `Room ${MP.code}` }[mode];
    if (mode === "daily") {
        const prog = store.get("daily-progress-" + S.dailyKey, null);
        if (prog && prog.guesses) { S.guesses = prog.guesses; S.round = prog.guesses.length; }
        if (S.round >= ROUNDS) return finishGame();
    }
    startRound();
}

function startRound() {
    const p = S.photos[S.round];
    S.pin = null; S.submitted = false;
    if (guessMarker) { guessMap.removeLayer(guessMarker); guessMarker = null; }
    setYear(START_YEAR);
    $("photo").src = p.img;
    $("round-n").textContent = S.round + 1;
    $("total").textContent = fmt(S.guesses.reduce((a, g) => a + g.pts, 0));
    updateGuessBtn();
    show("game");
    guessMap.fitBounds(BOUNDS_ALL);
    // Preload the next photo
    const nxt = S.photos[S.round + 1]; if (nxt) { const im = new Image(); im.src = nxt.img; }
    if (S.mode === "mp" && MP.timer) startTimer(ROUND_SECONDS, () => submitGuess(true)); else stopTimer();
}

function submitGuess(timedOut = false) {
    if (S.submitted) return;
    S.submitted = true; stopTimer();
    const p = S.photos[S.round];
    const year = +yearInput.value;
    const dist = S.pin ? distanceM(S.pin.lat, S.pin.lng, p.lat, p.lon) : null;
    const loc = locationScore(dist), yr = yearScore(year - p.year);
    const g = { lat: S.pin ? S.pin.lat : null, lon: S.pin ? S.pin.lng : null, year, dist, loc, yr, pts: loc + yr };
    S.guesses[S.round] = g;
    if (S.mode === "daily") store.set("daily-progress-" + S.dailyKey, { guesses: S.guesses });
    if (S.mode === "mp") {
        const btn = $("guess-btn"); btn.disabled = true;
        btn.textContent = timedOut ? "Time’s up! Waiting for others…" : "Waiting for other players…";
        mpSendGuess(g);
        return;
    }
    showResult();
}
$("guess-btn").addEventListener("click", () => submitGuess());

function showResult(reveal) {
    const p = S.photos[S.round], g = S.guesses[S.round];
    $("res-round").textContent = `Round ${S.round + 1} of ${ROUNDS} · ${p.campus} Campus · ${p.year}`;
    $("res-place").textContent = p.place;
    $("res-caption").textContent = p.caption;
    $("res-points").textContent = fmt(g.pts);
    $("res-loc-pts").textContent = fmt(g.loc);
    $("res-dist").textContent = fmtDist(g.dist);
    $("res-year-pts").textContent = fmt(g.yr);
    const diff = g.year - p.year;
    $("res-year").textContent = `You said ${g.year}${diff === 0 ? " — exactly right" : ` · ${Math.abs(diff)} year${Math.abs(diff) === 1 ? "" : "s"} ${diff > 0 ? "late" : "early"}`}`;
    $("res-photo").src = p.img; $("res-photo").alt = p.caption;
    const cr = $("res-credit"); cr.textContent = `Photo: ${p.credit} (${p.license}). `;
    const a = document.createElement("a"); a.href = p.source; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Source"; cr.appendChild(a);

    // Map
    resLayer.clearLayers();
    const ans = L.latLng(p.lat, p.lon), pts = [ans];
    L.marker(ans, { icon: pinIcon("pin-answer"), zIndexOffset: 1000 }).addTo(resLayer).bindTooltip(p.place);
    if (reveal) {
        for (const o of reveal.guesses) {
            if (o.id === MP.myId || o.lat == null) continue;
            const ll = L.latLng(o.lat, o.lon); pts.push(ll);
            L.marker(ll, { icon: pinIcon("pin-other") }).addTo(resLayer);
            L.marker(ll, { icon: labelIcon(o.name), interactive: false }).addTo(resLayer);
            L.polyline([ll, ans], { color: "#777", weight: 2, dashArray: "4 6" }).addTo(resLayer);
        }
    }
    if (g.lat != null) {
        const ll = L.latLng(g.lat, g.lon); pts.push(ll);
        L.polyline([ll, ans], { color: "#305b80", weight: 3, dashArray: "6 6" }).addTo(resLayer);
        L.marker(ll, { icon: pinIcon("pin-guess"), zIndexOffset: 900 }).addTo(resLayer);
        if (reveal) L.marker(ll, { icon: labelIcon("You"), interactive: false }).addTo(resLayer);
    }
    show("result");
    setTimeout(() => { if (pts.length > 1) resMap.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 18 }); else resMap.setView(ans, 17); }, 30);

    // Multiplayer board + who controls "Next"
    const board = $("res-board"), next = $("next-btn"), wait = $("res-wait");
    if (reveal) {
        board.hidden = false; board.innerHTML = "";
        reveal.standings.forEach(s => {
            const li = document.createElement("li"); if (s.id === MP.myId) li.className = "me";
            const who = document.createElement("span"); who.className = "who"; who.textContent = s.name;
            const plus = document.createElement("span"); plus.className = "plus"; plus.textContent = s.roundPts != null ? `+${fmt(s.roundPts)}` : "";
            const tot = document.createElement("span"); tot.className = "pts"; tot.textContent = fmt(s.total);
            li.append(who, plus, tot); board.appendChild(li);
        });
        next.hidden = !MP.isHost; wait.hidden = MP.isHost;
        wait.textContent = "Waiting for the host to continue…";
    } else { board.hidden = true; next.hidden = false; wait.hidden = true; }
    next.textContent = S.round + 1 >= ROUNDS ? "See final score" : "Next photo";
    next.focus({ preventScroll: true });
}

$("next-btn").addEventListener("click", () => {
    if (S.mode === "mp") { if (MP.isHost) mpHostNext(); return; }
    advance();
});
function advance() {
    S.round++;
    if (S.round >= ROUNDS) finishGame(); else startRound();
}

function finishGame(standings) {
    stopTimer();
    const total = S.guesses.reduce((a, g) => a + g.pts, 0);
    $("final-total").textContent = fmt(total);
    const kick = { daily: `Daily #${dailyNumber(S.dailyKey)} · ${S.dailyKey}`, solo: "Unlimited", challenge: "Challenge", mp: `Room ${MP.code}` }[S.mode];
    $("final-kicker").textContent = kick;
    let line = rating(total);
    if (S.mode === "challenge" && S.challenge) {
        const them = S.challenge.score, name = S.challenge.name || "Your friend";
        line = total > them ? `You beat ${name}’s ${fmt(them)}!` : total === them ? `You tied ${name} at ${fmt(them)}.` : `${name} scored ${fmt(them)}. So close.`;
    }
    if (S.mode === "daily") {
        const r = { total, guesses: S.guesses.map(g => ({ loc: g.loc, yr: g.yr, pts: g.pts, year: g.year, dist: g.dist })) };
        if (!store.get("daily-" + S.dailyKey, null)) { store.set("daily-" + S.dailyKey, r); bumpStreak(S.dailyKey); }
        line += " Come back tomorrow for new photos.";
    }
    $("final-line").textContent = line;

    const tb = $("final-rows"); tb.innerHTML = "";
    S.photos.forEach((p, i) => {
        const g = S.guesses[i]; if (!g) return;
        const tr = document.createElement("tr");
        const c = t => { const td = document.createElement("td"); if (t != null) td.textContent = t; tr.appendChild(td); return td; };
        c(i + 1);
        const im = document.createElement("img"); im.src = p.img; im.alt = ""; c().appendChild(im);
        const a = c(); a.textContent = p.place; const s1 = document.createElement("div"); s1.className = "sub"; s1.textContent = p.year; a.appendChild(s1);
        const y = c(); y.textContent = g.year; const s2 = document.createElement("div"); s2.className = "sub"; s2.textContent = fmtDist(g.dist); y.appendChild(s2);
        c(fmt(g.pts));
        tb.appendChild(tr);
    });

    const fb = $("final-board");
    if (standings) {
        fb.hidden = false; fb.innerHTML = "";
        standings.forEach(s => {
            const li = document.createElement("li"); if (s.id === MP.myId) li.className = "me";
            const who = document.createElement("span"); who.className = "who"; who.textContent = s.name;
            const tot = document.createElement("span"); tot.className = "pts"; tot.textContent = fmt(s.total);
            li.append(who, tot); fb.appendChild(li);
        });
    } else fb.hidden = true;

    $("challenge-btn").hidden = !(S.mode === "solo" || S.mode === "challenge");
    $("again-btn").hidden = S.mode === "daily" || S.mode === "mp";
    $("share-msg").textContent = "";
    show("final");
}

function rating(t) {
    if (t >= 45000) return "Legendary. You might be Herbie Husker.";
    if (t >= 38000) return "You know this campus inside and out.";
    if (t >= 30000) return "Solid. A true Husker.";
    if (t >= 20000) return "Not bad. Maybe take a walk across campus.";
    return "Time for a campus tour.";
}

function bumpStreak(key) {
    const st = store.get("streak", { last: null, count: 0, best: 0 });
    if (st.last === key) return;
    st.count = st.last && dayDiff(st.last, key) === 1 ? st.count + 1 : 1;
    st.last = key; st.best = Math.max(st.best || 0, st.count);
    store.set("streak", st);
}

// ---------- Sharing ----------
const baseUrl = () => location.origin + location.pathname;
function shareText() {
    const total = S.guesses.reduce((a, g) => a + g.pts, 0);
    const head = S.mode === "daily" ? `Campus Throwback #${dailyNumber(S.dailyKey)}` : "Campus Throwback";
    const where = S.guesses.map(g => square(g.loc)).join("");
    const when = S.guesses.map(g => square(g.yr)).join("");
    return `${head}\n${fmt(total)}/50,000\n📍 ${where}\n📅 ${when}\n${baseUrl()}`;
}
async function copyOrShare(text, okMsg) {
    try {
        if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ text }); return; }
        await navigator.clipboard.writeText(text);
        $("share-msg").textContent = okMsg;
    } catch { window.prompt("Copy this:", text); }
}
$("share-btn").addEventListener("click", () => copyOrShare(shareText(), "Copied! Paste it anywhere."));
$("challenge-btn").addEventListener("click", () => {
    const total = S.guesses.reduce((a, g) => a + g.pts, 0);
    const name = store.get("name", "") || "";
    const u = new URL(baseUrl());
    u.searchParams.set("c", S.photos.map(p => p.id).join("."));
    u.searchParams.set("s", total);
    if (name) u.searchParams.set("n", name);
    copyOrShare(`Can you beat my ${fmt(total)} on Campus Throwback? ${u}`, "Challenge link copied. Send it to a friend.");
});
$("again-btn").addEventListener("click", () => startGame("solo", randomPhotos()));

// ---------- Timer ----------
let timerId = null;
function startTimer(sec, onEnd) {
    stopTimer();
    const el = $("timer"); el.hidden = false;
    const end = Date.now() + sec * 1000;
    const tick = () => {
        const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
        el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
        el.classList.toggle("low", left <= 10);
        if (left <= 0) { stopTimer(); onEnd(); }
    };
    tick(); timerId = setInterval(tick, 250);
}
function stopTimer() { clearInterval(timerId); timerId = null; $("timer").hidden = true; }

// ---------- Home ----------
function renderHome() {
    const key = todayKey();
    const done = store.get("daily-" + key, null);
    const prog = store.get("daily-progress-" + key, null);
    const st = store.get("streak", { last: null, count: 0, best: 0 });
    const alive = st.last && dayDiff(st.last, key) <= 1 ? st.count : 0;
    $("daily-status").textContent = done
        ? `You scored ${fmt(done.total)} on Daily #${dailyNumber(key)}. New photos at midnight.`
        : `Daily #${dailyNumber(key)}: the same five photos for everyone, new each day at midnight.`;
    $("daily-btn").textContent = done ? "See today’s results" : prog ? "Resume today’s game" : "Play today’s game";
    $("streak").textContent = alive ? `🔥 ${alive}-day streak${st.best > alive ? ` · best ${st.best}` : ""}` : (st.best ? `Best streak: ${st.best} days` : "");
}
$("daily-btn").addEventListener("click", () => {
    S.dailyKey = todayKey();
    const done = store.get("daily-" + S.dailyKey, null);
    S.photos = dailyPhotos(S.dailyKey);
    if (done) {
        const prog = store.get("daily-progress-" + S.dailyKey, null);
        S.mode = "daily";
        S.guesses = prog ? prog.guesses : done.guesses;
        finishGame(); return;
    }
    startGame("daily", S.photos);
});
$("solo-btn").addEventListener("click", () => startGame("solo", randomPhotos()));
document.querySelectorAll("[data-home]").forEach(b => b.addEventListener("click", goHome));
$("quit-btn").addEventListener("click", () => {
    const msg = S.mode === "mp" ? "Leave this game? You’ll drop out of the room." : S.mode === "daily" ? "Leave for now? Your daily progress is saved." : "Quit this game?";
    if (confirm(msg)) goHome();
});
function goHome() { stopTimer(); mpTeardown(); renderHome(); show("home"); history.replaceState(null, "", baseUrl()); }

// Lightbox + help
$("photo-btn").addEventListener("click", () => { $("lightbox-img").src = $("photo").src; $("lightbox").hidden = false; });
$("lightbox").addEventListener("click", () => { $("lightbox").hidden = true; });
document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("lightbox").hidden) { $("lightbox").hidden = true; return; }
    if (e.key === "Enter" && !$("screen-game").hidden && !$("guess-btn").disabled && document.activeElement.tagName !== "BUTTON") submitGuess();
});
$("how-btn").addEventListener("click", () => $("how").showModal());

// ---------- Multiplayer (PeerJS, host-authoritative) ----------
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const newCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
const lobbyMsg = t => { $("lobby-msg").textContent = t; };

function openLobby(asHost, code) {
    mpTeardown();
    show("lobby");
    $("player-name").value = store.get("name", "");
    $("lobby-join").hidden = asHost; $("lobby-room").hidden = !asHost;
    $("lobby-players").hidden = true; $("join-btn").hidden = asHost;
    $("join-btn").disabled = false;
    $("host-controls").hidden = true; $("lobby-wait").hidden = true;
    $("player-name").disabled = false;
    lobbyMsg("");
    if (typeof Peer === "undefined") { lobbyMsg("Multiplayer couldn’t load. Check your connection and refresh."); return; }
    if (asHost) hostRoom(); else { $("join-code").value = code || ""; (code ? $("player-name") : $("join-code")).focus(); }
}
$("host-btn").addEventListener("click", () => openLobby(true));
$("join-open-btn").addEventListener("click", () => openLobby(false));

function myName() {
    const n = ($("player-name").value || "").trim().slice(0, 20) || "Player";
    store.set("name", n); return n;
}

function hostRoom(attempt = 0) {
    MP.isHost = true; MP.code = newCode(); MP.myId = "host";
    lobbyMsg("Opening a room…");
    const peer = new Peer(PEER_PREFIX + MP.code);
    MP.peer = peer;
    peer.on("open", () => {
        $("room-code").textContent = MP.code;
        MP.players.set("host", { id: "host", name: myName(), total: 0 });
        $("lobby-players").hidden = false; $("host-controls").hidden = false;
        lobbyMsg("Share the code. Friends can join from this page.");
        renderPlayers();
    });
    peer.on("connection", conn => {
        conn.on("data", msg => hostOnData(conn, msg));
        conn.on("close", () => hostDrop(conn.peer));
        conn.on("error", () => hostDrop(conn.peer));
    });
    peer.on("error", err => {
        if (err.type === "unavailable-id" && attempt < 3) { peer.destroy(); hostRoom(attempt + 1); return; }
        lobbyMsg("Couldn’t open a room (" + err.type + "). Try again in a moment.");
    });
}
$("player-name").addEventListener("change", () => {
    if (MP.isHost && MP.players.has("host")) { MP.players.get("host").name = myName(); renderPlayers(); broadcastLobby(); }
});
$("copy-room").addEventListener("click", async () => {
    const u = new URL(baseUrl()); u.searchParams.set("room", MP.code);
    try { await navigator.clipboard.writeText(u.toString()); lobbyMsg("Invite link copied."); } catch { window.prompt("Copy this link:", u.toString()); }
});

function hostOnData(conn, msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.t === "join") {
        if (MP.started) { conn.send({ t: "denied", why: "That game has already started." }); setTimeout(() => conn.close(), 300); return; }
        if (MP.players.size >= 12) { conn.send({ t: "denied", why: "That room is full." }); setTimeout(() => conn.close(), 300); return; }
        MP.conns.set(conn.peer, conn);
        MP.players.set(conn.peer, { id: conn.peer, name: String(msg.name || "Player").slice(0, 20), total: 0 });
        conn.send({ t: "welcome", id: conn.peer, code: MP.code });
        renderPlayers(); broadcastLobby();
    } else if (msg.t === "guess" && MP.players.has(conn.peer)) {
        hostRecordGuess(conn.peer, msg);
    }
}
function hostDrop(id) {
    if (!MP.players.has(id)) return;
    MP.players.delete(id); MP.conns.delete(id);
    renderPlayers(); broadcastLobby();
    if (MP.started) hostCheckRound();
}
function broadcast(msg) { MP.conns.forEach(c => { try { c.send(msg); } catch { /* peer gone */ } }); }
function playerList() { return [...MP.players.values()].map(p => ({ id: p.id, name: p.name })); }
function broadcastLobby() { broadcast({ t: "lobby", players: playerList() }); }

function renderPlayers(list) {
    list = list || playerList();
    const ul = $("player-list"); ul.innerHTML = "";
    list.forEach(p => {
        const li = document.createElement("li");
        const n = document.createElement("span"); n.textContent = p.name;
        li.appendChild(n);
        const tag = document.createElement("span"); tag.className = "tag";
        tag.textContent = (p.id === "host" ? "Host" : "") + (p.id === MP.myId ? (p.id === "host" ? " · You" : "You") : "");
        li.appendChild(tag); ul.appendChild(li);
    });
    if (MP.isHost) $("start-mp").textContent = list.length > 1 ? `Start game (${list.length} players)` : "Start game (just you so far)";
}

$("start-mp").addEventListener("click", () => {
    MP.players.get("host").name = myName();
    MP.started = true; MP.timer = $("timer-on").checked;
    MP.players.forEach(p => { p.total = 0; });
    const ids = shuffle(PHOTOS).slice(0, ROUNDS).map(p => p.id);
    broadcast({ t: "start", ids, timer: MP.timer, players: playerList() });
    beginMp(ids);
});
function beginMp(ids) {
    MP.roundGuesses = new Map();
    startGame("mp", ids.map(id => BY_ID[id]).filter(Boolean));
}

function mpSendGuess(g) {
    const payload = { t: "guess", round: S.round, lat: g.lat, lon: g.lon, year: g.year, pts: g.pts };
    if (MP.isHost) hostRecordGuess("host", payload); else MP.conn && MP.conn.send(payload);
}
function hostRecordGuess(id, msg) {
    if (msg.round !== S.round || MP.roundGuesses.has(id)) return;
    const p = S.photos[S.round];
    // Recompute points on the host so everyone is scored the same way.
    const lat = typeof msg.lat === "number" ? msg.lat : null, lon = typeof msg.lon === "number" ? msg.lon : null;
    const year = Math.min(MAX_YEAR, Math.max(MIN_YEAR, Math.round(+msg.year || START_YEAR)));
    const dist = lat == null ? null : distanceM(lat, lon, p.lat, p.lon);
    const pts = locationScore(dist) + yearScore(year - p.year);
    MP.roundGuesses.set(id, { id, lat, lon, year, pts });
    hostCheckRound();
}
function hostCheckRound() {
    const need = [...MP.players.keys()];
    const done = need.filter(id => MP.roundGuesses.has(id)).length;
    broadcast({ t: "progress", done, of: need.length });
    showProgress(done, need.length);
    if (done < need.length || MP.lastReveal === S.round) return;
    MP.lastReveal = S.round;
    const guesses = [...MP.roundGuesses.values()].filter(g => MP.players.has(g.id)).map(g => ({ ...g, name: MP.players.get(g.id).name }));
    guesses.forEach(g => { MP.players.get(g.id).total += g.pts; });
    const standings = [...MP.players.values()]
        .map(p => ({ id: p.id, name: p.name, total: p.total, roundPts: (MP.roundGuesses.get(p.id) || {}).pts }))
        .sort((a, b) => b.total - a.total);
    const reveal = { t: "reveal", round: S.round, guesses, standings };
    broadcast(reveal);
    applyReveal(reveal);
}
function showProgress(done, of) {
    if (S.submitted && !$("screen-game").hidden) $("guess-btn").textContent = `Waiting for other players (${done}/${of})…`;
}
function applyReveal(r) {
    stopTimer();
    if (!S.guesses[S.round]) S.guesses[S.round] = { lat: null, lon: null, year: START_YEAR, dist: null, loc: 0, yr: 0, pts: 0 };
    MP.lastStandings = r.standings;
    showResult(r);
}
function mpHostNext() {
    const next = S.round + 1;
    MP.roundGuesses = new Map();
    if (next >= ROUNDS) {
        const standings = MP.lastStandings;
        broadcast({ t: "end", standings });
        S.round = next; finishGame(standings);
    } else {
        broadcast({ t: "next", round: next });
        advance();
    }
}

$("join-btn").addEventListener("click", joinRoom);
$("join-code").addEventListener("keydown", e => { if (e.key === "Enter") $("player-name").focus(); });
$("player-name").addEventListener("keydown", e => { if (e.key === "Enter" && !$("join-btn").hidden) joinRoom(); });
function joinRoom() {
    const code = ($("join-code").value || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
    if (code.length !== 5) { lobbyMsg("Room codes are five letters."); $("join-code").focus(); return; }
    const name = myName();
    mpTeardown();
    MP.isHost = false; MP.code = code;
    $("join-btn").disabled = true; lobbyMsg("Connecting…");
    const peer = new Peer(); MP.peer = peer;
    peer.on("open", () => {
        const conn = peer.connect(PEER_PREFIX + code, { reliable: true });
        MP.conn = conn;
        conn.on("open", () => conn.send({ t: "join", name }));
        conn.on("data", clientOnData);
        conn.on("close", () => { if (MP.conn === conn) { alert("The host closed the room."); goHome(); } });
    });
    peer.on("error", err => {
        $("join-btn").disabled = false;
        lobbyMsg(err.type === "peer-unavailable" ? "No room with that code. Check it and try again." : "Couldn’t connect (" + err.type + ").");
    });
}
function clientOnData(msg) {
    if (!msg || typeof msg !== "object") return;
    switch (msg.t) {
        case "welcome":
            MP.myId = msg.id;
            $("lobby-join").hidden = true; $("lobby-room").hidden = false; $("copy-room").hidden = true;
            $("room-code").textContent = MP.code; $("join-btn").hidden = true; $("player-name").disabled = true;
            $("lobby-players").hidden = false; $("lobby-wait").hidden = false; lobbyMsg("");
            break;
        case "denied": lobbyMsg(msg.why); $("join-btn").disabled = false; MP.conn = null; break;
        case "lobby": renderPlayers(msg.players); break;
        case "start": MP.timer = !!msg.timer; MP.started = true; beginMp(msg.ids); break;
        case "progress": showProgress(msg.done, msg.of); break;
        case "reveal": if (msg.round === S.round) applyReveal(msg); break;
        case "next": if (msg.round === S.round + 1) advance(); break;
        case "end": S.round = ROUNDS; finishGame(msg.standings); break;
    }
}
function mpTeardown() {
    const peer = MP.peer;
    MP.conn = null;
    if (peer) { try { peer.destroy(); } catch { /* already closed */ } }
    Object.assign(MP, { peer: null, isHost: false, code: null, conns: new Map(), players: new Map(), myId: null, started: false, roundGuesses: new Map(), lastReveal: null, lastStandings: null });
    $("copy-room").hidden = false;
}
window.addEventListener("beforeunload", () => { if (MP.peer) MP.peer.destroy(); });

// ---------- Boot ----------
(function boot() {
    renderHome();
    const q = new URLSearchParams(location.search);
    if (q.get("room")) { openLobby(false, q.get("room").toUpperCase()); return; }
    const c = q.get("c");
    if (c) {
        const ids = c.split(".").filter(id => BY_ID[id]).slice(0, ROUNDS);
        if (ids.length === ROUNDS) {
            const score = Math.max(0, Math.min(50000, parseInt(q.get("s"), 10) || 0));
            const name = (q.get("n") || "").slice(0, 20);
            S.challenge = { ids, score, name };
            const b = $("challenge-banner"); b.hidden = false; b.textContent = "";
            b.append(`${name || "A friend"} scored ${fmt(score)} and challenged you to the same five photos. `);
            const btn = document.createElement("button"); btn.className = "btn btn-primary"; btn.type = "button"; btn.textContent = "Accept challenge";
            btn.addEventListener("click", () => startGame("challenge", ids.map(id => BY_ID[id])));
            b.appendChild(btn);
        }
    }
    show("home");
})();
})();
