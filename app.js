const state = {
  players: typeof samplePlayers !== "undefined" ? structuredClone(samplePlayers) : [],
  selectedId: null,
  language: localStorage.getItem("itf-juniors-language") || "pt",
  theme: localStorage.getItem("itf-juniors-theme") || "light",
  dataSource: typeof dataSource !== "undefined" ? dataSource : {},
  weeklyTournaments: []
};

const LIVE_RANKING_TABLE_LIMIT = 1000;

const els = {
  rankingTable: document.querySelector("table"),
  rankingBody: document.querySelector("#rankingBody"),
  rankingHead: document.querySelector("thead"),
  searchInput: document.querySelector("#searchInput"),
  genderFilter: document.querySelector("#genderFilter"),
  sortFilter: document.querySelector("#sortFilter"),
  playerDetails: document.querySelector("#playerDetails"),
  weekLabel: document.querySelector("#weekLabel"),
  updatedAtLabel: document.querySelector("#updatedAtLabel"),
  updatedCardLabel: document.querySelector("#updatedCardLabel"),
  dataSourceNote: document.querySelector("#dataSourceNote"),
  themeSelect: document.querySelector("#themeSelect"),
  themeLabel: document.querySelector("#themeLabel"),
  languageSelect: document.querySelector("#languageSelect"),
  languageLabel: document.querySelector("#languageLabel"),
  siteCredit: document.querySelector("#siteCredit"),
  rankingBaseLabel: document.querySelector("#rankingBaseLabel"),
  searchLabel: document.querySelector("#searchLabel"),
  categoryLabel: document.querySelector("#categoryLabel"),
  sortLabel: document.querySelector("#sortLabel"),
  liveRankingTitle: document.querySelector("#liveRankingTitle"),
  playerPanelTitle: document.querySelector("#playerPanelTitle"),
  weeklyTournamentsTitle: document.querySelector("#weeklyTournamentsTitle"),
  weeklyTournamentsList: document.querySelector("#weeklyTournamentsList"),
  highlightRiseLabel: document.querySelector("#highlightRiseLabel"),
  highlightRiseValue: document.querySelector("#highlightRiseValue"),
  highlightRiseMeta: document.querySelector("#highlightRiseMeta"),
  highlightDropLabel: document.querySelector("#highlightDropLabel"),
  highlightDropValue: document.querySelector("#highlightDropValue"),
  highlightDropMeta: document.querySelector("#highlightDropMeta"),
  highlightBrazilLabel: document.querySelector("#highlightBrazilLabel"),
  highlightBrazilValue: document.querySelector("#highlightBrazilValue"),
  highlightBrazilMeta: document.querySelector("#highlightBrazilMeta"),
  highlightEntryLabel: document.querySelector("#highlightEntryLabel"),
  highlightEntryValue: document.querySelector("#highlightEntryValue"),
  highlightEntryMeta: document.querySelector("#highlightEntryMeta")
};

const translations = {
  pt: {
    htmlLang: "pt-BR",
    updated: "Última atualização",
    theme: "Tema",
    lightMode: "Claro",
    darkMode: "Escuro",
    siteCredit: "Criado por Info Tênis Brasil",
    language: "Idioma",
    rankingBase: "Semana base",
    search: "Buscar atleta",
    searchPlaceholder: "Nome, país ou torneio",
    category: "Categoria",
    boys: "Masculino",
    girls: "Feminino",
    sortBy: "Ordenar por",
    liveRank: "Ranking ao vivo",
    officialRank: "Ranking oficial",
    birthYear: "Ano",
    liveRanking: "Live ranking",
    formula: "Pontos = ∑ 6 melhores resultados de simples + ∑ 25% dos 6 melhores resultados de duplas",
    officialPoints: "Pontos base",
    athlete: "Atleta",
    livePoints: "Pontos ao vivo",
    scenarios: "Projeção",
    playingThisWeek: "Jogando esta semana",
    nextRound: "Próx. rodada",
    playerPoints: "Pontuações do atleta",
    emptyDetails: "Selecione um atleta para ver todos seus resultados",
    nextWin: "Próx. vitória",
    champion: "Título",
    singles: "Simples",
    doubles: "Duplas",
    notPlaying: "não joga",
    eliminated: "eliminado",
    currentTournament: "Torneio atual",
    counting: "contando",
    notCounting: "não contando",
    gross: "bruto",
    official: "oficial",
    maximum: "máximo",
    pointsDefended: "Pontos defendidos nesta semana",
    pointsEntering: "Pontos entrando no torneio atual",
    showDetails: "+ info",
    hideDetails: "- info"
  },
  en: {
    htmlLang: "en",
    updated: "Last update",
    theme: "Theme",
    lightMode: "Light",
    darkMode: "Dark",
    siteCredit: "Created by Info Tênis Brasil",
    language: "Language",
    rankingBase: "Base week",
    search: "Search player",
    searchPlaceholder: "Name, country or tournament",
    category: "Category",
    boys: "Boys",
    girls: "Girls",
    sortBy: "Sort by",
    liveRank: "Live ranking",
    officialRank: "Official ranking",
    birthYear: "Birth year",
    liveRanking: "Live ranking",
    formula: "Points = ∑ best 6 singles results + ∑ 25% of best 6 doubles results",
    officialPoints: "Base points",
    athlete: "Player",
    livePoints: "Live points",
    scenarios: "Projection",
    playingThisWeek: "Playing this week",
    nextRound: "Next round",
    playerPoints: "Player points",
    emptyDetails: "Select a player to see all results",
    nextWin: "Next win",
    champion: "Title",
    singles: "Singles",
    doubles: "Doubles",
    notPlaying: "not playing",
    eliminated: "eliminated",
    currentTournament: "Current tournament",
    counting: "counting",
    notCounting: "not counting",
    gross: "raw",
    official: "official",
    maximum: "maximum",
    pointsDefended: "Points defended this week",
    pointsEntering: "Points entering from current tournament",
    showDetails: "+ info",
    hideDetails: "- info"
  },
  es: {
    htmlLang: "es",
    updated: "Última actualización",
    theme: "Tema",
    lightMode: "Claro",
    darkMode: "Oscuro",
    siteCredit: "Creado por Info Tênis Brasil",
    language: "Idioma",
    rankingBase: "Semana base",
    search: "Buscar jugador",
    searchPlaceholder: "Nombre, país o torneo",
    category: "Categoría",
    boys: "Masculino",
    girls: "Femenino",
    sortBy: "Ordenar por",
    liveRank: "Ranking en vivo",
    officialRank: "Ranking oficial",
    birthYear: "Año",
    liveRanking: "Ranking en vivo",
    formula: "Puntos = ∑ 6 mejores resultados de individuales + ∑ 25% de los 6 mejores resultados de dobles",
    officialPoints: "Puntos base",
    athlete: "Jugador",
    livePoints: "Puntos en vivo",
    scenarios: "Proyección",
    playingThisWeek: "Jugando esta semana",
    nextRound: "Próx. ronda",
    playerPoints: "Puntos del jugador",
    emptyDetails: "Seleccione un jugador para ver todos sus resultados",
    nextWin: "Próx. victoria",
    champion: "Título",
    singles: "Individuales",
    doubles: "Dobles",
    notPlaying: "no juega",
    eliminated: "eliminado",
    currentTournament: "Torneo actual",
    counting: "contando",
    notCounting: "no contando",
    gross: "bruto",
    official: "oficial",
    maximum: "máximo",
    pointsDefended: "Puntos defendidos esta semana",
    pointsEntering: "Puntos que entran del torneo actual",
    showDetails: "+ info",
    hideDetails: "- info"
  },
  it: {
    htmlLang: "it",
    updated: "Ultimo aggiornamento",
    theme: "Tema",
    lightMode: "Chiaro",
    darkMode: "Scuro",
    siteCredit: "Creato da Info Tênis Brasil",
    language: "Lingua",
    rankingBase: "Settimana base",
    search: "Cerca giocatore",
    searchPlaceholder: "Nome, paese o torneo",
    category: "Categoria",
    boys: "Maschile",
    girls: "Femminile",
    sortBy: "Ordina per",
    liveRank: "Ranking live",
    officialRank: "Ranking ufficiale",
    birthYear: "Anno",
    liveRanking: "Ranking live",
    formula: "Punti = ∑ 6 migliori risultati di singolare + ∑ 25% dei 6 migliori risultati di doppio",
    officialPoints: "Punti base",
    athlete: "Giocatore",
    livePoints: "Punti live",
    scenarios: "Proiezione",
    playingThisWeek: "In gioco questa settimana",
    nextRound: "Prossimo turno",
    playerPoints: "Punti del giocatore",
    emptyDetails: "Seleziona un giocatore per vedere tutti i suoi risultati",
    nextWin: "Prossima vittoria",
    champion: "Titolo",
    singles: "Singolare",
    doubles: "Doppio",
    notPlaying: "non gioca",
    eliminated: "eliminato",
    currentTournament: "Torneo attuale",
    counting: "valido",
    notCounting: "non valido",
    gross: "lordi",
    official: "ufficiale",
    maximum: "massimo",
    pointsDefended: "Punti difesi questa settimana",
    pointsEntering: "Punti in entrata dal torneo attuale",
    showDetails: "+ info",
    hideDetails: "- info"
  },
  fr: {
    htmlLang: "fr",
    updated: "Dernière mise à jour",
    theme: "Thème",
    lightMode: "Clair",
    darkMode: "Sombre",
    siteCredit: "Créé par Info Tênis Brasil",
    language: "Langue",
    rankingBase: "Semaine de base",
    search: "Rechercher joueur",
    searchPlaceholder: "Nom, pays ou tournoi",
    category: "Catégorie",
    boys: "Garçons",
    girls: "Filles",
    sortBy: "Trier par",
    liveRank: "Classement live",
    officialRank: "Classement officiel",
    birthYear: "Année",
    liveRanking: "Classement live",
    formula: "Points = ∑ 6 meilleurs résultats en simple + ∑ 25% des 6 meilleurs résultats en double",
    officialPoints: "Points de base",
    athlete: "Joueur",
    livePoints: "Points live",
    scenarios: "Projection",
    playingThisWeek: "Joue cette semaine",
    nextRound: "Tour suivant",
    playerPoints: "Points du joueur",
    emptyDetails: "Sélectionnez un joueur pour voir tous ses résultats",
    nextWin: "Proch. victoire",
    champion: "Titre",
    singles: "Simple",
    doubles: "Double",
    notPlaying: "ne joue pas",
    eliminated: "éliminé",
    currentTournament: "Tournoi actuel",
    counting: "comptabilisé",
    notCounting: "non comptabilisé",
    gross: "brut",
    official: "officiel",
    maximum: "maximum",
    pointsDefended: "Points défendus cette semaine",
    pointsEntering: "Points entrant du tournoi actuel",
    showDetails: "+ info",
    hideDetails: "- info"
  }
};

