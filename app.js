const state = {
  players: structuredClone(samplePlayers),
  selectedId: null
};

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
  dataSourceNote: document.querySelector("#dataSourceNote")
};

if (typeof dataSource !== "undefined") {
  els.weekLabel.textContent = dataSource.rankingDate;
  els.updatedAtLabel.textContent = `Atualizado ${dataSource.updatedAt}`;
  els.dataSourceNote.textContent = dataSource.note;
}

function applyDataSet(payload) {
  const nextSource = payload.dataSource || payload.source;
  const nextPlayers = Array.isArray(payload.players) ? payload.players : payload;

  if (!Array.isArray(nextPlayers)) return;

  state.players = structuredClone(nextPlayers);
  state.selectedId = null;

  if (nextSource) {
    els.weekLabel.textContent = nextSource.rankingDate || els.weekLabel.textContent;
    els.updatedAtLabel.textContent = nextSource.updatedAt
      ? `Atualizado ${nextSource.updatedAt}`
      : els.updatedAtLabel.textContent;
    els.dataSourceNote.textContent = nextSource.note || els.dataSourceNote.textContent;
  }

  renderEmptyDetails();
  renderTable();
}

async function loadAutomatedData() {
  try {
    const response = await fetch("data/latest.json", { cache: "no-store" });
    if (!response.ok) return;
    applyDataSet(await response.json());
  } catch {
    // Opening the HTML file directly can block fetch; the built-in sample data keeps the app usable.
  }
}

function rankedResults(results = [], multiplier = 1) {
  return [...results]
    .sort((a, b) => b.points - a.points)
    .map((item, index) => ({
      ...item,
      isCounting: index < 6,
      countedPoints: Number(item.points || 0) * multiplier
    }));
}

function sumPoints(results = []) {
  return results.reduce((total, item) => total + Number(item.points || 0), 0);
}

function sumCounted(results = [], multiplier = 1) {
  return rankedResults(results, multiplier)
    .filter((item) => item.isCounting)
    .reduce((total, item) => total + item.countedPoints, 0);
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

function projectedEventPoints(liveEvent, target) {
  const table = gradePoints[liveEvent.grade] || {};
  const singlesRound = liveEvent.singlesRound || "";
  const doublesRound = liveEvent.doublesRound || "";

  if (target === "max") {
    return Number(liveEvent.singlesMaxPoints || 0) + doublesValue(liveEvent.doublesMaxPoints);
  }

  const singlesTarget = target === "next" ? nextRound[singlesRound] || singlesRound : "Campeao";
  const doublesTarget = target === "next" ? nextRound[doublesRound] || doublesRound : "Campeao";

  const singlesCurrent = Number(liveEvent.singlesPoints || 0);
  const doublesCurrent = Number(liveEvent.doublesPoints || 0);
  const singlesProjected = Number(table[singlesTarget] || singlesCurrent);
  const doublesProjected = Number(table[doublesTarget] || doublesCurrent);
  const singlesPoints = singlesRound === "Nao joga" ? 0 : Math.max(singlesCurrent, singlesProjected);
  const doublesPoints = doublesRound === "Nao joga" ? 0 : doublesValue(Math.max(doublesCurrent, doublesProjected));

  return singlesPoints + doublesPoints;
}

function normalizePlayer(player) {
  const singles = Array.isArray(player.singles) ? player.singles : [];
  const doubles = Array.isArray(player.doubles) ? player.doubles : [];
  const defending = Array.isArray(player.defending) ? player.defending : [];
  const liveEvent = player.liveEvent || {};
  const basePoints = sumCounted(singles) + sumCounted(doubles, 0.25);
  const defendingPoints = defending.reduce((total, item) => {
    return total + (item.type === "doubles" ? doublesValue(item.points) : Number(item.points || 0));
  }, 0);
  const gainedPoints = Number(liveEvent.singlesPoints || 0) + doublesValue(liveEvent.doublesPoints);
  const livePoints = Math.max(0, basePoints - defendingPoints + gainedPoints);
  const nextWinPoints = Math.max(0, basePoints - defendingPoints + projectedEventPoints(liveEvent, "next"));
  const maxPoints = Math.max(0, basePoints - defendingPoints + projectedEventPoints(liveEvent, "max"));

  return {
    ...player,
    singles,
    doubles,
    defending,
    liveEvent,
    basePoints,
    defendingPoints,
    gainedPoints,
    livePoints,
    nextWinPoints,
    maxPoints,
    projectedMovement: estimateMovement(player.currentRank, basePoints, livePoints)
  };
}

function estimateMovement(currentRank, basePoints, livePoints) {
  const delta = livePoints - basePoints;
  if (!currentRank || delta === 0) return 0;
  return Math.round(delta / 70);
}

function getRankedPlayers() {
  const query = els.searchInput.value.trim().toLowerCase();
  const gender = els.genderFilter.value;
  const sortBy = els.sortFilter.value;

  const filtered = state.players
    .map(normalizePlayer)
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
      return (!query || haystack.includes(query)) && player.gender === gender;
    });

  const sorters = {
    liveRank: (a, b) => b.livePoints - a.livePoints,
    officialRank: (a, b) => Number(a.currentRank || Infinity) - Number(b.currentRank || Infinity)
  };

  return filtered.sort(sorters[sortBy] || sorters.liveRank).map((player, index) => ({
    ...player,
    liveRank: index + 1
  }));
}

function formatNumber(value) {
  const number = Number(value || 0);
  const hasDecimals = Math.abs(number - Math.trunc(number)) > 0.000001;
  return number.toLocaleString("pt-BR", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0
  });
}

