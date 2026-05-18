const dataSource = {
  rankingDate: "11 mai 2026",
  updatedAt: "17 mai 2026, 19:00",
  note:
    "Pontos = ∑ 6 melhores resultados de simples + ∑ 25% dos 6 melhores resultados de duplas"
};

const eventPool = {
  Boys: ["J500 Milan", "J300 Santa Cruz", "J300 Offenbach", "J200 Prato", "J200 Cap d'Ail"],
  Girls: ["J500 Milan", "J300 Santa Cruz", "J300 Beaulieu-sur-Mer", "J200 Prato", "J200 Salsomaggiore"]
};

const boySeeds = [
  ["ivan-ivanov", "Ivan Ivanov", "BUL", 1, 2960, 500, 300, "QF", "SF"],
  ["luis-guto-miguel", "Luis Guto Miguel", "BRA", 2, 2860, 180, 300, "Final", "QF"],
  ["yannick-theodor-alexandrescou", "Yannick Theodor Alexandrescou", "FRA", 3, 2790, 300, 140, "SF", "Nao joga"],
  ["ziga-sesko", "Ziga Sesko", "SLO", 4, 2710, 120, 210, "Final", "Final"],
  ["jack-kennedy", "Jack Kennedy", "USA", 5, 2650, 250, 125, "QF", "SF"],
  ["jamie-mackenzie", "Jamie Mackenzie", "GER", 6, 2510, 75, 300, "Campeao", "QF"],
  ["keaton-hance", "Keaton Hance", "USA", 7, 2470, 210, 140, "SF", "QF"],
  ["zangar-nurlanuly", "Zangar Nurlanuly", "KAZ", 8, 2420, 60, 210, "Final", "SF"],
  ["thilo-behrmann", "Thilo Behrmann", "AUT", 9, 2380, 140, 75, "QF", "QF"],
  ["ryo-tabata", "Ryo Tabata", "JPN", 10, 2320, 100, 200, "Campeao", "Nao joga"]
];

const girlSeeds = [
  ["ksenia-efremova", "Ksenia Efremova", "FRA", 1, 3050, 350, 500, "Campeao", "Nao joga"],
  ["hannah-klugman", "Hannah Klugman", "GBR", 2, 2920, 250, 210, "Final", "SF"],
  ["mia-pohankova", "Mia Pohankova", "SVK", 3, 2820, 180, 300, "Campeao", "QF"],
  ["alena-kovackova", "Alena Kovackova", "CZE", 4, 2740, 300, 125, "QF", "SF"],
  ["victoria-luiza-barros", "Victoria Luiza Barros", "BRA", 5, 2680, 75, 300, "Final", "Final"],
  ["julieta-pareja", "Julieta Pareja", "USA", 6, 2590, 210, 140, "SF", "QF"],
  ["jana-kovackova", "Jana Kovackova", "CZE", 7, 2520, 140, 250, "SF", "Final"],
  ["xinran-sun", "Xinran Sun", "CHN", 8, 2470, 120, 75, "QF", "Nao joga"],
  ["kristina-penickova", "Kristina Penickova", "USA", 9, 2410, 250, 350, "Final", "SF"],
  ["anastasija-cvetkovic", "Anastasija Cvetkovic", "SRB", 10, 2350, 60, 210, "Final", "QF"]
];

function distributePoints(total) {
  const weights = [0.28, 0.22, 0.17, 0.13, 0.11];
  const points = weights.map((weight) => Math.round(total * weight));
  points.push(total - points.reduce((sum, point) => sum + point, 0));
  return points.sort((a, b) => b - a);
}

function buildResults(total, label, gender, offset) {
  const mainResults = distributePoints(total).map((points, index) => ({
    event: `${eventPool[gender][(index + offset) % eventPool[gender].length]} 2026`,
    round: ["Campeao", "Final", "SF", "QF", "R16", "R32"][index],
    points,
    date: `2026-0${Math.min(5, index + 1)}-${String(8 + index * 3).padStart(2, "0")}`
  }));
  const extraResults = [0.025, 0.015].map((weight, extraIndex) => ({
    event: `${eventPool[gender][(extraIndex + offset + 3) % eventPool[gender].length]} 2026`,
    round: extraIndex === 0 ? "R32" : "R64",
    points: Math.max(1, Math.round(total * weight)),
    date: `2026-05-${String(2 + extraIndex * 4).padStart(2, "0")}`
  }));
  return [...mainResults, ...extraResults];
}

function makePlayer(seed, gender, index) {
  const [
    id,
    name,
    country,
    currentRank,
    basePoints,
    defendingPoints,
    liveSinglesPoints,
    singlesRound,
    doublesRound
  ] = seed;
  const singlesTotal = Math.round(basePoints * 0.72);
  const doublesTotal = basePoints - singlesTotal;
  const doublesPoints = doublesRound === "Nao joga" ? 0 : Math.max(40, Math.round(liveSinglesPoints * 0.55));
  const liveEventName = eventPool[gender][index % eventPool[gender].length];
  const singlesStatus = index % 5 === 2 ? "Eliminado" : "Ativo";
  const doublesStatus = doublesRound === "Nao joga" ? "Nao joga" : index % 4 === 1 ? "Eliminado" : "Ativo";
  const isIdle = index === 9;

  return {
    id,
    name,
    country,
    gender,
    currentRank,
    singles: buildResults(singlesTotal, "singles", gender, index),
    doubles: buildResults(doublesTotal, "doubles", gender, index + 2),
    defending:
      defendingPoints > 0
        ? [
            {
              type: "singles",
              event: `${liveEventName} 2025`,
              points: Math.round(defendingPoints * 0.7),
              date: "2025-05-19"
            },
            {
              type: "doubles",
              event: `${liveEventName} 2025`,
              points: defendingPoints - Math.round(defendingPoints * 0.7),
              date: "2025-05-19"
            }
          ]
        : [],
    liveEvent: {
      event: isIdle ? "" : liveEventName,
      grade: isIdle ? "" : liveEventName.split(" ")[0],
      singlesStatus: isIdle ? "Nao joga" : singlesStatus,
      singlesRound: isIdle ? "Nao joga" : singlesRound,
      singlesPoints: isIdle ? 0 : liveSinglesPoints,
      doublesStatus: isIdle ? "Nao joga" : doublesStatus,
      doublesRound: isIdle ? "Nao joga" : doublesRound,
      doublesPoints: isIdle ? 0 : doublesPoints
    }
  };
}

const samplePlayers = [
  ...boySeeds.map((seed, index) => makePlayer(seed, "Boys", index)),
  ...girlSeeds.map((seed, index) => makePlayer(seed, "Girls", index))
];