translations.pt.updated = "\u00DAltima atualiza\u00E7\u00E3o";
translations.pt.weeklyTournaments = "Torneios da semana";
translations.pt.noWeeklyTournaments = "Nenhum torneio detectado nesta semana";
translations.pt.biggestRise = "Maior subida";
translations.pt.biggestDrop = "Maior queda";
translations.pt.bestBrazilian = "Melhor brasileiro";
translations.pt.newTop1000 = "Novo top 1000";
translations.pt.highlightNone = "Sem destaque";
translations.pt.rankPosition = "Ranking";
translations.pt.livePointsShort = "pts";
translations.en.weeklyTournaments = "This week's tournaments";
translations.en.noWeeklyTournaments = "No tournaments detected this week";
translations.en.biggestRise = "Biggest rise";
translations.en.biggestDrop = "Biggest drop";
translations.en.bestBrazilian = "Best Brazilian";
translations.en.newTop1000 = "New top 1000";
translations.en.highlightNone = "No highlight";
translations.en.rankPosition = "Rank";
translations.en.livePointsShort = "pts";
translations.es.weeklyTournaments = "Torneos de la semana";
translations.es.noWeeklyTournaments = "No se detectaron torneos esta semana";
translations.es.biggestRise = "Mayor subida";
translations.es.biggestDrop = "Mayor caida";
translations.es.bestBrazilian = "Mejor brasile\u00F1o";
translations.es.newTop1000 = "Nuevo top 1000";
translations.es.highlightNone = "Sin destaque";
translations.es.rankPosition = "Ranking";
translations.es.livePointsShort = "pts";
translations.it.weeklyTournaments = "Tornei della settimana";
translations.it.noWeeklyTournaments = "Nessun torneo rilevato questa settimana";
translations.it.biggestRise = "Miglior salita";
translations.it.biggestDrop = "Peggior calo";
translations.it.bestBrazilian = "Miglior brasiliano";
translations.it.newTop1000 = "Nuovo top 1000";
translations.it.highlightNone = "Nessun rilievo";
translations.it.rankPosition = "Ranking";
translations.it.livePointsShort = "pti";
translations.fr.weeklyTournaments = "Tournois de la semaine";
translations.fr.noWeeklyTournaments = "Aucun tournoi detecte cette semaine";
translations.fr.biggestRise = "Plus forte hausse";
translations.fr.biggestDrop = "Plus forte baisse";
translations.fr.bestBrazilian = "Meilleur bresilien";
translations.fr.newTop1000 = "Nouveau top 1000";
translations.fr.highlightNone = "Aucun temps fort";
translations.fr.rankPosition = "Classement";
translations.fr.livePointsShort = "pts";

function t(key) {
  return (translations[state.language] || translations.pt)[key] || translations.pt[key] || key;
}

function parseSourceDate(value = "") {
  if (!value) return null;

  const trimmed = String(value).trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
  }

  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) {
    return new Date(Date.UTC(Number(brMatch[3]), Number(brMatch[2]) - 1, Number(brMatch[1])));
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length >= 3) {
    const day = Number(parts[0]);
    const monthToken = parts[1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const year = Number(parts[2]);
    const monthIndex = {
      jan: 0,
      fev: 1,
      feb: 1,
      mar: 2,
      abr: 3,
      apr: 3,
      mai: 4,
      may: 4,
      jun: 5,
      jul: 6,
      ago: 7,
      aug: 7,
      set: 8,
      sep: 8,
      out: 9,
      oct: 9,
      nov: 10,
      dez: 11,
      dec: 11
    }[monthToken];

    if (Number.isInteger(day) && Number.isInteger(year) && Number.isInteger(monthIndex)) {
      return new Date(Date.UTC(year, monthIndex, day));
    }
  }

  return null;
}

