/*
 * Fratboy and Wondergirl: level data.
 *
 * There are four hand-built layouts. Each house on Greek Row gets one, cycling
 * through them; later passes are mirrored and shuffle which water is which.
 *
 * Each map is 30 columns x 20 rows of 32px tiles.
 *   #  brick          .  empty
 *   R  red water      B  blue water      G  green water   (red is safe for Fratboy, blue for Wondergirl, green kills both)
 *   f  Fratboy start  w  Wondergirl start
 *   F  Fratboy door   W  Wondergirl door   (the letter marks the door's bottom tile)
 *   r  red diamond (Fratboy's beer)   b  blue diamond (Wondergirl's shooter)
 *   K  keg (pushable)
 *
 * Mechanisms use tile coordinates:
 *   platforms: { id, x, y, w, h, dx, dy, color }  moves by (dx, dy) tiles while switched on
 *   buttons:   { x, y, target }  on while anyone (or a keg) stands on it; y is the row it sits in
 *   levers:    { x, y, target }  toggled with Down / S
 */
const LAYOUTS = [
    {
        tip: "Jump the pools and climb to the top floor. Fratboy grabs red diamonds, Wondergirl grabs blue ones.",
        map: [
            "##############################",
            "#............................#",
            "#............................#",
            "#............................#",
            "#............................#",
            "#..F..W........rb............#",
            "###############GG########....#",
            "#............................#",
            "#.........r........b.......###",
            "#..........................###",
            "#....#####RR#######BB#########",
            "#............................#",
            "###...........rb.............#",
            "###..........................#",
            "##############GG#########....#",
            "#........r.......b...........#",
            "#..........................###",
            "#.f.w......................###",
            "#########RR######BB###########",
            "##############################"
        ]
    },
    {
        tip: "Somebody has to stand on the button so the other can ride the elevator. The lever up top brings it back.",
        map: [
            "##############################",
            "#............................#",
            "#............................#",
            "#............................#",
            "#............................#",
            "#..F.W......rb...............#",
            "############GG###########....#",
            "#............................#",
            "#............................#",
            "#............................#",
            "#.............r.b............#",
            "#............................#",
            "#.....########GGG########....#",
            "#............................#",
            "#............................#",
            "#.......r......b.............#",
            "#............................#",
            "#.f.w........................#",
            "########RR####BB##############",
            "##############################"
        ],
        platforms: [{ id: "lift", x: 25, y: 17.5, w: 4, h: 0.5, dx: 0, dy: -11.5, color: "#f2b33d" }],
        buttons: [{ x: 20, y: 17, target: "lift" }],
        levers: [{ x: 20, y: 5, target: "lift" }]
    },
    {
        tip: "Push the keg against the wall to climb it. Take turns holding the buttons to get past the gate.",
        map: [
            "##############################",
            "#............................#",
            "#............................#",
            "#............................#",
            "#............................#",
            "#.............b....r.........#",
            "#........................F.W.#",
            "#....#########GG###RR#########",
            "#............................#",
            "###......b.....r.............#",
            "###..........................#",
            "########BB####RR########.....#",
            "#............................#",
            "#.......................br.###",
            "#..........................###",
            "#....rb......#################",
            "#............#################",
            "#.fw.....K...#################",
            "#####GG#######################",
            "##############################"
        ],
        platforms: [{ id: "gate", x: 19, y: 12, w: 1, h: 3, dx: 0, dy: 3, color: "#b46bff" }],
        buttons: [
            { x: 16, y: 14, target: "gate" },
            { x: 22, y: 14, target: "gate" }
        ]
    },
    {
        tip: "You start on opposite sides. Each of you controls the other's elevator, so talk it out.",
        map: [
            "##############################",
            "#............................#",
            "#............................#",
            "#............................#",
            "#............................#",
            "#....r.................b.....#",
            "#.F........................W.#",
            "#####GG###....##....##RR######",
            "#.............##.............#",
            "#.............##.............#",
            "#.............##.............#",
            "#.............##.............#",
            "#.............##.............#",
            "#.............##.............#",
            "#.............##.............#",
            "#####....r....##.....b...b...#",
            "#####.........##.............#",
            "#####...K..f..##.w...........#",
            "####################RR##GG####",
            "##############################"
        ],
        platforms: [
            { id: "liftF", x: 10, y: 17.5, w: 4, h: 0.5, dx: 0, dy: -10.5, color: "#ff7a3d" },
            { id: "liftW", x: 16, y: 17.5, w: 4, h: 0.5, dx: 0, dy: -10.5, color: "#3dd6ff" }
        ],
        levers: [
            { x: 2, y: 14, target: "liftW" },
            { x: 24, y: 6, target: "liftF" }
        ]
    }
];

