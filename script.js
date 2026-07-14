const setupPanel = document.querySelector("#setupPanel");
const gamePanel = document.querySelector("#gamePanel");
const playerName = document.querySelector("#playerName");
const playerCount = document.querySelector("#playerCount");
const createGameButton = document.querySelector("#createGame");
const joinGameButton = document.querySelector("#joinGame");
const startGameButton = document.querySelector("#startGame");
const drawNumberButton = document.querySelector("#drawNumber");
const claimWinnerButton = document.querySelector("#claimWinner");
const soundToggle = document.querySelector("#soundToggle");
const rulesRead = document.querySelector("#rulesRead");
const currentNumber = document.querySelector("#currentNumber");
const callerStatus = document.querySelector("#callerStatus");
const aiLine = document.querySelector("#aiLine");
const playerBadge = document.querySelector("#playerBadge");
const cardTitle = document.querySelector("#cardTitle");
const ticketElement = document.querySelector("#ticket");
const playersList = document.querySelector("#playersList");
const calledNumbers = document.querySelector("#calledNumbers");
const frequentNumbers = document.querySelector("#frequentNumbers");
const leaderboard = document.querySelector("#leaderboard");
const gameHistory = document.querySelector("#gameHistory");
const toast = document.querySelector("#toast");
const winnerModal = document.querySelector("#winnerModal");
const winnerText = document.querySelector("#winnerText");

let playerId = localStorage.getItem("housiePlayerId") || "";
let soundEnabled = localStorage.getItem("housieSound") !== "off";
let audioContext = null;
let lastCurrentNumber = null;
let lastWinnerId = null;
let latestState = null;
let toastTimer = null;

function ensureAudio() {
  if (!soundEnabled) {
    return null;
  }

  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  return audioContext;
}

function tone(frequency, start, duration, type = "sine", gain = 0.06) {
  const context = ensureAudio();

  if (!context) {
    return;
  }

  const oscillator = context.createOscillator();
  const volume = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, context.currentTime + start);
  volume.gain.setValueAtTime(0.0001, context.currentTime + start);
  volume.gain.exponentialRampToValueAtTime(gain, context.currentTime + start + 0.02);
  volume.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + start + duration);
  oscillator.connect(volume);
  volume.connect(context.destination);
  oscillator.start(context.currentTime + start);
  oscillator.stop(context.currentTime + start + duration + 0.03);
}

function sound(name) {
  if (name === "mark") {
    tone(740, 0, 0.08, "triangle", 0.05);
    tone(980, 0.07, 0.12, "sine", 0.04);
  }

  if (name === "winner") {
    [523, 659, 784, 1046].forEach((frequency, index) => tone(frequency, index * 0.11, 0.18, "triangle", 0.07));
    tone(1318, 0.54, 0.28, "sine", 0.05);
  }

  if (name === "drum") {
    [110, 138, 110, 164, 196, 246].forEach((frequency, index) => tone(frequency, index * 0.08, 0.06, "square", 0.045));
  }

  if (name === "meme") {
    tone(220, 0, 0.11, "sawtooth", 0.035);
    tone(174, 0.1, 0.11, "sawtooth", 0.035);
    tone(146, 0.2, 0.18, "square", 0.03);
  }
}

function updateSoundButton() {
  soundToggle.textContent = soundEnabled ? "Sound On" : "Sound Off";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    throw new Error("Server is not running. Start it with: node server.js");
  }

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Something went wrong");
  }

  return payload;
}

function playerNameValue() {
  return playerName.value.trim() || `Player ${Math.floor(Math.random() * 90) + 10}`;
}

function setPlayer(id) {
  playerId = id;
  localStorage.setItem("housiePlayerId", id);
}

function renderPlayers(players, capacity) {
  playersList.innerHTML = "";

  if (!players.length) {
    playersList.innerHTML = `<div class="player-row"><span>No players yet</span><span>0/${capacity}</span></div>`;
    return;
  }

  players.forEach((player) => {
    const row = document.createElement("div");
    row.className = "player-row";
    row.innerHTML = `
      <span>${player.name}</span>
      <div>
        <small>${player.progress?.winPercentage ?? 0}%</small>
        <div class="progress-bar"><span style="width: ${player.progress?.winPercentage ?? 0}%"></span></div>
      </div>
    `;
    playersList.append(row);
  });
}

function renderTicket(ticket, markedNumbers, calledSet, visibleNumber) {
  ticketElement.innerHTML = "";

  ticket.flat().forEach((value) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = value ? "cell number" : "cell blank";
    cell.textContent = value || "";
    cell.disabled = !value;

    if (value) {
      cell.dataset.number = value;

      if (markedNumbers.includes(value)) {
        cell.classList.add("marked");
      }

      if (value === visibleNumber) {
        cell.classList.add("recent");
      }

      if (!calledSet.has(value)) {
        cell.title = "Wait until this number is called";
      }
    }

    ticketElement.append(cell);
  });
}

function renderCalledList(numbers) {
  calledNumbers.innerHTML = "";

  numbers.slice(-24).forEach((number) => {
    const chip = document.createElement("span");
    chip.className = "called-chip";
    chip.textContent = number;
    calledNumbers.append(chip);
  });
}

function renderMiniList(container, items, emptyText, renderer) {
  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = `<div class="mini-row"><span>${emptyText}</span></div>`;
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "mini-row";
    row.innerHTML = renderer(item);
    container.append(row);
  });
}