function isoWeekNumber(date) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
}

function weekLabelText(rankingDate = "") {
  const date = parseSourceDate(rankingDate);
  if (!date) return rankingDate;
  return `Semana ${isoWeekNumber(date)} · ${rankingDate}`;
}

function weekLabelMarkup(rankingDate = "") {
  const text = weekLabelText(rankingDate);
  const [weekPart, datePart] = text.split(" · ");
  if (!datePart) return escapeHtml(text);
  return `${escapeHtml(weekPart)}<br />${escapeHtml(datePart)}`;
}

function updateStaticText() {
  document.documentElement.lang = t("htmlLang");
  document.documentElement.dataset.theme = state.theme;
  if (els.themeSelect) {
    els.themeSelect.value = state.theme;
    const lightOption = els.themeSelect.querySelector('option[value="light"]');
    const darkOption = els.themeSelect.querySelector('option[value="dark"]');
    if (lightOption) lightOption.textContent = t("lightMode");
    if (darkOption) darkOption.textContent = t("darkMode");
  }
  if (els.themeLabel) els.themeLabel.textContent = t("theme");
  els.languageSelect.value = state.language;
  els.languageLabel.textContent = t("language");
  els.siteCredit.textContent = t("siteCredit");
  if (els.rankingBaseLabel) els.rankingBaseLabel.textContent = "";
  if (els.updatedCardLabel) els.updatedCardLabel.textContent = t("updated");
  els.searchLabel.textContent = t("search");
  els.searchInput.placeholder = t("searchPlaceholder");
  els.categoryLabel.textContent = t("category");
  els.genderFilter.querySelector('option[value="Boys"]').textContent = t("boys");
  els.genderFilter.querySelector('option[value="Girls"]').textContent = t("girls");
  els.sortLabel.textContent = t("sortBy");
  els.sortFilter.querySelector('option[value="liveRank"]').textContent = t("liveRank");
  els.sortFilter.querySelector('option[value="officialRank"]').textContent = t("officialRank");
  els.liveRankingTitle.textContent = t("liveRanking");
  els.playerPanelTitle.textContent = t("playerPoints");
  if (els.weeklyTournamentsTitle) els.weeklyTournamentsTitle.textContent = t("weeklyTournaments");
  if (els.highlightRiseLabel) els.highlightRiseLabel.textContent = t("biggestRise");
  if (els.highlightDropLabel) els.highlightDropLabel.textContent = t("biggestDrop");
  if (els.highlightBrazilLabel) els.highlightBrazilLabel.textContent = t("bestBrazilian");
  if (els.highlightEntryLabel) els.highlightEntryLabel.textContent = t("newTop1000");
  els.dataSourceNote.textContent = t("formula");

  if (state.dataSource.rankingDate && els.weekLabel) els.weekLabel.innerHTML = weekLabelMarkup(state.dataSource.rankingDate);
  if (state.dataSource.updatedAt) els.updatedAtLabel.textContent = state.dataSource.updatedAt;
}

function applyDataSet(payload) {
  const nextSource = payload.dataSource || payload.source;
  const nextPlayers = Array.isArray(payload.players) ? payload.players : payload;

  if (!Array.isArray(nextPlayers)) return;

  state.players = structuredClone(nextPlayers);
  state.selectedId = null;

  if (nextSource) {
    state.dataSource = {
      ...state.dataSource,
      ...nextSource
    };
  }

  updateStaticText();
  renderEmptyDetails();
  renderWeeklyTournaments();
  renderTable();
}

async function loadAutomatedData() {
  try {
    const cacheToken = Date.now();
    const [latestResponse, weeklyTournamentsResponse] = await Promise.all([
      fetch(`data/latest.json?v=${cacheToken}`, { cache: "no-store" }),
      fetch(`data/weekly-tournaments-preview.json?v=${cacheToken}`, { cache: "no-store" })
    ]);

    if (latestResponse.ok) {
      applyDataSet(await latestResponse.json());
    }

    if (weeklyTournamentsResponse.ok) {
      const weeklyPayload = await weeklyTournamentsResponse.json();
      state.weeklyTournaments = Array.isArray(weeklyPayload?.tournaments) ? weeklyPayload.tournaments : [];
      renderWeeklyTournaments();
    }
  } catch {
    // Opening the HTML file directly can block fetch; the built-in sample data keeps the app usable.
  }
}

function compareTournamentGrades(left = "", right = "") {
  const order = ["JGS", "J500", "J300", "J200", "J100", "J60", "J30"];
  const leftIndex = order.indexOf(String(left).toUpperCase());
  const rightIndex = order.indexOf(String(right).toUpperCase());

  if (leftIndex === -1 && rightIndex === -1) return String(left).localeCompare(String(right));
  if (leftIndex === -1) return 1;
  if (rightIndex === -1) return -1;

  return leftIndex - rightIndex;
}

function groupedWeeklyTournaments() {
  const grouped = new Map();

  for (const tournament of state.weeklyTournaments || []) {
    const grade = String(tournament.grade || "Outros").trim() || "Outros";
    const tournamentName = String(tournament.tournamentName || "")
      .replace(new RegExp(`^${grade}\\s+`, "i"), "")
      .trim();
    if (!tournamentName) continue;

    if (!grouped.has(grade)) grouped.set(grade, new Set());
    grouped.get(grade).add(tournamentName);
  }

  return [...grouped.entries()]
    .sort((a, b) => compareTournamentGrades(a[0], b[0]))
    .map(([grade, names]) => ({
      grade,
      tournaments: [...names].sort((a, b) => a.localeCompare(b))
    }));
}

function renderWeeklyTournaments() {
  if (!els.weeklyTournamentsList) return;

  const groups = groupedWeeklyTournaments();
  if (!groups.length) {
    els.weeklyTournamentsList.innerHTML = `<p class="weekly-tournaments-empty">${escapeHtml(t("noWeeklyTournaments"))}</p>`;
    return;
  }

  els.weeklyTournamentsList.innerHTML = groups
    .map(
      (group) => `
        <div class="weekly-tournament-group">
          <span class="weekly-tournament-grade">${escapeHtml(group.grade)}</span>
          <span class="weekly-tournament-names">${escapeHtml(group.tournaments.join(", "))}</span>
        </div>
      `
    )
    .join("");
}

function rankedResults(results = [], multiplier = 1) {
  return [...results]
    .sort((a, b) => b.points - a.points)
    .map((item, index) => ({
      ...item,
      isCounting: index < 6 && item.sourceCounting !== false && item.sourceCounting !== "false",
      countedPoints: Number(item.points || 0) * multiplier
    }));
}

function bestSixResults(results = [], multiplier = 1) {
  return [...results]
    .filter(isSourceCountingResult)
    .sort((a, b) => Number(b.points || 0) - Number(a.points || 0))
    .slice(0, 6)
    .map((item) => ({
      ...item,
      isCounting: true,
      countedPoints: Number(item.points || 0) * multiplier
    }));
}

function isSourceCountingResult(item) {
  return item?.sourceCounting !== false && item?.sourceCounting !== "false";
}

function sumPoints(results = []) {
  return results.reduce((total, item) => total + Number(item.points || 0), 0);
}