function flagMarkup(country = "") {
  const code = String(country).toLowerCase();
  return `<span class="country-badge country-${code}" title="${country}" aria-label="${country}">${country}</span>`;
}

function movementLabel(player) {
  const projectedRank = Math.max(1, Number(player.currentRank || player.liveRank) - player.projectedMovement);
  const delta = Number(player.currentRank || 0) - projectedRank;
  if (!delta) return { text: "0", type: "neutral" };
  return {
    text: delta > 0 ? `+${delta}` : `${delta}`,
    type: delta > 0 ? "gain" : "loss"
  };
}

function pointsBalanceLabel(player) {
  const balance = player.gainedPoints - player.defendingPoints;
  if (!balance) return { text: "0", type: "neutral" };
  return {
    text: balance > 0 ? `+${formatNumber(balance)}` : `-${formatNumber(Math.abs(balance))}`,
    type: balance > 0 ? "gain" : "loss"
  };
}

function officialPoints(player) {
  return Number(player.sourceTotalCombinedPoints ?? player.basePoints ?? 0);
}

function phaseText(liveEvent = {}) {
  const singles = liveEvent.singlesStatus === "Eliminado"
    ? `Eliminado ${liveEvent.singlesRound || ""}`.trim()
    : `${liveEvent.singlesRound || "-"} simples`;
  const doubles = liveEvent.doublesStatus === "Eliminado"
    ? `Eliminado ${liveEvent.doublesRound || ""}`.trim()
    : `${liveEvent.doublesRound || "-"} duplas`;
  return `${singles} · ${doubles}`;
}

function weeklyStatusMarkup(liveEvent = {}) {
  if (!liveEvent.event) return `<span class="empty-mark">-</span>`;
  return `
    <div class="week-status">
      <strong>${liveEvent.event}</strong>
      <span>${liveEvent.singlesStatus === "Eliminado" ? `Simples: eliminado ${liveEvent.singlesRound || ""}` : `Simples: ${liveEvent.singlesRound || "-"}`}</span>
      <span>${liveEvent.doublesStatus === "Nao joga" ? "Duplas: não joga" : liveEvent.doublesStatus === "Eliminado" ? `Duplas: eliminado ${liveEvent.doublesRound || ""}` : `Duplas: ${liveEvent.doublesRound || "-"}`}</span>
    </div>
  `;
}

function projectionMarkup(player) {
  return `
    <div class="projection-cell">
      <div>
        <span>Próx. vitória</span>
        <strong>${formatNumber(player.nextWinPoints)}</strong>
      </div>
      <div>
        <span>Campeão</span>
        <strong>${formatNumber(player.maxPoints)}</strong>
      </div>
    </div>
  `;
}

function renderTable() {
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
        <th>Ranking oficial</th>
        <th>Atleta</th>
        <th>Pontos base</th>
      </tr>
    `
    : `
      <tr>
        <th>Ranking ao vivo</th>
        <th>Atleta</th>
        <th>Ranking oficial</th>
        <th>Pontos ao vivo</th>
        <th>Cenários</th>
        <th>Jogando esta semana</th>
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
                <strong>${player.name}</strong>
                <span>${flagMarkup(player.country)}</span>
              </div>
            </td>
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
              <strong>${player.name}</strong>
              <span>${flagMarkup(player.country)}</span>
            </div>
          </td>
          <td>${player.currentRank || "-"}</td>
          <td>
            <div class="points-cell">
              <strong class="live-points">${formatNumber(player.livePoints)}</strong>
              <span class="pill ${pointsBalance.type}">${pointsBalance.text}</span>
            </div>
          </td>
          <td class="projected-points is-max">${projectionMarkup(player)}</td>
          <td>${weeklyStatusMarkup(player.liveEvent)}</td>
        </tr>
      `;
    })
    .join("");

  if (state.selectedId) renderDetails(state.selectedId);
}

function renderEmptyDetails() {
  els.playerDetails.className = "details-empty";
  els.playerDetails.textContent = "Selecione um atleta para ver os resultados que entram e os que ficam fora do ranking.";
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
              ${item.countedPoints !== undefined && item.countedPoints !== item.points ? `<span>${formatNumber(item.points)} bruto</span>` : ""}
              ${item.isCounting === false ? "<span>não contando</span>" : "<span>contando</span>"}
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
      event: `${player.liveEvent.event || "Torneio atual"} · simples`,
      round: player.liveEvent.singlesRound || "-",
      points: Number(player.liveEvent.singlesPoints || 0),
      countedPoints: Number(player.liveEvent.singlesPoints || 0),
      isCounting: true
    },
    {
      event: `${player.liveEvent.event || "Torneio atual"} · duplas`,
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
      <strong>${player.name}</strong>
      <span>${flagMarkup(player.country)} oficial ${player.currentRank} · live ${formatNumber(player.livePoints)} · máximo ${formatNumber(player.maxPoints)}</span>
      <span>${player.liveEvent.event || "-"} · ${phaseText(player.liveEvent)}</span>
    </div>
    ${resultMarkup(singlesResults, "Simples")}
    ${resultMarkup(doublesResults, "Duplas (25%)")}
    ${defendingResults.length ? resultMarkup(defendingResults, "Pontos defendidos nesta semana", "is-dropping") : ""}
    ${liveResults.length ? resultMarkup(liveResults, "Pontos entrando no torneio atual", "is-new") : ""}
  `;
}

els.rankingBody.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-player-id]");
  if (!row) return;
  state.selectedId = row.dataset.playerId;
  renderTable();
  renderDetails(state.selectedId);
});

[els.searchInput, els.genderFilter, els.sortFilter].forEach((element) => {
  element.addEventListener("input", renderTable);
});

renderTable();
loadAutomatedData();