// UNL houses, in play order. `letters` is what goes on the wall.
const HOUSES = [
    { name: "Acacia", letters: "ACACIA" },
    { name: "Alpha Gamma Rho", letters: "ΑΓΡ" },
    { name: "Alpha Gamma Sigma", letters: "ΑΓΣ" },
    { name: "Alpha Tau Omega", letters: "ΑΤΩ" },
    { name: "Beta Sigma Psi", letters: "ΒΣΨ" },
    { name: "Beta Theta Pi", letters: "ΒΘΠ" },
    { name: "Chi Phi", letters: "ΧΦ" },
    { name: "Delta Upsilon", letters: "ΔΥ" },
    { name: "FarmHouse", letters: "FarmHouse" },
    { name: "Kappa Sigma", letters: "ΚΣ" },
    { name: "Lambda Chi Alpha", letters: "ΛΧΑ" },
    { name: "Phi Delta Theta", letters: "ΦΔΘ" },
    { name: "Phi Gamma Delta", letters: "ΦΓΔ" },
    { name: "Phi Kappa Psi", letters: "ΦΚΨ" },
    { name: "Phi Kappa Theta", letters: "ΦΚΘ" },
    { name: "Pi Kappa Alpha", letters: "ΠΚΑ" },
    { name: "Sigma Alpha Epsilon", letters: "ΣΑΕ" },
    { name: "Sigma Alpha Mu", letters: "ΣΑΜ" },
    { name: "Sigma Chi", letters: "ΣΧ" },
    { name: "Sigma Phi Epsilon", letters: "ΣΦΕ" },
    { name: "Theta Chi", letters: "ΘΧ" },
    { name: "Theta Xi", letters: "ΘΞ" },
    { name: "Triangle", letters: "TRIANGLE" }
];

// Party themes rotate by level; they aren't tied to any particular chapter.
const THEMES = [
    "Rush Week", "Darty", "Neon Night", "Tropical Tuesday", "Halloween Weekend", "Country Night",
    "Throwback Thursday", "Homecoming", "White Out", "Beach Bash", "Finals Are Next Week", "Formal Afterparty"
];

const WALLS = ["#3a2a4a", "#1f3a4a", "#3a3020", "#2a3a2a", "#4a2a2a", "#22304a", "#3a2a3a", "#2a3a3a"];

// Which water each original color becomes on later passes.
const SWAPS = [
    { R: "R", B: "B", G: "G" },
    { R: "B", B: "G", G: "R" },
    { R: "G", B: "R", G: "B" }
];

// Extra one-tile green puddles that later houses add, per layout, in the order
// they appear. Each is [column, row] of a floor tile in the unmirrored map.
// Every spot keeps a safe gap from other pools, doors, buttons, levers, keg
// paths, elevators and the landing spots after climbs.
const EXTRA_PITS = [
    [[22, 18], [19, 14], [15, 10], [10, 6], [13, 18], [8, 14], [24, 10], [20, 6]],
    [[17, 6], [18, 18], [8, 6], [22, 18], [22, 6]],
    [[25, 15], [19, 11], [10, 7], [21, 15], [23, 7], [5, 11]],
    [[26, 7]]
];

// Where the Designated Driver starts pacing in each layout: [column, floor row].
// He walks back and forth until he reaches water, a wall or a ledge.
const DD_START = [[20, 6], [11, 18], [11, 11], [3, 7]];

/*
 * The storyline. Every four houses a group chat pops up and adds a twist:
 *   blackout  only the area around each player is visible
 *   dd        the Designated Driver paces a floor; touching him sends you back to the start
 *   sticky    jungle juice next to the water slows you down and weakens your jump
 *   timer     seconds to get out before the Nationals walkthrough
 */
const CHAPTERS = [
    {
        from: 0, time: "Friday, 9:47 PM", twists: {}, hint: "",
        chat: [
            ["Fratboy", "u tryna go out tonight? \u{1F440}"],
            ["Wondergirl", "only if it\u2019s actually fun"],
            ["Fratboy", "fun. lighthearted. greek row. trust"],
            ["Wondergirl", "fine. but we leave every party the second it gets weird"]
        ]
    },
    {
        from: 4, time: "10:58 PM", twists: { blackout: true },
        hint: "Blackout: you can only see what\u2019s right around you.",
        chat: [
            ["Chapter Prez", "who plugged 6 fog machines into one outlet"],
            ["Chapter Prez", "breaker\u2019s gone. no lights anywhere"],
            ["Fratboy", "we\u2019re literally inside rn"],
            ["Wondergirl", "find the exits \u{1F62D}"]
        ]
    },
    {
        from: 8, time: "12:15 AM", twists: { dd: true },
        hint: "Designated Driver: touch the DD and you\u2019re sent back to the start. Jump over him.",
        chat: [
            ["Pledge Educator", "heads up the DD is doing rounds"],
            ["Pledge Educator", "if he catches u he\u2019s driving u home. no exceptions"],
            ["Fratboy", "the night is YOUNG"],
            ["Wondergirl", "just jump over him lol"]
        ]
    },
    {
        from: 12, time: "1:02 AM", twists: { sticky: true },
        hint: "Jungle juice: the purple puddles slow you down and weaken your jump.",
        chat: [
            ["Roommate", "girl the floors over there are SO sticky \u{1F480}"],
            ["Roommate", "someone knocked over the whole jungle juice"],
            ["Wondergirl", "my shoes are never recovering"]
        ]
    },
    {
        from: 16, time: "1:40 AM", twists: { timer: 150 },
        hint: "Risk management sweep: get out before the clock runs out.",
        chat: [
            ["Chapter Prez", "NATIONALS IS DOING A WALKTHROUGH"],
            ["Chapter Prez", "EVERYONE OUT BEFORE THEY GET HERE"],
            ["Fratboy", "how long do we have"],
            ["Chapter Prez", "like 2 min??"]
        ]
    },
    {
        from: 20, time: "2:30 AM", twists: { blackout: true, dd: true, timer: 180 },
        hint: "Last call: blackout, the DD and the clock, all at once.",
        chat: [
            ["Fratboy", "last call. one more house?"],
            ["Wondergirl", "...fine \u{1F644}"],
            ["Pledge Educator", "lights are still out, DD\u2019s still out, nationals still here"],
            ["Fratboy", "so everything"]
        ]
    }
];