function sumCounted(results = [], multiplier = 1) {
  return rankedResults(results, multiplier)
    .filter((item) => item.isCounting)
    .reduce((total, item) => total + item.countedPoints, 0);
}

function sumBestSix(results = [], multiplier = 1) {
  return bestSixResults(results, multiplier).reduce((total, item) => total + item.countedPoints, 0);
}

function countedReplacementResults(beforeResults = [], afterResults = [], multiplier = 1) {
  const beforeCounted = rankedResults(beforeResults, multiplier).filter((item) => item.isCounting);
  const afterCounted = bestSixResults(afterResults, multiplier);
  const beforeKeys = new Set(beforeCounted.map(resultKey));

  return afterCounted.filter((item) => !beforeKeys.has(resultKey(item)));
}

const gradePoints = {
  JGS: { R32: 90, R16: 180, QF: 300, SF: 490, Final: 700, Campeao: 1000 },
  J500: { R32: 45, R16: 90, QF: 150, SF: 250, Final: 350, Campeao: 500 },
  J300: { R32: 30, R16: 60, QF: 100, SF: 140, Final: 210, Campeao: 300 },
  J200: { R32: 18, R16: 36, QF: 60, SF: 100, Final: 140, Campeao: 200 },
  J100: { R32: 5, R16: 10, QF: 20, SF: 36, Final: 60, Campeao: 100 },
  J60: { R16: 5, QF: 10, SF: 18, Final: 36, Campeao: 60 },
  J30: { R16: 2, QF: 5, SF: 9, Final: 18, Campeao: 30 }
};

const doublesGradePoints = {
  JGS: { R16: 135, QF: 225, SF: 367, Final: 525, Campeao: 750 },
  J500: { R16: 67, QF: 112, SF: 187, Final: 262, Campeao: 375 },
  J300: { R16: 45, QF: 75, SF: 105, Final: 157, Campeao: 225 },
  J200: { R16: 27, QF: 45, SF: 75, Final: 105, Campeao: 150 },
  J100: { R16: 7, QF: 15, SF: 27, Final: 45, Campeao: 75 },
  J60: { QF: 7, SF: 14, Final: 27, Campeao: 45 },
  J30: { QF: 3, SF: 6, Final: 13, Campeao: 25 }
};

const nextRound = {
  R64: "R32",
  R32: "R16",
  R16: "QF",
  QF: "SF",
  SF: "Final",
  Final: "Campeao",
  Campeao: "Campeao"
};

function doublesValue(points) {
  return Number(points || 0) * 0.25;
}

function hasActiveDraw(liveEvent, type) {
  const status = liveEvent?.[`${type}Status`] || "";
  const round = liveEvent?.[`${type}Round`] || "";
  return status === "Ativo" && round && round !== "Nao joga";
}

function projectedRawPointsForType(liveEvent, type, target) {
  const isDoubles = type === "doubles";
  const table = isDoubles ? doublesGradePoints[liveEvent.grade] || {} : gradePoints[liveEvent.grade] || {};
  const currentRound = liveEvent[`${type}Round`] || "";
  const currentRawPoints = Number(liveEvent[`${type}Points`] || 0);
  const targetRound = target === "next" ? nextRound[currentRound] || currentRound : "Campeao";

  if (target === "max") {
    const maxPoints = Number(liveEvent[`${type}MaxPoints`] || table.Campeao || currentRawPoints);
    return Math.max(currentRawPoints, maxPoints);
  }

  return Math.max(currentRawPoints, Number(table[targetRound] || currentRawPoints));
}

function countedPointsWithProjection(baseResults, currentRawPoints, projectedRawPoints, multiplier = 1) {
  const baselineResults = isMeaningfulPoints(currentRawPoints)
    ? [...baseResults, { event: "__current_projection__", round: "", points: currentRawPoints }]
    : [...baseResults];
  const projectedResults = isMeaningfulPoints(projectedRawPoints)
    ? [...baseResults, { event: "__projected_projection__", round: "", points: projectedRawPoints }]
    : [...baseResults];

  const baseline = sumBestSix(baselineResults, multiplier);
  const projected = sumBestSix(projectedResults, multiplier);

  return Math.max(0, projected - baseline);
}

function projectionGainForType(player, type, target) {
  const liveEvent = player.liveEvent || {};
  if (!hasActiveDraw(liveEvent, type)) return null;

  const isDoubles = type === "doubles";
  const currentRawPoints = Number(liveEvent[`${type}Points`] || 0);
  const projectedRawPoints = projectedRawPointsForType(liveEvent, type, target);
  const baseResults = type === "doubles"
    ? (Array.isArray(player.liveBaseDoubles) ? player.liveBaseDoubles : [])
    : (Array.isArray(player.liveBaseSingles) ? player.liveBaseSingles : []);
  const gain = countedPointsWithProjection(baseResults, currentRawPoints, projectedRawPoints, isDoubles ? 0.25 : 1);

  if (!isMeaningfulPoints(gain)) return null;

  return {
    type,
    label: isDoubles ? "(D)" : "(S)",
    gain
  };
}

function projectionScenarios(player, target) {
  const scenarios = [
    projectionGainForType(player, "singles", target),
    projectionGainForType(player, "doubles", target)
  ].filter(Boolean);

  if (scenarios.length > 1) {
    scenarios.push({
      type: "combined",
      label: "(S+D)",
      gain: scenarios.reduce((total, item) => total + item.gain, 0)
    });
  }

  return scenarios;
}

