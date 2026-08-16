import { initializeFirebaseServices, appConfig } from "./firebase-config.js";

const SETTINGS = Object.freeze({
  STARTING_CASH: 1_000_000,
  INVESTMENT_STEP: 100_000,
  TOTAL_ROUNDS: 20,
  START_INDEX: 100,
  REASON_MAX_LENGTH: 200,
  STRATEGY_A_INITIAL: 500_000,
  ROOM_PREFIX: "MATH",
  LOCAL_ROOM_PREFIX: "LOCAL"
});

const STORAGE_KEYS = Object.freeze({
  SESSION: "exponentStockLab.session.v1",
  LOCAL_ROOMS: "exponentStockLab.localRooms.v1",
  TEACHER_ROOM: "exponentStockLab.teacherRoom.v1"
});

const ACTIONS = Object.freeze({
  buy: { label: "투자 추가", symbol: "▲" },
  sell: { label: "투자 회수", symbol: "▼" },
  hold: { label: "유지", symbol: "●" }
});

const state = {
  firebase: null,
  onlineMode: false,
  currentScreen: "home",
  teacherRoom: null,
  teacherRooms: [],
  dashboardPlayers: [],
  dashboardUnsubscribe: null,
  currentPlayerId: null,
  selectedComparisonIds: new Set(),
  selectedAction: null,
  game: null,
  pendingResult: null,
  toastTimer: null
};

const $ = (id) => document.getElementById(id);
const els = {};

