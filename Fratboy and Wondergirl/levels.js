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

function mirrorLayout(L) {
    return Object.assign({}, L, {
        map: L.map.map((row) => row.split("").reverse().join("")),
        platforms: (L.platforms || []).map((p) => Object.assign({}, p, { x: 30 - p.x - p.w, dx: -p.dx })),
        buttons: (L.buttons || []).map((b) => Object.assign({}, b, { x: 29 - b.x })),
        levers: (L.levers || []).map((l) => Object.assign({}, l, { x: 29 - l.x }))
    });
}

window.LEVELS = HOUSES.map((house, i) => {
    const pass = Math.floor(i / LAYOUTS.length);
    let L = LAYOUTS[i % LAYOUTS.length];
    if (pass % 2 === 1) L = mirrorLayout(L);
    const swap = SWAPS[Math.floor(pass / 2) % SWAPS.length];
    return Object.assign({}, L, {
        name: house.name,
        letters: house.letters,
        theme: THEMES[i % THEMES.length],
        facade: WALLS[i % WALLS.length],
        tip: pass === 0 ? L.tip : L.tip + " (Same trick, new house.)",
        map: L.map.map((row) => row.replace(/[RBG]/g, (c) => swap[c]))
    });
});