function normalizePlayer(player) {
  if (player?.computedLiveDataVersion) {
    return {
      ...player,
      singles: Array.isArray(player.singles) ? player.singles : [],
      doubles: Array.isArray(player.doubles) ? player.doubles : [],
      defending: Array.isArray(player.defending) ? player.defending : [],
      replacements: Array.isArray(player.replacements) ? player.replacements : [],
      weeklyEntries: Array.isArray(player.weeklyEntries) ? player.weeklyEntries : [],
      pointsFlow: player.pointsFlow || { dropping: [], entering: [] },
      nextScenarios: Array.isArray(player.nextScenarios) ? player.nextScenarios : [],
      maxScenarios: Array.isArray(player.maxScenarios) ? player.maxScenarios : [],
      liveEvent: player.liveEvent || {}
    };
  }

  const singles = Array.isArray(player.singles) ? player.singles : [];
  const doubles = Array.isArray(player.doubles) ? player.doubles : [];
  const defending = Array.isArray(player.defending) ? player.defending : [];
  const liveEvent = player.liveEvent || {};
  const droppingSingles = droppingResultSet(defending, "singles");
  const droppingDoubles = droppingResultSet(defending, "doubles");
  const liveBaseSingles = singles.filter((result) => !droppingSingles.has(resultKey(result)));
  const liveBaseDoubles = doubles.filter((result) => !droppingDoubles.has(resultKey(result)));
  const replacementSingles = countedReplacementResults(singles, liveBaseSingles);
  const replacementDoubles = countedReplacementResults(doubles, liveBaseDoubles, 0.25).map((item) => ({
    ...item,
    type: "doubles"
  }));
  const basePoints = sumCounted(singles) + sumCounted(doubles, 0.25);
  const liveBasePoints = sumBestSix(liveBaseSingles) + sumBestSix(liveBaseDoubles, 0.25);
  const defendingPoints = Math.max(0, basePoints - liveBasePoints);
  const weeklySinglesResult = isMeaningfulPoints(liveEvent.singlesPoints)
    ? { event: liveEvent.event, round: liveEvent.grade, points: Number(liveEvent.singlesPoints || 0), type: "singles", isWeeklyResult: true }
    : null;
  const weeklyDoublesResult = isMeaningfulPoints(liveEvent.doublesPoints)
    ? { event: liveEvent.event, round: liveEvent.grade, points: Number(liveEvent.doublesPoints || 0), type: "doubles", isWeeklyResult: true }
    : null;
  const liveSingles = weeklySinglesResult ? [...liveBaseSingles, weeklySinglesResult] : liveBaseSingles;
  const liveDoubles = weeklyDoublesResult ? [...liveBaseDoubles, weeklyDoublesResult] : liveBaseDoubles;
  const fallbackPoints = Number(player.sourceTotalCombinedPoints ?? player.officialPoints ?? 0);
  const hasDetailedResults = singles.length + doubles.length > 0;
  const liveCountedSingles = bestSixResults(liveSingles);
  const liveCountedDoubles = bestSixResults(liveDoubles, 0.25);
  const weeklyEntries = [
    ...liveCountedSingles.filter((item) => item.isWeeklyResult),
    ...liveCountedDoubles.filter((item) => item.isWeeklyResult)
  ];
  const livePoints = hasDetailedResults
    ? Math.max(0, sumBestSix(liveSingles) + sumBestSix(liveDoubles, 0.25))
    : Math.max(0, fallbackPoints);
  const gainedPoints = Math.max(0, livePoints - liveBasePoints);
  const normalizedPlayer = {
    ...player,
    singles,
    doubles,
    defending,
    liveBaseSingles,
    liveBaseDoubles,
    replacements: [
      ...replacementSingles.map((item) => ({ ...item, type: "singles" })),
      ...replacementDoubles
    ],
    weeklyEntries,
    liveEvent,
    basePoints,
    liveBasePoints,
    defendingPoints,
    gainedPoints,
    livePoints
  };

  const scenarioGainTotal = (target) =>
    projectionScenarios(normalizedPlayer, target)
      .filter((item) => item.type !== "combined")
      .reduce((total, item) => total + item.gain, 0);

  return {
    ...normalizedPlayer,
    nextWinPoints: Math.max(0, livePoints + scenarioGainTotal("next")),
    maxPoints: Math.max(0, livePoints + scenarioGainTotal("max"))
  };
}

function resultKey(result) {
  return [result.event || "", Number(result.points || 0)].join("|");
}

function droppingResultSet(defending = [], type) {
  return new Set(
    defending
      .filter((result) => result.type === type)
      .map(resultKey)
  );
}

function getRankedPlayers() {
  const query = els.searchInput.value.trim().toLowerCase();
  const gender = els.genderFilter.value;
  const sortBy = els.sortFilter.value;

  const normalized = state.players
    .map(normalizePlayer)
    .filter((player) => {
      return player.gender === gender;
    });

  const hasPrecomputedRanks = normalized.some((player) => Number.isFinite(Number(player.liveRank)) && Number(player.liveRank) > 0);

  const liveRanked = hasPrecomputedRanks
    ? [...normalized].sort((a, b) => Number(a.liveRank || Infinity) - Number(b.liveRank || Infinity))
    : normalized
      .sort((a, b) => b.livePoints - a.livePoints)
      .map((player, index) => ({
        ...player,
        liveRank: index + 1
      }));

  const visiblePool = liveRanked
    .filter((player) => player.liveRank <= LIVE_RANKING_TABLE_LIMIT)
    .filter((player) => {
      const haystack = [
        player.name,
        player.country,
        player.gender,
        player.liveEvent.event,
        ...player.defending.map((item) => item.event)
      ]
        .join(" ")
        .toLowerCase();
      return !query || haystack.includes(query);
    });

  const sorters = {
    liveRank: (a, b) => {
      if (Number.isFinite(Number(a.liveRank)) && Number.isFinite(Number(b.liveRank))) {
        return Number(a.liveRank) - Number(b.liveRank);
      }
      return Number(b.livePoints || 0) - Number(a.livePoints || 0);
    },
    officialRank: (a, b) => Number(a.currentRank || Infinity) - Number(b.currentRank || Infinity)
  };

  return visiblePool.sort(sorters[sortBy] || sorters.liveRank);
}

function baseRankedPlayersForHighlights() {
  const gender = els.genderFilter.value;

  const normalized = state.players
    .map(normalizePlayer)
    .filter((player) => player.gender === gender);

  const hasPrecomputedRanks = normalized.some((player) => Number.isFinite(Number(player.liveRank)) && Number(player.liveRank) > 0);

  const liveRanked = hasPrecomputedRanks
    ? [...normalized].sort((a, b) => Number(a.liveRank || Infinity) - Number(b.liveRank || Infinity))
    : normalized
      .sort((a, b) => Number(b.livePoints || 0) - Number(a.livePoints || 0))
      .map((player, index) => ({
        ...player,
        liveRank: index + 1
      }));

  return liveRanked.filter((player) => Number(player.liveRank || Infinity) <= LIVE_RANKING_TABLE_LIMIT);
}