function cacheElements() {
  [
    "homeBtn", "connectionBadge", "disclaimerBtn", "modeBanner", "toast", "homeScreen", "studentJoinScreen", "teacherScreen", "gameScreen", "resultScreen",
    "studentModeBtn", "teacherModeBtn", "practiceModeBtn", "resumeCard", "resumeTitle", "resumeText", "resumeBtn", "discardResumeBtn",
    "studentJoinForm", "nicknameInput", "roomCodeInput", "createRoomBtn", "teacherRoomLibrary", "teacherRoomCount", "teacherRoomList", "teacherNoRoom", "teacherRoomInfo", "teacherRoomCode", "teacherSeed", "teacherRounds",
    "teacherPlayerCount", "teacherFinishedCount", "teacherJoinLink", "copyRoomCodeBtn", "copyJoinLinkBtn", "dashboardPanel", "refreshDashboardBtn", "compareSelectedBtn",
    "dashboardBody", "dashboardEmpty", "teacherDetailPanel", "teacherDetailTitle", "teacherDetailContent", "closeTeacherDetailBtn", "gameContextLabel", "gameNickname",
    "currentRoundText", "totalRoundsText", "marketIndexText", "lastChangeBadge", "marketChart", "totalAssetsText", "returnRateText", "cashText", "investedText",
    "toggleMathBtn", "mathPanel", "decisionControls", "decisionPrompt", "buyBtn", "sellBtn", "holdBtn", "reasonInput", "reasonCount", "executeDecisionBtn", "roundResultPanel",
    "roundResultTitle", "roundResultChange", "roundCalculation", "roundReflection", "nextRoundBtn", "resultSummaryGrid", "behaviorStats", "marketStats", "strategyTableBody",
    "strategyQuestion", "decisionHistoryBody", "classComparisonPanel", "refreshClassResultsBtn", "classResultsBody", "playAgainBtn", "newPracticeBtn", "resultHomeBtn",
    "teacherAccessDialog", "teacherAccessForm", "teacherAccessKeyInput", "teacherAccessError", "cancelTeacherAccessBtn",
    "infoDialog", "compareDialog", "closeCompareDialogBtn", "compareDialogContent", "lab1Prediction", "lab1Feedback"
  ].forEach((id) => { els[id] = $(id); });
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatWon(value) {
  return `${Math.round(Number(value) || 0).toLocaleString("ko-KR")}원`;
}

function formatPercent(value, digits = 2) {
  const number = Number(value) || 0;
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(digits)}%`;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRoomCode(code) {
  return String(code || "").trim().toUpperCase().replace(/\s+/g, "");
}

function validNickname(nickname) {
  const trimmed = String(nickname || "").trim();
  return trimmed.length >= 2 && trimmed.length <= 20;
}

function uidFallback() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  state.toastTimer = setTimeout(() => els.toast.classList.add("hidden"), 2400);
}

function setScreen(name) {
  document.querySelectorAll(".screen").forEach((screen) => screen.classList.remove("active"));
  const target = document.querySelector(`[data-screen="${name}"]`);
  if (target) target.classList.add("active");
  state.currentScreen = name;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function stopDashboardListener() {
  if (typeof state.dashboardUnsubscribe === "function") state.dashboardUnsubscribe();
  state.dashboardUnsubscribe = null;
}

function goHome() {
  stopDashboardListener();
  setScreen("home");
  renderResumeCard();
}

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function seedFn() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createSeededRandom(seedText) {
  const seedMaker = xmur3(String(seedText));
  return mulberry32(seedMaker());
}

/**
 * 시장 생성 원리
 * - 약 12% 확률로 7~10%대 큰 변동
 * - 나머지는 세 난수의 평균으로 중앙에 더 모이는 -5~+5% 변동
 * - 아주 작은 양(+)의 drift를 주되, 20라운드 전체가 하락하는 경우도 충분히 가능
 */
function generateMarketChanges(seed, rounds = SETTINGS.TOTAL_ROUNDS) {
  const rng = createSeededRandom(seed);
  const changes = [];

  for (let i = 0; i < rounds; i += 1) {
    const shockRoll = rng();
    let pct;

    if (shockRoll < 0.12) {
      const magnitude = 7 + rng() * 3;
      const sign = rng() < 0.52 ? 1 : -1;
      pct = magnitude * sign;
    } else {
      const centered = ((rng() + rng() + rng()) / 3 - 0.5) * 10;
      const smallPositiveDrift = 0.16;
      pct = centered + smallPositiveDrift;
      pct = clamp(pct, -5, 5);
    }

    changes.push(Math.round(pct * 100) / 100);
  }

  return changes;
}

function computeMarketIndices(changes) {
  const values = [SETTINGS.START_INDEX];
  changes.forEach((pct) => {
    const next = values[values.length - 1] * (1 + pct / 100);
    values.push(Math.round(next * 10000) / 10000);
  });
  return values;
}

function createRoomCode(prefix = SETTINGS.ROOM_PREFIX) {
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return `${prefix}-${digits}`;
}

function createMarketSeed() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  let value = "";
  bytes.forEach((number) => {
    for (let i = 0; i < 4; i += 1) {
      value += alphabet[(number >>> (i * 5)) % alphabet.length];
    }
  });
  return `SEED-${value}`;
}

function makePracticeGame({ seed = createMarketSeed(), nickname = "혼자 연습", roomCode = null, marketChanges = null, playerId = null } = {}) {
  const changes = Array.isArray(marketChanges) && marketChanges.length ? marketChanges : generateMarketChanges(seed, SETTINGS.TOTAL_ROUNDS);
  return {
    version: 1,
    mode: roomCode ? "room" : "practice",
    roomCode,
    seed,
    nickname,
    playerId: playerId || uidFallback(),
    totalRounds: changes.length,
    marketChanges: changes,
    marketIndices: computeMarketIndices(changes),
    currentRound: 1,
    cash: SETTINGS.STARTING_CASH,
    investedValue: 0,
    totalAssets: SETTINGS.STARTING_CASH,
    returnRate: 0,
    buyCount: 0,
    sellCount: 0,
    holdCount: 0,
    decisions: [],
    actionMarkers: [],
    finished: false,
    selectedAction: null,
    createdAtClient: new Date().toISOString()
  };
}

function getLocalRooms() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_ROOMS) || "{}") || {};
  } catch {
    return {};
  }
}

function saveLocalRooms(rooms) {
  localStorage.setItem(STORAGE_KEYS.LOCAL_ROOMS, JSON.stringify(rooms));
}

function saveSession() {
  if (!state.game) return;
  localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify({
    savedAt: new Date().toISOString(),
    game: state.game
  }));
}

function getSavedSession() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSION) || "null");
    if (!parsed?.game?.marketChanges?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearSavedSession() {
  localStorage.removeItem(STORAGE_KEYS.SESSION);
}

function renderResumeCard() {
  const saved = getSavedSession();
  if (!saved?.game || saved.game.finished) {
    els.resumeCard.classList.add("hidden");
    return;
  }
  const game = saved.game;
  els.resumeTitle.textContent = `${game.nickname}의 ${game.currentRound}라운드 진행을 이어갈 수 있습니다.`;
  els.resumeText.textContent = game.roomCode ? `방 ${game.roomCode} · 시장 시드 ${game.seed}` : `혼자 연습 · 시장 시드 ${game.seed}`;
  els.resumeCard.classList.remove("hidden");
}

function renderConnectionStatus() {
  if (state.onlineMode) {
    els.connectionBadge.textContent = "Firebase 연결됨";
    els.connectionBadge.className = "badge badge-live";
    els.modeBanner.classList.add("hidden");
  } else {
    els.connectionBadge.textContent = "로컬 연습 모드";
    els.connectionBadge.className = "badge badge-local";
    els.modeBanner.textContent = "현재 로컬 연습 모드입니다. 개인 게임과 시드 기반 시장은 사용할 수 있지만, 여러 기기 결과 공유 기능을 사용하려면 Firebase를 연결하세요.";
    els.modeBanner.classList.remove("hidden");
  }
}

async function initFirebase() {
  try {
    const services = await initializeFirebaseServices();
    if (!services.enabled) {
      state.onlineMode = false;
      state.firebase = null;
    } else {
      state.onlineMode = true;
      state.firebase = services;
    }
  } catch (error) {
    console.warn("Firebase 초기화 실패. 로컬 모드로 전환합니다.", error);
    state.onlineMode = false;
    state.firebase = null;
  }
  renderConnectionStatus();
}

function currentAuthUid() {
  return state.firebase?.auth?.currentUser?.uid || null;
}

async function ensureUniqueRoomCode() {
  if (!state.onlineMode) return createRoomCode(SETTINGS.LOCAL_ROOM_PREFIX);
  const { doc, getDoc } = state.firebase.firestoreApi;
  for (let i = 0; i < 20; i += 1) {
    const code = createRoomCode();
    const snap = await getDoc(doc(state.firebase.db, "rooms", code));
    if (!snap.exists()) return code;
  }
  throw new Error("고유한 방 코드를 만들지 못했습니다. 다시 시도하세요.");
}

async function createTeacherRoom() {
  const roomCode = await ensureUniqueRoomCode();
  const seed = createMarketSeed();
  const marketChanges = generateMarketChanges(seed, SETTINGS.TOTAL_ROUNDS);
  const room = {
    roomCode,
    seed,
    rounds: SETTINGS.TOTAL_ROUNDS,
    marketChanges,
    marketIndices: computeMarketIndices(marketChanges),
    teacherUid: currentAuthUid() || `local-teacher-${uidFallback()}`,
    createdAtClient: new Date().toISOString()
  };

  if (state.onlineMode) {
    const { doc, setDoc, serverTimestamp } = state.firebase.firestoreApi;
    await setDoc(doc(state.firebase.db, "rooms", roomCode), {
      roomCode,
      seed,
      rounds: SETTINGS.TOTAL_ROUNDS,
      marketChanges,
      teacherUid: currentAuthUid(),
      createdAt: serverTimestamp()
    });
  } else {
    const rooms = getLocalRooms();
    rooms[roomCode] = room;
    saveLocalRooms(rooms);
  }

  state.teacherRoom = room;
  state.teacherRooms = [room, ...state.teacherRooms.filter((item) => item.roomCode !== roomCode)];
  localStorage.setItem(STORAGE_KEYS.TEACHER_ROOM, roomCode);
  renderTeacherRoomList();
  renderTeacherRoom();
  await startTeacherDashboard();
  showToast(`수업방 ${roomCode}를 만들었습니다.`);
}

async function loadRoom(roomCode) {
  const code = normalizeRoomCode(roomCode);
  if (!code) throw new Error("방 코드를 입력하세요.");

  if (state.onlineMode) {
    const { doc, getDoc } = state.firebase.firestoreApi;
    const snap = await getDoc(doc(state.firebase.db, "rooms", code));
    if (!snap.exists()) throw new Error("존재하지 않는 방 코드입니다.");
    const data = snap.data();
    return {
      ...data,
      roomCode: code,
      marketIndices: computeMarketIndices(data.marketChanges)
    };
  }

  const localRoom = getLocalRooms()[code];
  if (!localRoom) {
    throw new Error("로컬 모드에서는 이 기기에서 만든 연습 방만 찾을 수 있습니다. 여러 기기 참여는 Firebase 연결이 필요합니다.");
  }
  return localRoom;
}

async function checkDuplicateNickname(roomCode, nickname) {
  if (!state.onlineMode) return false;
  const { collection, query, where, getDocs } = state.firebase.firestoreApi;
  const normalized = nickname.trim().toLocaleLowerCase("ko-KR");
  const q = query(collection(state.firebase.db, "rooms", roomCode, "players"), where("nicknameNormalized", "==", normalized));
  const snaps = await getDocs(q);
  return snaps.docs.some((snap) => snap.id !== currentAuthUid());
}

async function joinStudentRoom(nickname, roomCode) {
  const cleanNickname = nickname.trim();
  if (!validNickname(cleanNickname)) throw new Error("별명은 2~20자로 입력하세요.");
  const room = await loadRoom(roomCode);

  if (await checkDuplicateNickname(room.roomCode, cleanNickname)) {
    throw new Error("같은 방에 이미 사용 중인 별명입니다. 숫자나 글자를 조금 붙여 구분해 주세요.");
  }

  const playerId = currentAuthUid() || uidFallback();
  state.game = makePracticeGame({
    seed: room.seed,
    nickname: cleanNickname,
    roomCode: room.roomCode,
    marketChanges: room.marketChanges,
    playerId
  });
  state.currentPlayerId = playerId;

  await persistPlayerSummary(true);
  saveSession();
  startGameScreen();
}

function startPractice({ seed = null, sameMarket = false } = {}) {
  const chosenSeed = sameMarket && state.game?.seed ? state.game.seed : (seed || createMarketSeed());
  state.game = makePracticeGame({ seed: chosenSeed, nickname: "혼자 연습" });
  state.currentPlayerId = state.game.playerId;
  saveSession();
  startGameScreen();
}

function startGameScreen() {
  state.pendingResult = null;
  state.selectedAction = null;
  els.roundResultPanel.classList.add("hidden");
  els.decisionControls.classList.remove("hidden");
  setScreen("game");
  renderGame();
}

function renderGame() {
  const game = state.game;
  if (!game) return;

  els.decisionControls.classList.toggle("hidden", Boolean(state.pendingResult));
  els.roundResultPanel.classList.toggle("hidden", !state.pendingResult);

  els.gameContextLabel.textContent = game.roomCode ? `수업방 ${game.roomCode} · 시장 ${game.seed}` : `혼자 연습 · 시장 ${game.seed}`;
  els.gameNickname.textContent = game.nickname;
  els.currentRoundText.textContent = game.currentRound;
  els.totalRoundsText.textContent = game.totalRounds;

  const completedRounds = game.decisions.length;
  const currentIndex = game.marketIndices[completedRounds];
  const previousChange = completedRounds > 0 ? game.marketChanges[completedRounds - 1] : null;
  els.marketIndexText.textContent = currentIndex.toFixed(2);
  setChangeBadge(els.lastChangeBadge, previousChange, previousChange === null ? "아직 변동 없음" : `직전 ${formatPercent(previousChange)}`);

  els.totalAssetsText.textContent = formatWon(game.totalAssets);
  els.cashText.textContent = formatWon(game.cash);
  els.investedText.textContent = formatWon(game.investedValue);
  els.returnRateText.textContent = formatPercent(game.returnRate);
  els.returnRateText.className = game.returnRate > 0 ? "positive-text" : game.returnRate < 0 ? "negative-text" : "";

  if (previousChange === null) {
    els.decisionPrompt.textContent = "아직 시장 변화가 없습니다. 첫 투자를 어떻게 할까요?";
  } else {
    els.decisionPrompt.textContent = `직전 시장은 ${formatPercent(previousChange)} 변했습니다. 다음 변화는 아직 알 수 없습니다. 이번에는 어떻게 할까요?`;
  }

  els.buyBtn.disabled = game.cash < SETTINGS.INVESTMENT_STEP || Boolean(state.pendingResult);
  els.sellBtn.disabled = game.investedValue < SETTINGS.INVESTMENT_STEP || Boolean(state.pendingResult);
  els.holdBtn.disabled = Boolean(state.pendingResult);
  els.executeDecisionBtn.disabled = !state.selectedAction || Boolean(state.pendingResult);
  els.reasonInput.disabled = Boolean(state.pendingResult);

  document.querySelectorAll(".action-button").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.action === state.selectedAction);
  });

  renderChart();
  renderMathPanel();
}

function setChangeBadge(element, value, text = null) {
  element.classList.remove("positive", "negative", "neutral");
  if (value === null || value === 0) element.classList.add("neutral");
  else if (value > 0) element.classList.add("positive");
  else element.classList.add("negative");
  element.textContent = text ?? formatPercent(value);
}

function renderChart() {
  const game = state.game;
  const shownCount = game.decisions.length + 1;
  const values = game.marketIndices.slice(0, shownCount);
  const width = 760;
  const height = 330;
  const padding = { left: 48, right: 18, top: 24, bottom: 34 };
  const minValueRaw = Math.min(...values, 95);
  const maxValueRaw = Math.max(...values, 105);
  const spread = Math.max(8, maxValueRaw - minValueRaw);
  const minValue = minValueRaw - spread * 0.12;
  const maxValue = maxValueRaw + spread * 0.12;
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const x = (i) => padding.left + (i / Math.max(game.totalRounds, 1)) * plotW;
  const y = (v) => padding.top + (1 - (v - minValue) / (maxValue - minValue)) * plotH;
  const pts = values.map((v, i) => [x(i), y(v)]);
  const line = pts.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(2)},${py.toFixed(2)}`).join(" ");
  const area = `${line} L${pts.at(-1)[0].toFixed(2)},${(padding.top + plotH).toFixed(2)} L${pts[0][0].toFixed(2)},${(padding.top + plotH).toFixed(2)} Z`;

  const gridLines = [];
  for (let i = 0; i <= 4; i += 1) {
    const gy = padding.top + (i / 4) * plotH;
    const labelValue = maxValue - (i / 4) * (maxValue - minValue);
    gridLines.push(`<line class="chart-grid" x1="${padding.left}" y1="${gy}" x2="${width - padding.right}" y2="${gy}" />`);
    gridLines.push(`<text class="chart-label" x="6" y="${gy + 3}">${labelValue.toFixed(1)}</text>`);
  }
  for (let round = 0; round <= game.totalRounds; round += 5) {
    const gx = x(round);
    gridLines.push(`<line class="chart-grid" x1="${gx}" y1="${padding.top}" x2="${gx}" y2="${padding.top + plotH}" />`);
    gridLines.push(`<text class="chart-label" x="${gx - 5}" y="${height - 10}">${round}</text>`);
  }

  const markers = game.actionMarkers.map((marker) => {
    const px = x(marker.round - 1);
    const py = y(game.marketIndices[marker.round - 1]) - 16;
    const actionClass = `action-marker-${marker.action}`;
    return `<text class="action-marker ${actionClass}" x="${px}" y="${py}">${ACTIONS[marker.action].symbol}</text>`;
  }).join("");

  els.marketChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true" preserveAspectRatio="none">
      ${gridLines.join("")}
      <path class="chart-area" d="${area}" />
      <path class="chart-line" d="${line}" />
      ${pts.map(([px, py]) => `<circle class="chart-point" cx="${px}" cy="${py}" r="3.5" />`).join("")}
      ${markers}
    </svg>`;
}

function renderMathPanel() {
  if (els.mathPanel.classList.contains("hidden")) return;
  const game = state.game;
  const completed = game.decisions.length;
  const factors = game.marketChanges.slice(0, completed).map((pct) => (1 + pct / 100).toFixed(4));
  const product = factors.length ? factors.join(" × ") : "아직 적용된 시장 변화가 없습니다.";
  const completedChanges = game.marketChanges.slice(0, completed);
  const counts = new Map();
  completedChanges.forEach((pct) => counts.set(pct.toFixed(2), (counts.get(pct.toFixed(2)) || 0) + 1));
  const repeated = [...counts.entries()].find(([, count]) => count >= 2);
  const repeatedLine = repeated
    ? (() => {
        const pct = Number(repeated[0]);
        const count = repeated[1];
        const factor = (1 + pct / 100).toFixed(4);
        return `<br><small>같은 변화 ${formatPercent(pct)}가 ${count}번 나타났으므로 그 부분은 <code>${factor}<sup>${count}</sup></code>처럼 거듭제곱으로 나타낼 수 있습니다.</small>`;
      })()
    : "";
  const marketIndex = game.marketIndices[completed];
  els.mathPanel.innerHTML = `
    <strong>시장 지수의 누적 계산</strong><br>
    <code>100${factors.length ? ` × ${product}` : ""} = ${marketIndex.toFixed(2)}</code>${repeatedLine}<br><br>
    <strong>현재 총자산</strong><br>
    <code>현금 ${formatWon(game.cash)} + 투자 평가금액 ${formatWon(game.investedValue)} = ${formatWon(game.totalAssets)}</code><br>
    <small>투자 추가·회수가 있으면 투자금 자체가 중간에 바뀌므로, 내 총자산은 시장지수의 곱만으로 정해지지 않습니다.</small>`;
}

function selectAction(action) {
  if (!ACTIONS[action] || state.pendingResult) return;
  const game = state.game;
  if (action === "buy" && game.cash < SETTINGS.INVESTMENT_STEP) return;
  if (action === "sell" && game.investedValue < SETTINGS.INVESTMENT_STEP) return;
  state.selectedAction = action;
  renderGame();
}

function calculateActionBeforeMarket(game, action) {
  let cash = game.cash;
  let invested = game.investedValue;
  if (action === "buy") {
    cash -= SETTINGS.INVESTMENT_STEP;
    invested += SETTINGS.INVESTMENT_STEP;
  } else if (action === "sell") {
    cash += SETTINGS.INVESTMENT_STEP;
    invested -= SETTINGS.INVESTMENT_STEP;
  }
  return { cash: roundMoney(cash), invested: roundMoney(invested) };
}

async function executeDecision() {
  const game = state.game;
  const action = state.selectedAction;
  if (!game || !action || state.pendingResult) return;

  const round = game.currentRound;
  const reason = els.reasonInput.value.trim() || "이유를 적지 않음";
  if (reason.length > SETTINGS.REASON_MAX_LENGTH) {
    showToast(`판단 이유는 ${SETTINGS.REASON_MAX_LENGTH}자 이내로 입력하세요.`);
    return;
  }

  const previousChange = round > 1 ? game.marketChanges[round - 2] : 0;
  const marketIndexBefore = game.marketIndices[round - 1];
  const nextChange = game.marketChanges[round - 1];
  const before = calculateActionBeforeMarket(game, action);
  const investedAfterMarket = roundMoney(before.invested * (1 + nextChange / 100));
  const totalAfter = roundMoney(before.cash + investedAfterMarket);
  const returnRate = ((totalAfter / SETTINGS.STARTING_CASH) - 1) * 100;

  const decision = {
    round,
    marketIndex: Math.round(marketIndexBefore * 10000) / 10000,
    previousChange,
    action,
    reason: reason.slice(0, SETTINGS.REASON_MAX_LENGTH),
    nextChange,
    cashAfter: before.cash,
    investedBeforeChange: before.invested,
    investedAfter: investedAfterMarket,
    totalAssetsAfter: totalAfter,
    returnRateAfter: Math.round(returnRate * 10000) / 10000
  };

  game.cash = before.cash;
  game.investedValue = investedAfterMarket;
  game.totalAssets = totalAfter;
  game.returnRate = returnRate;
  game.decisions.push(decision);
  game.actionMarkers.push({ round, action });
  if (action === "buy") game.buyCount += 1;
  if (action === "sell") game.sellCount += 1;
  if (action === "hold") game.holdCount += 1;

  state.pendingResult = decision;
  state.selectedAction = null;
  await persistDecision(decision);
  await persistPlayerSummary(false);
  saveSession();
  showRoundResult(decision);
  renderGame();
}

function showRoundResult(decision) {
  els.decisionControls.classList.add("hidden");
  els.roundResultPanel.classList.remove("hidden");
  els.roundResultTitle.textContent = `${decision.round}라운드 시장 변화`;
  setChangeBadge(els.roundResultChange, decision.nextChange);
  const factor = 1 + decision.nextChange / 100;
  els.roundCalculation.innerHTML = `
    투자금 ${formatWon(decision.investedBeforeChange)}<br>
    × ${factor.toFixed(4)} (${formatPercent(decision.nextChange)})<br>
    = ${formatWon(decision.investedAfter)}<br>
    현금 ${formatWon(decision.cashAfter)} + 투자금 ${formatWon(decision.investedAfter)}<br>
    = 총자산 <strong>${formatWon(decision.totalAssetsAfter)}</strong>`;

  if (decision.nextChange > 0) {
    els.roundReflection.textContent = "이번에는 시장이 올랐습니다. 하지만 이 한 번의 결과만으로 선택 자체가 항상 옳았다고 결론 내릴 수는 없습니다.";
  } else if (decision.nextChange < 0) {
    els.roundReflection.textContent = "이번에는 시장이 내렸습니다. 같은 비율의 상승과 하락이 서로 완전히 상쇄되지 않는 이유를 누적 계산에서 확인해 보세요.";
  } else {
    els.roundReflection.textContent = "이번 시장 변화는 0%였습니다. 현금과 투자금의 구성은 그대로 유지됩니다.";
  }

  els.nextRoundBtn.textContent = decision.round >= state.game.totalRounds ? "최종 결과 보기" : "다음 라운드";
  els.reasonInput.value = "";
  els.reasonCount.textContent = "0";
}

async function advanceRound() {
  const game = state.game;
  if (!game || !state.pendingResult) return;
  const completedRound = state.pendingResult.round;
  state.pendingResult = null;
  els.roundResultPanel.classList.add("hidden");
  els.decisionControls.classList.remove("hidden");

  if (completedRound >= game.totalRounds) {
    game.finished = true;
    game.currentRound = game.totalRounds;
    await persistPlayerSummary(false);
    saveSession();
    renderResults();
    setScreen("result");
    return;
  }

  game.currentRound = completedRound + 1;
  await persistPlayerSummary(false);
  saveSession();
  renderGame();
}

async function persistPlayerSummary(isNew) {
  const game = state.game;
  if (!game?.roomCode || !state.onlineMode) return;
  const { doc, setDoc, serverTimestamp } = state.firebase.firestoreApi;
  const ref = doc(state.firebase.db, "rooms", game.roomCode, "players", game.playerId);
  const payload = {
    ownerUid: currentAuthUid(),
    nickname: game.nickname,
    nicknameNormalized: game.nickname.trim().toLocaleLowerCase("ko-KR"),
    currentRound: game.finished ? game.totalRounds : game.currentRound,
    cash: roundMoney(game.cash),
    investedValue: roundMoney(game.investedValue),
    totalAssets: roundMoney(game.totalAssets),
    returnRate: Math.round(game.returnRate * 10000) / 10000,
    buyCount: game.buyCount,
    sellCount: game.sellCount,
    holdCount: game.holdCount,
    decisionCount: game.decisions.length,
    finished: Boolean(game.finished),
    updatedAt: serverTimestamp()
  };
  if (isNew) payload.startedAt = serverTimestamp();
  await setDoc(ref, payload, { merge: true });
}

async function persistDecision(decision) {
  const game = state.game;
  if (!game?.roomCode || !state.onlineMode) return;
  const { doc, setDoc, serverTimestamp } = state.firebase.firestoreApi;
  const decisionId = `r${String(decision.round).padStart(2, "0")}`;
  const ref = doc(state.firebase.db, "rooms", game.roomCode, "players", game.playerId, "decisions", decisionId);
  await setDoc(ref, {
    ownerUid: currentAuthUid(),
    round: decision.round,
    marketIndex: decision.marketIndex,
    previousChange: decision.previousChange,
    action: decision.action,
    reason: decision.reason,
    nextChange: decision.nextChange,
    cashAfter: decision.cashAfter,
    investedBeforeChange: decision.investedBeforeChange,
    investedAfter: decision.investedAfter,
    totalAssetsAfter: decision.totalAssetsAfter,
    returnRateAfter: decision.returnRateAfter,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

function computeStrategyResults(game) {
  const changes = game.marketChanges;

  function simulate(actionProvider) {
    let cash = SETTINGS.STARTING_CASH;
    let invested = 0;
    changes.forEach((change, index) => {
      const action = actionProvider({ index, cash, invested });
      if (action === "buy" && cash >= SETTINGS.INVESTMENT_STEP) {
        cash -= SETTINGS.INVESTMENT_STEP;
        invested += SETTINGS.INVESTMENT_STEP;
      } else if (action === "sell" && invested >= SETTINGS.INVESTMENT_STEP) {
        cash += SETTINGS.INVESTMENT_STEP;
        invested -= SETTINGS.INVESTMENT_STEP;
      }
      invested *= 1 + change / 100;
    });
    const total = cash + invested;
    return { total, returnRate: (total / SETTINGS.STARTING_CASH - 1) * 100 };
  }

  let aCash = SETTINGS.STARTING_CASH - SETTINGS.STRATEGY_A_INITIAL;
  let aInvested = SETTINGS.STRATEGY_A_INITIAL;
  changes.forEach((change) => { aInvested *= 1 + change / 100; });
  const aTotal = aCash + aInvested;

  const strategyA = { name: "전략 A", description: "처음 50만 원 투자 후 끝까지 유지", total: aTotal, returnRate: (aTotal / SETTINGS.STARTING_CASH - 1) * 100 };
  const strategyBBase = simulate(({ cash }) => cash >= SETTINGS.INVESTMENT_STEP ? "buy" : "hold");
  const strategyB = { name: "전략 B", description: "매 라운드 10만 원씩 투자", ...strategyBBase };
  const strategyC = { name: "전략 C", description: "현금 100만 원으로만 유지", total: SETTINGS.STARTING_CASH, returnRate: 0 };
  const strategyD = { name: "전략 D", description: "학생의 실제 선택", total: game.totalAssets, returnRate: game.returnRate };
  return [strategyA, strategyB, strategyC, strategyD];
}

function renderResults() {
  const game = state.game;
  if (!game) return;

  const profit = game.totalAssets - SETTINGS.STARTING_CASH;
  const summary = [
    ["시작 자산", formatWon(SETTINGS.STARTING_CASH)],
    ["최종 총자산", formatWon(game.totalAssets)],
    ["현금", formatWon(game.cash)],
    ["투자 평가금액", formatWon(game.investedValue)],
    ["총손익", `${profit >= 0 ? "+" : ""}${formatWon(profit)}`],
    ["수익률", formatPercent(game.returnRate)]
  ];
  els.resultSummaryGrid.innerHTML = summary.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");

  els.behaviorStats.innerHTML = `
    <div><strong>${game.buyCount}</strong><span>투자 추가</span></div>
    <div><strong>${game.sellCount}</strong><span>투자 회수</span></div>
    <div><strong>${game.holdCount}</strong><span>유지</span></div>`;

  const up = game.marketChanges.filter((v) => v > 0).length;
  const down = game.marketChanges.filter((v) => v < 0).length;
  const maxUp = Math.max(...game.marketChanges);
  const maxDown = Math.min(...game.marketChanges);
  const finalIndex = game.marketIndices.at(-1);
  els.marketStats.innerHTML = `
    <div><span>상승 라운드</span><strong>${up}회</strong></div>
    <div><span>하락 라운드</span><strong>${down}회</strong></div>
    <div><span>가장 큰 상승</span><strong>${formatPercent(maxUp)}</strong></div>
    <div><span>가장 큰 하락</span><strong>${formatPercent(maxDown)}</strong></div>
    <div><span>최종 시장 지수</span><strong>${finalIndex.toFixed(2)}</strong></div>`;

  const strategies = computeStrategyResults(game);
  els.strategyTableBody.innerHTML = strategies.map((s) => `
    <tr><td><strong>${s.name}</strong></td><td>${s.description}</td><td>${formatWon(s.total)}</td><td class="${s.returnRate > 0 ? "positive-text" : s.returnRate < 0 ? "negative-text" : ""}">${formatPercent(s.returnRate)}</td></tr>`).join("");
  const highest = [...strategies].sort((a, b) => b.total - a.total)[0];
  els.strategyQuestion.textContent = `이번 시장에서는 ${highest.name}의 결과가 가장 높았습니다. 왜 그랬는지 시장 그래프와 투자 시점을 함께 설명해 볼까요?`;

  els.decisionHistoryBody.innerHTML = game.decisions.map((d) => `
    <tr>
      <td>${d.round}</td>
      <td>${d.marketIndex.toFixed(2)}</td>
      <td>${d.round === 1 ? "-" : formatPercent(d.previousChange)}</td>
      <td>${ACTIONS[d.action].symbol} ${ACTIONS[d.action].label}</td>
      <td>${escapeHtml(d.reason)}</td>
      <td class="${d.nextChange > 0 ? "positive-text" : d.nextChange < 0 ? "negative-text" : ""}">${formatPercent(d.nextChange)}</td>
      <td>${formatWon(d.totalAssetsAfter)}</td>
    </tr>`).join("");

  if (game.roomCode) {
    els.classComparisonPanel.classList.remove("hidden");
    loadClassResults();
  } else {
    els.classComparisonPanel.classList.add("hidden");
  }
}

async function loadClassResults() {
  const game = state.game;
  if (!game?.roomCode) return;
  if (!state.onlineMode) {
    els.classResultsBody.innerHTML = `<tr><td colspan="6">로컬 모드에서는 다른 기기의 결과를 불러올 수 없습니다.</td></tr>`;
    return;
  }
  try {
    const { collection, getDocs } = state.firebase.firestoreApi;
    const snaps = await getDocs(collection(state.firebase.db, "rooms", game.roomCode, "players"));
    const players = snaps.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
    els.classResultsBody.innerHTML = players
      .sort((a, b) => (b.totalAssets || 0) - (a.totalAssets || 0))
      .map((p) => `<tr><td>${escapeHtml(p.nickname)}</td><td>${formatWon(p.totalAssets)}</td><td>${formatPercent(p.returnRate)}</td><td>${p.buyCount || 0}</td><td>${p.sellCount || 0}</td><td>${p.holdCount || 0}</td></tr>`).join("") || `<tr><td colspan="6">아직 결과가 없습니다.</td></tr>`;
  } catch (error) {
    console.error(error);
    els.classResultsBody.innerHTML = `<tr><td colspan="6">결과를 불러오지 못했습니다.</td></tr>`;
  }
}

function roomCreatedAtMs(room) {
  if (room?.createdAt?.toMillis) return room.createdAt.toMillis();
  const clientTime = Date.parse(room?.createdAtClient || "");
  return Number.isFinite(clientTime) ? clientTime : 0;
}

async function loadTeacherRooms() {
  if (state.onlineMode) {
    const { collection, query, where, getDocs } = state.firebase.firestoreApi;
    const uid = currentAuthUid();
    if (!uid) {
      state.teacherRooms = [];
      return;
    }
    const roomsQuery = query(collection(state.firebase.db, "rooms"), where("teacherUid", "==", uid));
    const snaps = await getDocs(roomsQuery);
    state.teacherRooms = snaps.docs.map((roomSnap) => {
      const data = roomSnap.data();
      return {
        ...data,
        roomCode: roomSnap.id,
        marketIndices: computeMarketIndices(data.marketChanges)
      };
    }).sort((a, b) => roomCreatedAtMs(b) - roomCreatedAtMs(a));
    return;
  }

  state.teacherRooms = Object.values(getLocalRooms())
    .filter((room) => room?.roomCode)
    .sort((a, b) => roomCreatedAtMs(b) - roomCreatedAtMs(a));
}

function renderTeacherRoomList() {
  const rooms = state.teacherRooms || [];
  els.teacherRoomCount.textContent = String(rooms.length);
  els.teacherRoomLibrary.classList.toggle("hidden", rooms.length === 0);
  els.teacherRoomList.innerHTML = rooms.map((room) => `
    <button class="teacher-room-item ${state.teacherRoom?.roomCode === room.roomCode ? "active" : ""}" type="button" data-teacher-room="${escapeHtml(room.roomCode)}">
      <strong>${escapeHtml(room.roomCode)}</strong>
      <small>시장 ${escapeHtml(room.seed || "-")}</small>
      <small>${room.rounds || SETTINGS.TOTAL_ROUNDS}라운드</small>
    </button>`).join("");

  document.querySelectorAll("[data-teacher-room]").forEach((button) => {
    button.addEventListener("click", () => selectTeacherRoom(button.dataset.teacherRoom).catch((error) => {
      console.error(error);
      showToast("수업방을 여는 중 오류가 발생했습니다.");
    }));
  });
}

function renderTeacherRoom() {
  renderTeacherRoomList();

  if (!state.teacherRoom) {
    els.teacherNoRoom.classList.remove("hidden");
    els.teacherRoomInfo.classList.add("hidden");
    els.dashboardPanel.classList.add("hidden");
    return;
  }

  els.teacherNoRoom.classList.add("hidden");
  els.teacherRoomInfo.classList.remove("hidden");
  els.dashboardPanel.classList.remove("hidden");
  els.teacherRoomCode.textContent = state.teacherRoom.roomCode;
  els.teacherSeed.textContent = state.teacherRoom.seed;
  els.teacherRounds.textContent = state.teacherRoom.rounds;
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", state.teacherRoom.roomCode);
  els.teacherJoinLink.value = url.toString();
}

async function restoreTeacherRoom() {
  await loadTeacherRooms();
  const savedCode = localStorage.getItem(STORAGE_KEYS.TEACHER_ROOM);
  const savedRoom = state.teacherRooms.find((room) => room.roomCode === savedCode);
  state.teacherRoom = savedRoom || state.teacherRooms[0] || null;

  if (state.teacherRoom) {
    localStorage.setItem(STORAGE_KEYS.TEACHER_ROOM, state.teacherRoom.roomCode);
  } else {
    localStorage.removeItem(STORAGE_KEYS.TEACHER_ROOM);
  }
}

async function selectTeacherRoom(roomCode) {
  const code = normalizeRoomCode(roomCode);
  if (!code) return;
  let room = state.teacherRooms.find((item) => item.roomCode === code);
  if (!room) room = await loadRoom(code);

  if (state.onlineMode && room.teacherUid !== currentAuthUid()) {
    throw new Error("이 계정이 만든 수업방만 교사 대시보드에서 열 수 있습니다.");
  }

  stopDashboardListener();
  state.teacherRoom = room;
  localStorage.setItem(STORAGE_KEYS.TEACHER_ROOM, room.roomCode);
  els.teacherDetailPanel.classList.add("hidden");
  renderTeacherRoom();
  await startTeacherDashboard();
}

async function openTeacherMode() {
  setScreen("teacher");
  await restoreTeacherRoom();
  renderTeacherRoom();
  if (state.teacherRoom) await startTeacherDashboard();
}

function requestTeacherAccess() {
  els.teacherAccessKeyInput.value = "";
  els.teacherAccessError.classList.add("hidden");
  els.teacherAccessDialog.showModal();
  requestAnimationFrame(() => els.teacherAccessKeyInput.focus());
}

function verifyTeacherAccess(event) {
  event.preventDefault();
  if (els.teacherAccessKeyInput.value === appConfig.teacherAccessKey) {
    els.teacherAccessError.classList.add("hidden");
    els.teacherAccessDialog.close();
    openTeacherMode().catch((error) => {
      console.error(error);
      showToast("교사 화면을 여는 중 오류가 발생했습니다.");
    });
    return;
  }

  els.teacherAccessError.classList.remove("hidden");
  els.teacherAccessKeyInput.select();
}

async function startTeacherDashboard() {
  if (!state.teacherRoom) return;
  stopDashboardListener();
  state.selectedComparisonIds.clear();
  updateCompareButton();

  if (!state.onlineMode) {
    state.dashboardPlayers = [];
    renderDashboard();
    return;
  }

  const { collection, onSnapshot } = state.firebase.firestoreApi;
  const ref = collection(state.firebase.db, "rooms", state.teacherRoom.roomCode, "players");
  state.dashboardUnsubscribe = onSnapshot(ref, (snapshot) => {
    state.dashboardPlayers = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    renderDashboard();
  }, (error) => {
    console.error(error);
    showToast("실시간 학생 목록을 불러오지 못했습니다.");
  });
}

async function refreshDashboardOnce() {
  if (!state.teacherRoom) return;
  if (!state.onlineMode) {
    renderDashboard();
    return;
  }
  const { collection, getDocs } = state.firebase.firestoreApi;
  const snaps = await getDocs(collection(state.firebase.db, "rooms", state.teacherRoom.roomCode, "players"));
  state.dashboardPlayers = snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderDashboard();
  showToast("학생 현황을 새로고침했습니다.");
}

function renderDashboard() {
  const players = [...state.dashboardPlayers].sort((a, b) => {
    if (Boolean(a.finished) !== Boolean(b.finished)) return Number(b.finished) - Number(a.finished);
    return (b.currentRound || 0) - (a.currentRound || 0);
  });
  els.teacherPlayerCount.textContent = `${players.length}명`;
  els.teacherFinishedCount.textContent = `${players.filter((p) => p.finished).length}명`;
  els.dashboardEmpty.classList.toggle("hidden", players.length > 0);
  els.dashboardBody.innerHTML = players.map((p) => `
    <tr>
      <td><input class="compare-check" type="checkbox" data-player-id="${p.id}" ${state.selectedComparisonIds.has(p.id) ? "checked" : ""} aria-label="${escapeHtml(p.nickname)} 비교 선택"></td>
      <td class="dashboard-name">${escapeHtml(p.nickname)}</td>
      <td>${p.currentRound || 0}/${state.teacherRoom?.rounds || SETTINGS.TOTAL_ROUNDS}</td>
      <td>${formatWon(p.totalAssets)}</td>
      <td class="${p.returnRate > 0 ? "positive-text" : p.returnRate < 0 ? "negative-text" : ""}">${formatPercent(p.returnRate)}</td>
      <td>${p.buyCount || 0}</td><td>${p.sellCount || 0}</td><td>${p.holdCount || 0}</td>
      <td>${p.finished ? "완료" : "진행 중"}</td>
      <td><button class="detail-button" type="button" data-detail-id="${p.id}">보기</button></td>
    </tr>`).join("");

  document.querySelectorAll(".compare-check").forEach((checkbox) => checkbox.addEventListener("change", handleCompareCheck));
  document.querySelectorAll("[data-detail-id]").forEach((button) => button.addEventListener("click", () => showPlayerDetail(button.dataset.detailId)));
}

function handleCompareCheck(event) {
  const id = event.target.dataset.playerId;
  if (event.target.checked) {
    if (state.selectedComparisonIds.size >= 2) {
      event.target.checked = false;
      showToast("학생 비교는 2명까지 선택할 수 있습니다.");
      return;
    }
    state.selectedComparisonIds.add(id);
  } else {
    state.selectedComparisonIds.delete(id);
  }
  updateCompareButton();
}

function updateCompareButton() {
  els.compareSelectedBtn.disabled = state.selectedComparisonIds.size !== 2;
  els.compareSelectedBtn.textContent = state.selectedComparisonIds.size === 2 ? "선택한 2명 비교" : `2명 비교 (${state.selectedComparisonIds.size}/2)`;
}

async function fetchPlayerDecisions(roomCode, playerId) {
  if (!state.onlineMode) return [];
  const { collection, getDocs } = state.firebase.firestoreApi;
  const snaps = await getDocs(collection(state.firebase.db, "rooms", roomCode, "players", playerId, "decisions"));
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.round - b.round);
}

async function showPlayerDetail(playerId) {
  const player = state.dashboardPlayers.find((p) => p.id === playerId);
  if (!player) return;
  const decisions = await fetchPlayerDecisions(state.teacherRoom.roomCode, playerId);
  els.teacherDetailTitle.textContent = `${player.nickname}의 판단 기록`;
  els.teacherDetailContent.innerHTML = `
    <div class="table-wrap wide-table">
      <table>
        <thead><tr><th>라운드</th><th>시장상황</th><th>행동</th><th>판단 이유</th><th>다음 변동</th><th>결과</th></tr></thead>
        <tbody>${decisions.map((d) => `<tr><td>${d.round}</td><td>지수 ${Number(d.marketIndex).toFixed(2)}<br>${d.round === 1 ? "첫 라운드" : `직전 ${formatPercent(d.previousChange)}`}</td><td>${ACTIONS[d.action]?.symbol || ""} ${ACTIONS[d.action]?.label || d.action}</td><td>${escapeHtml(d.reason)}</td><td>${formatPercent(d.nextChange)}</td><td>${formatWon(d.totalAssetsAfter)}</td></tr>`).join("") || `<tr><td colspan="6">아직 판단 기록이 없습니다.</td></tr>`}</tbody>
      </table>
    </div>`;
  els.teacherDetailPanel.classList.remove("hidden");
  els.teacherDetailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function compareSelectedPlayers() {
  const ids = [...state.selectedComparisonIds];
  if (ids.length !== 2) return;
  const [a, b] = ids.map((id) => state.dashboardPlayers.find((p) => p.id === id));
  const [aDecisions, bDecisions] = await Promise.all(ids.map((id) => fetchPlayerDecisions(state.teacherRoom.roomCode, id)));
  const maxRounds = Math.max(aDecisions.length, bDecisions.length);

  const renderColumn = (player, decisions) => `
    <section class="compare-card">
      <header>${escapeHtml(player.nickname)} · ${formatWon(player.totalAssets)} · ${formatPercent(player.returnRate)}</header>
      <div class="compare-body">
        ${Array.from({ length: maxRounds }, (_, i) => {
          const d = decisions.find((item) => item.round === i + 1);
          if (!d) return `<div class="compare-round"><strong>${i + 1}라운드</strong><p>아직 기록 없음</p></div>`;
          return `<div class="compare-round"><strong>${i + 1}라운드 · ${ACTIONS[d.action]?.symbol} ${ACTIONS[d.action]?.label} → 다음 ${formatPercent(d.nextChange)}</strong><p>${escapeHtml(d.reason)}</p><p>이후 총자산 ${formatWon(d.totalAssetsAfter)}</p></div>`;
        }).join("")}
      </div>
    </section>`;

  els.compareDialogContent.innerHTML = `<p class="muted">누가 ‘맞혔는지’보다 같은 정보에서 어떤 근거로 다른 행동을 선택했는지 비교해 보세요.</p><div class="compare-grid">${renderColumn(a, aDecisions)}${renderColumn(b, bDecisions)}</div>`;
  els.compareDialog.showModal();
}

function renderLocalTeacherNotice() {
  if (!state.onlineMode) {
    els.dashboardBody.innerHTML = "";
    els.dashboardEmpty.classList.remove("hidden");
    els.dashboardEmpty.textContent = "로컬 모드에서는 다른 기기의 학생 현황을 볼 수 없습니다. Firebase를 연결하면 이 표가 실시간으로 갱신됩니다.";
  }
}

function resetSameMarket() {
  const old = state.game;
  if (!old) return;

  // 수업방의 공식 기록을 다시 플레이하면서 덮어쓰지 않도록,
  // 결과 화면의 "같은 시장 다시 해보기"는 개인 재실험으로 전환합니다.
  state.game = makePracticeGame({
    seed: old.seed,
    nickname: old.roomCode ? `${old.nickname} 재실험` : old.nickname,
    marketChanges: old.marketChanges
  });

  state.pendingResult = null;
  state.selectedAction = null;
  saveSession();
  startGameScreen();
}

function bindEvents() {
  els.homeBtn.addEventListener("click", goHome);
  els.disclaimerBtn.addEventListener("click", () => els.infoDialog.showModal());
  els.studentModeBtn.addEventListener("click", () => setScreen("student-join"));
  els.teacherModeBtn.addEventListener("click", requestTeacherAccess);
  els.teacherAccessForm.addEventListener("submit", verifyTeacherAccess);
  els.cancelTeacherAccessBtn.addEventListener("click", () => els.teacherAccessDialog.close());
  els.practiceModeBtn.addEventListener("click", () => startPractice());
  els.createRoomBtn.addEventListener("click", async () => {
    try { await createTeacherRoom(); } catch (error) { console.error(error); showToast(error.message || "방 생성에 실패했습니다."); }
  });

  els.studentJoinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await joinStudentRoom(els.nicknameInput.value, els.roomCodeInput.value);
    } catch (error) {
      console.error(error);
      showToast(error.message || "수업방 참여에 실패했습니다.");
    }
  });

  [els.buyBtn, els.sellBtn, els.holdBtn].forEach((button) => button.addEventListener("click", () => selectAction(button.dataset.action)));
  els.reasonInput.addEventListener("input", () => { els.reasonCount.textContent = els.reasonInput.value.length; });
  els.executeDecisionBtn.addEventListener("click", () => executeDecision().catch((error) => { console.error(error); showToast("결과 저장 중 오류가 발생했습니다. 로컬 진행은 유지됩니다."); }));
  els.nextRoundBtn.addEventListener("click", () => advanceRound().catch((error) => { console.error(error); showToast("다음 라운드로 이동하는 중 오류가 발생했습니다."); }));
  els.toggleMathBtn.addEventListener("click", () => {
    els.mathPanel.classList.toggle("hidden");
    els.toggleMathBtn.textContent = els.mathPanel.classList.contains("hidden") ? "수학으로 보기" : "수학 설명 닫기";
    renderMathPanel();
  });

  els.copyRoomCodeBtn.addEventListener("click", () => copyText(state.teacherRoom?.roomCode || "", "방 코드를 복사했습니다."));
  els.copyJoinLinkBtn.addEventListener("click", () => copyText(els.teacherJoinLink.value, "참여 링크를 복사했습니다."));
  els.refreshDashboardBtn.addEventListener("click", () => refreshDashboardOnce().catch(console.error));
  els.compareSelectedBtn.addEventListener("click", () => compareSelectedPlayers().catch(console.error));
  els.closeTeacherDetailBtn.addEventListener("click", () => els.teacherDetailPanel.classList.add("hidden"));
  els.closeCompareDialogBtn.addEventListener("click", () => els.compareDialog.close());
  els.refreshClassResultsBtn.addEventListener("click", loadClassResults);

  els.resumeBtn.addEventListener("click", () => {
    const saved = getSavedSession();
    if (!saved?.game) return;
    state.game = saved.game;
    state.currentPlayerId = state.game.playerId;
    state.pendingResult = null;
    state.selectedAction = null;
    if (state.game.finished) { renderResults(); setScreen("result"); }
    else startGameScreen();
  });
  els.discardResumeBtn.addEventListener("click", () => { clearSavedSession(); renderResumeCard(); });

  els.playAgainBtn.addEventListener("click", resetSameMarket);
  els.newPracticeBtn.addEventListener("click", () => startPractice());
  els.resultHomeBtn.addEventListener("click", goHome);

  document.querySelectorAll(".lab-reveal").forEach((button) => button.addEventListener("click", () => {
    const answer = document.querySelector(`[data-lab-answer="${button.dataset.lab}"]`);
    const opening = answer.classList.contains("hidden");
    answer.classList.toggle("hidden");
    button.textContent = answer.classList.contains("hidden") ? "계산 보기" : "계산 숨기기";

    if (button.dataset.lab === "1" && opening) {
      const predicted = Number(els.lab1Prediction.value);
      if (Number.isFinite(predicted) && els.lab1Prediction.value.trim() !== "") {
        const difference = Math.round(predicted - 990000);
        els.lab1Feedback.textContent = difference === 0
          ? "예상과 실제 계산이 같습니다. 이제 왜 100만 원으로 돌아오지 않는지 곱셈으로 설명해 보세요."
          : `예상값과 실제값의 차이는 ${formatWon(Math.abs(difference))}입니다. 변화율의 합(0%)과 변화 배율의 곱(0.99)을 비교해 보세요.`;
        els.lab1Feedback.classList.remove("hidden");
      }
    }
  }));
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(message);
  } catch {
    const temp = document.createElement("textarea");
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    temp.remove();
    showToast(message);
  }
}

function prefillRoomFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const room = normalizeRoomCode(params.get("room"));
  if (room) {
    els.roomCodeInput.value = room;
    setScreen("student-join");
  }
}

async function bootstrap() {
  cacheElements();
  bindEvents();
  await initFirebase();
  renderResumeCard();
  prefillRoomFromUrl();
  if (!state.onlineMode) renderLocalTeacherNotice();
}

bootstrap();