function renderStats(state) {
  renderMiniList(
    frequentNumbers,
    state.numberFrequency,
    "No calls yet",
    (item) => `<span>${item.number}</span><small>${item.count} time${item.count === 1 ? "" : "s"}</small>`
  );
  renderMiniList(
    leaderboard,
    state.leaderboard,
    "No winners yet",
    (item) => `<span>${item.name}</span><small>${item.wins} win${item.wins === 1 ? "" : "s"}</small>`
  );
  renderMiniList(
    gameHistory,
    state.history,
    "No saved games",
    (item) => `<span>${item.winner.name}</span><small>${item.calledCount} calls</small>`
  );
}

function updateControls(state) {
  const me = state.me;
  const rulesAccepted = rulesRead.checked;
  const isHost = Boolean(me?.isHost);
  const roomFull = state.players.length === state.capacity;
  const showingNumber = Boolean(state.currentNumber);

  setupPanel.hidden = Boolean(me);
  gamePanel.hidden = !me;
  startGameButton.hidden = !isHost || state.started;
  drawNumberButton.hidden = !isHost;
  startGameButton.disabled = !rulesAccepted || !roomFull || state.started;
  drawNumberButton.disabled = !rulesAccepted || !state.started || showingNumber || state.winner;
  claimWinnerButton.disabled = !rulesAccepted || !state.started || state.winner;

  if (!state.started) {
    callerStatus.textContent = roomFull
      ? "Ready for host to start"
      : `Waiting for ${state.capacity - state.players.length} player(s)`;
  } else if (state.winner) {
    callerStatus.textContent = `${state.winner.name} won`;
  } else if (state.remainingNumbers === 0) {
    callerStatus.textContent = "All numbers called";
  } else if (showingNumber) {
    callerStatus.textContent = "Mark it if it is on your card";
  } else {
    callerStatus.textContent = isHost ? "Call the next number" : "Waiting for next number";
  }
}

function renderState(state) {
  latestState = state;
  const visibleNumber = state.currentNumber || null;
  const calledSet = new Set(state.calledNumbers);

  renderPlayers(state.players, state.capacity);
  renderCalledList(state.calledNumbers);
  renderStats(state);
  updateControls(state);
  aiLine.textContent = state.aiLine || "RJ Housie is thinking of a roast.";

  if (visibleNumber !== lastCurrentNumber) {
    currentNumber.classList.remove("pop");
    window.requestAnimationFrame(() => currentNumber.classList.add("pop"));
    if (visibleNumber) {
      sound("meme");
    }
    lastCurrentNumber = visibleNumber;
  }

  currentNumber.textContent = visibleNumber || "--";

  if (state.me) {
    playerBadge.textContent = `${state.me.name}${state.me.isHost ? " - Host" : ""}`;
    cardTitle.textContent = "Your private Housie card";
    renderTicket(state.me.ticket, state.me.markedNumbers, calledSet, visibleNumber);
  }

  if (state.winner) {
    winnerText.textContent = `${state.winner.name} wins Housie!`;
    winnerModal.hidden = false;
    if (state.winner.id !== lastWinnerId) {
      sound("winner");
      lastWinnerId = state.winner.id;
    }
  } else {
    winnerModal.hidden = true;
  }
}

async function refreshState() {
  try {
    const query = playerId ? `?playerId=${encodeURIComponent(playerId)}` : "";
    const state = await request(`/api/state${query}`);

    if (playerId && !state.me) {
      localStorage.removeItem("housiePlayerId");
      playerId = "";
    }

    renderState(state);
  } catch (error) {
    showToast(error.message);
  }
}

async function createGame() {
  try {
    const payload = await request("/api/create-game", {
      method: "POST",
      body: JSON.stringify({
        name: playerNameValue(),
        capacity: Number(playerCount.value),
      }),
    });
    setPlayer(payload.playerId);
    showToast("Game created. Share this website link with the other players.");
    await refreshState();
  } catch (error) {
    showToast(error.message);
  }
}

async function joinGame() {
  try {
    const payload = await request("/api/join", {
      method: "POST",
      body: JSON.stringify({ name: playerNameValue() }),
    });
    setPlayer(payload.playerId);
    showToast("Joined the game.");
    await refreshState();
  } catch (error) {
    showToast(error.message);
  }
}

async function postAction(path, body = {}) {
  try {
    await request(path, {
      method: "POST",
      body: JSON.stringify({ playerId, ...body }),
    });
    await refreshState();
  } catch (error) {
    showToast(error.message);
  }
}

async function callNextNumber() {
  sound("drum");
  drawNumberButton.disabled = true;
  await new Promise((resolve) => setTimeout(resolve, 520));
  await postAction("/api/draw");
}

createGameButton.addEventListener("click", createGame);
joinGameButton.addEventListener("click", joinGame);
startGameButton.addEventListener("click", () => postAction("/api/start"));
drawNumberButton.addEventListener("click", callNextNumber);
claimWinnerButton.addEventListener("click", () => postAction("/api/claim"));
soundToggle.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem("housieSound", soundEnabled ? "on" : "off");
  updateSoundButton();
  if (soundEnabled) {
    sound("mark");
  }
});

rulesRead.addEventListener("change", () => {
  ensureAudio();
  if (latestState) {
    renderState(latestState);
  }
});

ticketElement.addEventListener("click", (event) => {
  const cell = event.target.closest(".number");

  if (!cell) {
    return;
  }

  postAction("/api/mark", { number: Number(cell.dataset.number) });
  sound("mark");
});

updateSoundButton();
refreshState();
setInterval(refreshState, 1000);