const FINALE = {
    time: "3:12 AM",
    chat: [
        ["Wondergirl", "ok that was actually fun"],
        ["Fratboy", "so\u2026 same time next week?"],
        ["Wondergirl", "don\u2019t push it"],
        ["Wondergirl", "(yes)"]
    ]
};

window.STORY = { chapters: CHAPTERS, finale: FINALE };

function mirrorLayout(L) {
    return Object.assign({}, L, {
        map: L.map.map((row) => row.split("").reverse().join("")),
        platforms: (L.platforms || []).map((p) => Object.assign({}, p, { x: 30 - p.x - p.w, dx: -p.dx })),
        buttons: (L.buttons || []).map((b) => Object.assign({}, b, { x: 29 - b.x })),
        levers: (L.levers || []).map((l) => Object.assign({}, l, { x: 29 - l.x })),
        dd: L.dd && [29 - L.dd[0], L.dd[1]]
    });
}

/*
 * Difficulty ramps up gently across Greek Row:
 *   - Within each pass of four houses, the layouts already get trickier.
 *   - Each later pass adds one more green puddle (deadly to both players).
 *   - From the third pass on, one (later two) existing pools turn green, so
 *     some of Fratboy's red and Wondergirl's blue shortcuts go away.
 *   - Elevators and gates move a little slower later on, so timing matters more.
 */
function hardenMap(rows, layoutIndex, pass) {
    const grid = rows.map((r) => r.split(""));
    const pits = EXTRA_PITS[layoutIndex].slice(0, pass);
    for (const [c, r] of pits) {
        if (grid[r][c] === "#" && grid[r - 1][c] === ".") grid[r][c] = "G";
    }
    // Turn whole pools green, picking every other pool so it spreads out.
    let toGreen = Math.min(2, Math.floor(pass / 2));
    const pools = [];
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            if ("RB".includes(grid[r][c]) && !"RB".includes(grid[r][c - 1])) pools.push([r, c]);
        }
    }
    const order = pools.filter((_, k) => k % 2 === 0).concat(pools.filter((_, k) => k % 2 === 1));
    for (const [r, c0] of order) {
        if (toGreen-- <= 0) break;
        for (let c = c0; "RB".includes(grid[r][c]); c++) grid[r][c] = "G";
    }
    return grid.map((r) => r.join(""));
}

window.LEVELS = HOUSES.map((house, i) => {
    const layoutIndex = i % LAYOUTS.length;
    const pass = Math.floor(i / LAYOUTS.length);
    let L = LAYOUTS[layoutIndex];
    const swap = SWAPS[Math.floor(pass / 2) % SWAPS.length];
    L = Object.assign({}, L, {
        map: hardenMap(L.map.map((row) => row.replace(/[RBG]/g, (c) => swap[c])), layoutIndex, pass),
        platformSpeed: Math.max(1.4, 2 - pass * 0.12),
        dd: DD_START[layoutIndex]
    });
    if (pass % 2 === 1) L = mirrorLayout(L);
    return Object.assign({}, L, {
        name: house.name,
        letters: house.letters,
        theme: THEMES[i % THEMES.length],
        facade: WALLS[i % WALLS.length],
        difficulty: Math.min(5, 1 + Math.floor(i / 5)),
        tip: pass === 0 ? L.tip : L.tip + " Watch out for new green puddles.",
        chapter: CHAPTERS.reduce((k, ch, idx) => (i >= ch.from ? idx : k), 0),
        twists: CHAPTERS.reduce((t, ch) => (i >= ch.from ? ch.twists : t), {})
    });
});