function formatNumber(value) {
  const number = Number(value || 0);
  const hasDecimals = Math.abs(number - Math.trunc(number)) > 0.000001;
  const locales = { pt: "pt-BR", en: "en-US", es: "es-ES", it: "it-IT", fr: "fr-FR" };
  return number.toLocaleString(locales[state.language] || "pt-BR", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pointsItemValue(item = {}) {
  return item.type === "doubles" ? doublesValue(item.points) : Number(item.points || 0);
}

function isMeaningfulPoints(value) {
  return Math.abs(Number(value || 0)) > 0.0001;
}

function inferResultPhase(item = {}) {
  const grade = String(item.round || "").toUpperCase();
  const rawPoints = Number(item.points || 0);
  const table = item.type === "doubles" ? doublesGradePoints[grade] : gradePoints[grade];
  if (!table || !isMeaningfulPoints(rawPoints)) return "";

  for (const [phase, phasePoints] of Object.entries(table)) {
    if (Math.abs(Number(phasePoints) - rawPoints) < 0.001) {
      return phase;
    }
  }

  return "";
}

function abbreviateTournamentName(eventName = "") {
  const compact = String(eventName)
    .replace(/\bThe Junior Championships,\s*Wimbledon\b/gi, "Wimbledon Juniors")
    .replace(/\bAustralian Open Junior Championships\b/gi, "Australian Open Juniors")
    .replace(/\bRoland Garros Junior Championships\b/gi, "Roland Garros Juniors")
    .replace(/\bUS Open Junior Tennis Championships\b/gi, "US Open Juniors")
    .replace(/\bChampionships\b/gi, "Ch.")
    .replace(/\bChampionship\b/gi, "Ch.")
    .replace(/\bInternational\b/gi, "Intl.")
    .replace(/\bRegional\b/gi, "Reg.")
    .replace(/\bClosed\b/gi, "Cls.")
    .replace(/\s+/g, " ")
    .trim();

  if (compact.length <= 30) return compact;
  return `${compact.slice(0, 27).trimEnd()}...`;
}

function pointsFlowText(eventName, typeLabel, phaseLabel, value) {
  if (!eventName || !typeLabel || !isMeaningfulPoints(value)) return "";
  return [abbreviateTournamentName(eventName), typeLabel, phaseLabel, `${formatNumber(Math.abs(value))} pts`]
    .filter(Boolean)
    .join(" - ");
}

function pointsDropItems(player) {
  return pointsDropLines(player);
}

function pointsEntrySummary(player) {
  return pointsEntryLines(player).join(" | ");
}

function pointsDropLines(player) {
  const defending = Array.isArray(player.defending) ? player.defending : [];
  return defending
    .map((item) => {
      const typeLabel = item.type === "doubles" ? "(D)" : "(S)";
      const phaseLabel = inferResultPhase(item);
      return pointsFlowText(item.event, typeLabel, phaseLabel, -pointsItemValue(item));
    })
    .filter(Boolean);
}

function pointsEntryLines(player) {
  const replacements = Array.isArray(player.replacements) ? player.replacements : [];
  const weeklyEntries = Array.isArray(player.weeklyEntries) ? player.weeklyEntries : [];
  const entries = replacements
    .map((item) => {
      const typeLabel = item.type === "doubles" ? "(D)" : "(S)";
      const phaseLabel = inferResultPhase(item);
      const countedValue = item.type === "doubles" ? doublesValue(item.points) : Number(item.points || 0);
      return pointsFlowText(item.event, typeLabel, phaseLabel, countedValue);
    })
    .filter(Boolean);

  for (const item of weeklyEntries) {
    const typeLabel = item.type === "doubles" ? "(D)" : "(S)";
    const phaseLabel = inferResultPhase(item);
    const countedValue = item.type === "doubles" ? doublesValue(item.points) : Number(item.points || 0);
    const entry = pointsFlowText(item.event, typeLabel, phaseLabel, countedValue);
    if (entry) entries.push(entry);
  }

  return entries;
}

const countryFlagMap = {
  ALB: "al",
  ALG: "dz",
  ARG: "ar",
  ARM: "am",
  AUS: "au",
  AUT: "at",
  BER: "bm",
  BEL: "be",
  BIH: "ba",
  BLR: "",
  BOL: "bo",
  BOT: "bw",
  BRA: "br",
  BUL: "bg",
  CAN: "ca",
  CHI: "cl",
  CHN: "cn",
  COL: "co",
  CMR: "cm",
  COD: "cd",
  COK: "ck",
  CRC: "cr",
  CRO: "hr",
  CUW: "cw",
  CZE: "cz",
  CYP: "cy",
  DEN: "dk",
  DOM: "do",
  EGY: "eg",
  ECU: "ec",
  ESA: "sv",
  ESP: "es",
  EST: "ee",
  ETH: "et",
  FIN: "fi",
  FRA: "fr",
  GEO: "ge",
  GBR: "gb",
  GER: "de",
  GHA: "gh",
  GRE: "gr",
  GUA: "gt",
  GUM: "gu",
  HKG: "hk",
  HUN: "hu",
  IND: "in",
  INA: "id",
  IRI: "ir",
  IRL: "ie",
  ISR: "il",
  ITA: "it",
  JAM: "jm",
  JPN: "jp",
  JOR: "jo",
  KAZ: "kz",
  KEN: "ke",
  KGZ: "kg",
  KOR: "kr",
  KOS: "xk",
  KSA: "sa",
  LBN: "lb",
  LAT: "lv",
  LIE: "li",
  LTU: "lt",
  LUX: "lu",
  MAD: "mg",
  MAR: "ma",
  MAS: "my",
  MDA: "md",
  MDV: "mv",
  MEX: "mx",
  MGL: "mn",
  MKD: "mk",
  MLT: "mt",
  MNE: "me",
  MNP: "mp",
  MON: "mc",
  MOZ: "mz",
  NAM: "na",
  NED: "nl",
  NEP: "np",
  NGR: "ng",
  NOR: "no",
  NZL: "nz",
  PAK: "pk",
  PAN: "pa",
  PAR: "py",
  PER: "pe",
  PHI: "ph",
  POL: "pl",
  POR: "pt",
  PUR: "pr",
  RSA: "za",
  ROU: "ro",
  RUS: "",
  SGP: "sg",
  SLO: "si",
  SRB: "rs",
  SKN: "kn",
  SRI: "lk",
  SVK: "sk",
  SWE: "se",
  SUI: "ch",
  THA: "th",
  TJK: "tj",
  TPE: "tw",
  TUN: "tn",
  TUR: "tr",
  UAE: "ae",
  UGA: "ug",
  UKR: "ua",
  USA: "us",
  URU: "uy",
  UZB: "uz",
  VEN: "ve",
  ZIM: "zw"
};

function flagMarkup(country = "") {
  const code = String(country || "").trim().toUpperCase();
  const flagCode = countryFlagMap[code] || "";
  if (!flagCode) {
    return `<span class="flag-fallback" title="${code}" aria-label="${code}">${code}</span>`;
  }

  return `
    <span class="flag-mark" title="${code}" aria-label="${code}">
      <img
        class="flag-icon"
        src="https://flagcdn.com/20x15/${flagCode}.png"
        srcset="https://flagcdn.com/40x30/${flagCode}.png 2x"
        alt="${code}"
        loading="lazy"
      />
    </span>
  `;
}

function playerNameMarkup(name = "", country = "") {
  return `
    <span class="player-name">
      ${flagMarkup(country)}
      <span>${escapeHtml(name)}</span>
    </span>
  `;
}

function movementLabel(player) {
  if (Number.isFinite(Number(player.rankDelta))) {
    const delta = Number(player.rankDelta);
    if (!delta) return { text: "0", type: "neutral" };
    return {
      text: delta > 0 ? `+${delta}` : `${delta}`,
      type: delta > 0 ? "gain" : "loss"
    };
  }

  const officialRank = Number(player.currentRank);
  const liveRank = Number(player.liveRank || 0);
  if (!Number.isFinite(officialRank) || officialRank <= 0) {
    return { text: "0", type: "neutral" };
  }
  const delta = officialRank - liveRank;
  if (!delta) return { text: "0", type: "neutral" };
  return {
    text: delta > 0 ? `+${delta}` : `${delta}`,
    type: delta > 0 ? "gain" : "loss"
  };
}

function pointsBalanceLabel(player) {
  const balance = Number.isFinite(Number(player.pointsDelta))
    ? Number(player.pointsDelta)
    : Number(player.gainedPoints || 0) - Number(player.defendingPoints || 0);
  const dropItems = Array.isArray(player.pointsFlow?.dropping)
    ? pointsFlowLinesFromItems(player.pointsFlow.dropping, "drop")
    : (player.defendingPoints > 0 ? pointsDropLines(player) : []);
  const entryItems = Array.isArray(player.pointsFlow?.entering)
    ? pointsFlowLinesFromItems(player.pointsFlow.entering, "entry")
    : pointsEntryLines(player);
  if (!balance) return { text: "0", type: "neutral", dropItems, entryItems };
  return {
    text: balance > 0 ? `+${formatNumber(balance)}` : `-${formatNumber(Math.abs(balance))}`,
    type: balance > 0 ? "gain" : "loss",
    dropItems,
    entryItems
  };
}

function pointsFlowLinesFromItems(items = [], kind = "entry") {
  return items
    .map((item) => {
      const typeLabel = item.type === "doubles" ? "(D)" : "(S)";
      const phaseLabel = inferResultPhase(item);
      const value =
        kind === "drop"
          ? -pointsItemValue(item)
          : (item.type === "doubles" ? doublesValue(item.points) : Number(item.points || 0));
      return pointsFlowText(item.event, typeLabel, phaseLabel, value);
    })
    .filter(Boolean);
}

function officialPoints(player) {
  return Number(player.sourceTotalCombinedPoints ?? player.basePoints ?? 0);
}

function setHighlightCard(valueEl, metaEl, player, valueFallback = "-", metaFallback = "-") {
  if (!valueEl || !metaEl) return;

  if (!player) {
    valueEl.textContent = valueFallback;
    metaEl.textContent = metaFallback;
    return;
  }

  valueEl.innerHTML = playerNameMarkup(player.name, player.country);
  metaEl.textContent = metaFallback;
}

function renderHighlights() {
  const players = baseRankedPlayersForHighlights();

  const biggestRise = players
    .filter((player) => Number(player.rankDelta || 0) > 0)
    .sort((a, b) => Number(b.rankDelta || 0) - Number(a.rankDelta || 0) || Number(a.liveRank || Infinity) - Number(b.liveRank || Infinity))[0];

  const biggestDrop = players
    .filter((player) => Number(player.rankDelta || 0) < 0)
    .sort((a, b) => Number(a.rankDelta || 0) - Number(b.rankDelta || 0) || Number(a.liveRank || Infinity) - Number(b.liveRank || Infinity))[0];

  const bestBrazilian = players
    .filter((player) => String(player.country || player.countryCode || "").toUpperCase() === "BRA")
    .sort((a, b) => Number(a.liveRank || Infinity) - Number(b.liveRank || Infinity))[0];

  const newTop1000 = players
    .filter((player) => {
      const officialRank = Number(player.currentRank || 0);
      const liveRank = Number(player.liveRank || 0);
      return liveRank > 0 && liveRank <= LIVE_RANKING_TABLE_LIMIT && (!officialRank || officialRank > LIVE_RANKING_TABLE_LIMIT);
    })
    .sort((a, b) => Number(a.liveRank || Infinity) - Number(b.liveRank || Infinity))[0];

  setHighlightCard(
    els.highlightRiseValue,
    els.highlightRiseMeta,
    biggestRise,
    t("highlightNone"),
    biggestRise ? `+${Number(biggestRise.rankDelta || 0)} · ${t("rankPosition")} ${biggestRise.liveRank}` : "-"
  );

  setHighlightCard(
    els.highlightDropValue,
    els.highlightDropMeta,
    biggestDrop,
    t("highlightNone"),
    biggestDrop ? `${Number(biggestDrop.rankDelta || 0)} · ${t("rankPosition")} ${biggestDrop.liveRank}` : "-"
  );

  setHighlightCard(
    els.highlightBrazilValue,
    els.highlightBrazilMeta,
    bestBrazilian,
    t("highlightNone"),
    bestBrazilian ? `${t("rankPosition")} ${bestBrazilian.liveRank} · ${formatNumber(bestBrazilian.livePoints)} ${t("livePointsShort")}` : "-"
  );

  setHighlightCard(
    els.highlightEntryValue,
    els.highlightEntryMeta,
    newTop1000,
    t("highlightNone"),
    newTop1000 ? `${t("rankPosition")} ${newTop1000.liveRank} · ${formatNumber(newTop1000.livePoints)} ${t("livePointsShort")}` : "-"
  );
}

function phaseText(liveEvent = {}) {
  const singles = liveEvent.singlesStatus === "Eliminado"
    ? `${t("eliminated")} ${liveEvent.singlesRound || ""}`.trim()
    : `${liveEvent.singlesRound || "-"} ${t("singles").toLowerCase()}`;
  const doubles = liveEvent.doublesStatus === "Eliminado"
    ? `${t("eliminated")} ${liveEvent.doublesRound || ""}`.trim()
    : `${liveEvent.doublesRound || "-"} ${t("doubles").toLowerCase()}`;
  return `${singles} · ${doubles}`;
}

function isActiveThisWeek(liveEvent = {}) {
  const singlesNotPlaying = !liveEvent.singlesRound && liveEvent.singlesStatus === "Nao joga";
  const doublesNotPlaying = !liveEvent.doublesRound && liveEvent.doublesStatus === "Nao joga";
  return Boolean(liveEvent.event) && !(singlesNotPlaying && doublesNotPlaying);
}

function weeklyStatusMarkup(liveEvent = {}) {
  if (!isActiveThisWeek(liveEvent)) return `<span class="empty-mark">-</span>`;

  return `
    <div class="week-status">
      <strong>${liveEvent.event}</strong>
      <span>${liveEvent.singlesStatus === "Eliminado" ? `${t("singles")}: ${t("eliminated")} ${liveEvent.singlesRound || ""}` : `${t("singles")}: ${liveEvent.singlesRound || "-"}`}</span>
      <span>${liveEvent.doublesStatus === "Nao joga" ? `${t("doubles")}: ${t("notPlaying")}` : liveEvent.doublesStatus === "Eliminado" ? `${t("doubles")}: ${t("eliminated")} ${liveEvent.doublesRound || ""}` : `${t("doubles")}: ${liveEvent.doublesRound || "-"}`}</span>
    </div>
  `;
}

function renderPointsFlow(items, kind) {
  if (!Array.isArray(items) || !items.length) return "";
  const label = kind === "drop" ? "Caindo" : "Entra";
  const className = kind === "drop" ? "is-drop" : "is-entry";
  return items
    .map(
      (item) => `
        <div class="points-flow ${className}">
          <span class="points-flow-label">${label}</span>
          <span class="points-flow-text">${escapeHtml(item)}</span>
        </div>
      `
    )
    .join("");
}

function pointsFlowDisclosure(pointsBalance) {
  const dropMarkup = renderPointsFlow(pointsBalance.dropItems, "drop");
  const entryMarkup = renderPointsFlow(pointsBalance.entryItems, "entry");
  const balancePill = `<span class="pill ${pointsBalance.type}">${pointsBalance.text}</span>`;
  if (!dropMarkup && !entryMarkup) return balancePill;

  return `
    <details class="points-flow-disclosure">
      <summary class="points-flow-summary" aria-label="${escapeHtml(t("showDetails"))}">
        ${balancePill}
        <span class="points-flow-toggle-text">
          <span class="is-closed">${escapeHtml(t("showDetails"))}</span>
          <span class="is-open">${escapeHtml(t("hideDetails"))}</span>
        </span>
      </summary>
      <div class="points-flow-panel">
        ${dropMarkup}
        ${entryMarkup}
      </div>
    </details>
  `;
}

function projectionMarkup(player, target) {
  if (!isActiveThisWeek(player.liveEvent)) return `<span class="empty-mark">-</span>`;

  const scenarios = target === "next"
    ? (Array.isArray(player.nextScenarios) && player.nextScenarios.length ? player.nextScenarios : projectionScenarios(player, target))
    : (Array.isArray(player.maxScenarios) && player.maxScenarios.length ? player.maxScenarios : projectionScenarios(player, target));
  if (!scenarios.length) return `<span class="empty-mark">-</span>`;

  return `
    <div class="projection-cell">
      ${scenarios
        .map(
          (scenario) => `
            <div class="projection-line">
              <em>${scenario.label}</em>
              <strong>${formatNumber(scenario.totalPoints ?? (player.livePoints + scenario.gain))}</strong>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderTable() {
  renderHighlights();
  const players = getRankedPlayers();
  const isOfficialTable = els.sortFilter.value === "officialRank";
  const selectedIsVisible = players.some((player) => player.id === state.selectedId);
  if (state.selectedId && !selectedIsVisible) {
    state.selectedId = null;
    renderEmptyDetails();
  }

  els.rankingTable.classList.toggle("is-official-table", isOfficialTable);

  els.rankingHead.innerHTML = isOfficialTable
    ? `
      <tr>
        <th>${t("officialRank")}</th>
        <th>${t("athlete")}</th>
        <th>${t("birthYear")}</th>
        <th>${t("officialPoints")}</th>
      </tr>
    `
    : `
      <tr>
        <th>${t("liveRank")}</th>
        <th>${t("athlete")}</th>
        <th>${t("birthYear")}</th>
        <th>${t("livePoints")}</th>
        <th>${t("playingThisWeek")}</th>
        <th>${t("nextRound")}</th>
        <th>${t("champion")}</th>
      </tr>
    `;

  els.rankingBody.innerHTML = players
    .map((player) => {
      const movement = movementLabel(player);
      const pointsBalance = pointsBalanceLabel(player);
      const selected = state.selectedId === player.id ? " is-selected" : "";
      if (isOfficialTable) {
        return `
          <tr class="${selected}" data-player-id="${player.id}">
          <td><strong class="rank">${player.currentRank || "-"}</strong></td>
          <td>
            <div class="player">
              <strong>${playerNameMarkup(player.name, player.country)}</strong>
            </div>
          </td>
          <td>${player.birthYear || "-"}</td>
          <td><strong class="official-points">${formatNumber(officialPoints(player))}</strong></td>
        </tr>
      `;
      }

      return `
        <tr class="${selected}" data-player-id="${player.id}">
          <td>
            <div class="rank-cell">
              <strong class="rank">${player.liveRank}</strong>
              <span class="pill ${movement.type}">${movement.text}</span>
            </div>
          </td>
          <td>
            <div class="player">
              <strong>${playerNameMarkup(player.name, player.country)}</strong>
            </div>
          </td>
          <td>${player.birthYear || "-"}</td>
          <td>
            <div class="points-stack">
              <div class="points-cell">
                <strong class="live-points">${formatNumber(player.livePoints)}</strong>
                ${pointsFlowDisclosure(pointsBalance)}
              </div>
            </div>
          </td>
          <td>${weeklyStatusMarkup(player.liveEvent)}</td>
          <td class="projected-points is-max">${projectionMarkup(player, "next")}</td>
          <td class="projected-points is-max">${projectionMarkup(player, "max")}</td>
        </tr>
      `;
    })
    .join("");

  if (state.selectedId) renderDetails(state.selectedId);
}

function renderEmptyDetails() {
  els.playerDetails.className = "details-empty";
  els.playerDetails.textContent = t("emptyDetails");
}

function countingLabel(isCounting) {
  return isCounting === false ? t("notCounting") : t("counting");
}

function resultMarkup(results, label, modifier = "") {
  return `
    <h3>${label}</h3>
    <div class="result-list">
      ${results
        .map(
          (item) => `
          <div class="result-card ${modifier} ${item.isCounting === false ? "is-out" : ""}">
            <div>
              <strong>${item.event}</strong>
              <span class="small">${item.round || item.type || ""} ${item.date ? " · " + item.date : ""}</span>
            </div>
            <div class="result-points">
              <strong>${formatNumber(item.countedPoints ?? item.points)}</strong>
              ${item.countedPoints !== undefined && item.countedPoints !== item.points ? `<span>${formatNumber(item.points)} ${t("gross")}</span>` : ""}
              <span>${countingLabel(item.isCounting)}</span>
            </div>
          </div>
        `
        )
        .join("")}
    </div>
  `;
}

function renderDetails(playerId) {
  const player = state.players.map(normalizePlayer).find((item) => item.id === playerId);
  if (!player) return;

  const liveResults = [
    {
      event: `${player.liveEvent.event || t("currentTournament")} · ${t("singles").toLowerCase()}`,
      round: player.liveEvent.singlesRound || "-",
      points: Number(player.liveEvent.singlesPoints || 0),
      countedPoints: Number(player.liveEvent.singlesPoints || 0),
      isCounting: true
    },
    {
      event: `${player.liveEvent.event || t("currentTournament")} · ${t("doubles").toLowerCase()}`,
      round: player.liveEvent.doublesRound || "-",
      points: Number(player.liveEvent.doublesPoints || 0),
      countedPoints: doublesValue(player.liveEvent.doublesPoints),
      isCounting: true
    }
  ].filter((item) => item.points > 0);

  const singlesResults = rankedResults(player.singles);
  const doublesResults = rankedResults(player.doubles, 0.25);
  const defendingResults = player.defending.map((item) => ({
    ...item,
    countedPoints: item.type === "doubles" ? doublesValue(item.points) : Number(item.points || 0),
    isCounting: true
  }));

  els.playerDetails.className = "";
  els.playerDetails.innerHTML = `
    <div class="player detail-player">
      <strong>${playerNameMarkup(player.name, player.country)}</strong>
      <span>${t("official")} ${player.currentRank} · live ${formatNumber(player.livePoints)} · ${t("maximum")} ${formatNumber(player.maxPoints)}</span>
      <span>${player.liveEvent.event || "-"} · ${phaseText(player.liveEvent)}</span>
    </div>
    ${resultMarkup(singlesResults, t("singles"))}
    ${resultMarkup(doublesResults, `${t("doubles")} (25%)`)}
    ${defendingResults.length ? resultMarkup(defendingResults, t("pointsDefended"), "is-dropping") : ""}
    ${liveResults.length ? resultMarkup(liveResults, t("pointsEntering"), "is-new") : ""}
  `;
}

els.rankingBody.addEventListener("click", (event) => {
  if (event.target.closest(".points-flow-summary")) {
    return;
  }
  const row = event.target.closest("tr[data-player-id]");
  if (!row) return;
  state.selectedId = row.dataset.playerId;
  renderTable();
  renderDetails(state.selectedId);
});

[els.searchInput, els.genderFilter, els.sortFilter].forEach((element) => {
  element.addEventListener("input", renderTable);
});

els.languageSelect.addEventListener("input", () => {
  state.language = els.languageSelect.value;
  localStorage.setItem("itf-juniors-language", state.language);
  updateStaticText();
  renderWeeklyTournaments();
  renderTable();
  if (state.selectedId) renderDetails(state.selectedId);
});

if (els.themeSelect) {
  els.themeSelect.addEventListener("input", () => {
    state.theme = els.themeSelect.value;
    localStorage.setItem("itf-juniors-theme", state.theme);
    updateStaticText();
  });
}

updateStaticText();
renderEmptyDetails();
renderWeeklyTournaments();
renderTable();
loadAutomatedData();
