const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = Number(process.env.PORT) || 4173;
const PUBLIC_DIR = __dirname;
const HISTORY_FILE = process.env.HISTORY_FILE || path.join(__dirname, "game-history.json");
const DISPLAY_MS = 2600;

const columnRanges = [
  [1, 9],
  [10, 19],
  [20, 29],
  [30, 39],
  [40, 49],
  [50, 59],
  [60, 69],
  [70, 79],
  [80, 90],
];

let history = loadHistory();
let game = createEmptyGame();

function createEmptyGame(capacity = 2) {
  return {
    id: randomId(),
    capacity,
    players: [],
    started: false,
    calledNumbers: [],
    remainingNumbers: makeRange(1, 90),
    currentNumber: null,
    currentUntil: 0,
    winner: null,
    aiLine: "RJ Housie is warming up the mic.",
    createdAt: new Date().toISOString(),
  };
}

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  } catch {
    return { matches: [] };
  }
}

function saveHistory() {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(items) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function pickMany(items, amount) {
  return shuffle(items).slice(0, amount);
}

function makeRange(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function makeTicketPattern() {
  const rows = Array.from({ length: 3 }, () => new Set());
  const columnCounts = Array(9).fill(0);

  for (let row = 0; row < 3; row += 1) {
    pickMany([0, 1, 2, 3, 4, 5, 6, 7, 8], 5).forEach((column) => {
      rows[row].add(column);
      columnCounts[column] += 1;
    });
  }

  [0, 8].forEach((requiredColumn) => {
    if (columnCounts[requiredColumn] > 0) {
      return;
    }

    const targetRow = randomInt(0, 2);
    const removableColumns = [...rows[targetRow]].filter(
      (column) => columnCounts[column] > 1 && column !== requiredColumn
    );
    const columnToRemove = removableColumns[0] ?? [...rows[targetRow]][0];

    rows[targetRow].delete(columnToRemove);
    columnCounts[columnToRemove] -= 1;
    rows[targetRow].add(requiredColumn);
    columnCounts[requiredColumn] += 1;
  });

  return rows;
}

function createTicket() {
  const pattern = makeTicketPattern();
  const ticket = Array.from({ length: 3 }, () => Array(9).fill(null));

  columnRanges.forEach(([start, end], column) => {
    const rowsForColumn = pattern
      .map((rowSet, row) => (rowSet.has(column) ? row : null))
      .filter((row) => row !== null);

    const values = pickMany(makeRange(start, end), rowsForColumn.length).sort((a, b) => a - b);

    rowsForColumn.forEach((row, valueIndex) => {
      ticket[row][column] = values[valueIndex];
    });
  });

  return ticket;
}

function ticketNumbers(ticket) {
  return ticket.flat().filter(Boolean);
}

function cleanName(name, fallback) {
  const value = String(name || "").trim().slice(0, 18);
  return value || fallback;
}

function hostLine(type, data = {}) {
  const playerName = data.playerName || "player";
  const number = data.number || "--";
  const lines = {
    waiting: [
      "Mic check, snacks check, luck still buffering.",
      "Everyone settle in. The numbers are stretching backstage.",
      "RJ Housie reporting live. No pressure, only mild chaos.",
    ],
    start: [
      "Cards are locked. Eyes sharp, fingers ready.",
      "Game on. May your ticket behave better than your Wi-Fi.",
      "And we are live. Full house dreams begin now.",
    ],
    draw: [
      `Number ${number}! If you needed 90, better luck macha.`,
      `${number} on the board. Somebody just smiled suspiciously.`,
      `Calling ${number}. Fast hands, honest hearts.`,
      `${number}! Mark it if destiny finally remembered you.`,
      `Number ${number}. The ticket is either singing or silently judging you.`,
    ],
    mark: [
      `${playerName} marked one. Confidence level: rising.`,
      `${playerName} got a hit. Small victory, big drama.`,
      `${playerName} tapped it like a pro.`,
    ],
    claimFail: [
      `${playerName}, nice try. The server said sit down politely.`,
      `Claim rejected for ${playerName}. Audacity was strong though.`,
      `${playerName} tried a shortcut. Verification caught it.`,
    ],
    winner: [
      `${playerName} wins! Somebody cue the celebration.`,
      `Full house! ${playerName} just cooked everyone.`,
      `${playerName} wins. The ticket has spoken.`,
    ],
  };
  const group = lines[type] || lines.waiting;
  return group[randomInt(0, group.length - 1)];
}

function numberFrequency() {
  const counts = new Map();

  history.matches.forEach((match) => {
    match.calledNumbers.forEach((number) => {
      counts.set(number, (counts.get(number) || 0) + 1);
    });
  });

  game.calledNumbers.forEach((number) => {
    counts.set(number, (counts.get(number) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 10)
    .map(([number, count]) => ({ number, count }));
}

function leaderboard() {
  const wins = new Map();

  history.matches.forEach((match) => {
    if (match.winner?.name) {
      wins.set(match.winner.name, (wins.get(match.winner.name) || 0) + 1);
    }
  });

  return [...wins.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([name, winsCount]) => ({ name, wins: winsCount }));
}

function playerProgress(player) {
  const numbers = ticketNumbers(player.ticket);
  const calledOnTicket = numbers.filter((number) => game.calledNumbers.includes(number)).length;
  const marked = numbers.filter((number) => player.markedNumbers.has(number)).length;

  return {
    calledOnTicket,
    marked,
    winPercentage: Math.round((marked / numbers.length) * 100),
  };
}

function ticketToSvg(player) {
  const width = 720;
  const height = 260;
  const cellWidth = 72;
  const cellHeight = 54;
  const startX = 36;
  const startY = 64;
  const cells = player.ticket
    .flatMap((row, rowIndex) =>
      row.map((value, columnIndex) => {
        const x = startX + columnIndex * cellWidth;
        const y = startY + rowIndex * cellHeight;
        const marked = value && player.markedNumbers.has(value);
        return `
          <rect x="${x}" y="${y}" width="66" height="48" rx="8" fill="${marked ? "#5E6B5C" : value ? "#F8F5F2" : "#D9CAB3"}" stroke="#2F2F2F" stroke-opacity="0.18"/>
          ${
            value
              ? `<text x="${x + 33}" y="${y + 31}" text-anchor="middle" font-family="Nunito, Arial" font-size="22" font-weight="800" fill="${marked ? "#F8F5F2" : "#2F2F2F"}">${value}</text>`
              : ""
          }
        `;
      })
    )
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" rx="18" fill="#F8F5F2"/>
      <text x="36" y="40" font-family="Nunito, Arial" font-size="24" font-weight="900" fill="#2F2F2F">${player.name}</text>
      ${cells}
    </svg>
  `.trim();
}

function saveMatch(winner) {
  const replay = {
    id: game.id,
    createdAt: game.createdAt,
    finishedAt: new Date().toISOString(),
    winner: { id: winner.id, name: winner.name },
    calledNumbers: [...game.calledNumbers],
    players: game.players.map((player) => ({
      id: player.id,
      name: player.name,
      ticketSnapshot: player.ticket,
      ticketScreenshotSvg: ticketToSvg(player),
      markedNumbers: [...player.markedNumbers],
      progress: playerProgress(player),
    })),
  };

  history.matches.unshift(replay);
  history.matches = history.matches.slice(0, 25);
  saveHistory();
}

function activeCurrentNumber() {
  if (game.currentNumber && Date.now() >= game.currentUntil) {
    game.currentNumber = null;
    game.currentUntil = 0;
  }

  return game.currentNumber;
}

function publicState(playerId) {
  const me = game.players.find((player) => player.id === playerId);

  return {
    capacity: game.capacity,
    started: game.started,
    currentNumber: activeCurrentNumber(),
    calledNumbers: game.calledNumbers,
    remainingNumbers: game.remainingNumbers.length,
    displayMs: DISPLAY_MS,
    aiLine: game.aiLine,
    history: history.matches.slice(0, 5).map((match) => ({
      id: match.id,
      winner: match.winner,
      finishedAt: match.finishedAt,
      calledCount: match.calledNumbers.length,
    })),
    leaderboard: leaderboard(),
    numberFrequency: numberFrequency(),
    winner: game.winner ? { id: game.winner.id, name: game.winner.name } : null,
    players: game.players.map((player) => ({
      id: player.id,
      name: player.name,
      ready: true,
      progress: playerProgress(player),
    })),
    me: me
      ? {
          id: me.id,
          name: me.name,
          isHost: me.isHost,
          ticket: me.ticket,
          markedNumbers: [...me.markedNumbers],
        }
      : null,
  };
}

function addPlayer(name, isHost = false) {
  if (game.started) {
    throw new Error("This game has already started.");
  }

  if (game.players.length >= game.capacity) {
    throw new Error("The game room is full.");
  }

  const player = {
    id: randomId(),
    name: cleanName(name, `Player ${game.players.length + 1}`),
    isHost,
    ticket: createTicket(),
    markedNumbers: new Set(),
  };

  game.players.push(player);
  return player;
}

function findPlayer(playerId) {
  const player = game.players.find((item) => item.id === playerId);

  if (!player) {
    throw new Error("Player not found. Join the game again.");
  }

  return player;
}

function requireHost(playerId) {
  const player = findPlayer(playerId);

  if (!player.isHost) {
    throw new Error("Only the host can do this.");
  }

  return player;
}

function handleCreateGame(body) {
  const capacity = Number(body.capacity);

  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 20) {
    throw new Error("Choose between 2 and 20 players.");
  }

  game = createEmptyGame(capacity);
  game.aiLine = hostLine("waiting");
  const host = addPlayer(body.name, true);
  return { playerId: host.id, state: publicState(host.id) };
}

function handleJoin(body) {
  const player = addPlayer(body.name);
  return { playerId: player.id, state: publicState(player.id) };
}

function handleStart(body) {
  requireHost(body.playerId);

  if (game.players.length !== game.capacity) {
    throw new Error(`Wait until all ${game.capacity} players have joined.`);
  }

  game.started = true;
  game.aiLine = hostLine("start");
  return publicState(body.playerId);
}

function handleDraw(body) {
  requireHost(body.playerId);
  activeCurrentNumber();

  if (!game.started) {
    throw new Error("Start the game first.");
  }

  if (game.winner) {
    throw new Error("The game already has a winner.");
  }

  if (game.currentNumber) {
    throw new Error("Wait 2.6 seconds before calling the next number.");
  }

  if (!game.remainingNumbers.length) {
    throw new Error("All numbers have already been called.");
  }

  const index = randomInt(0, game.remainingNumbers.length - 1);
  const [number] = game.remainingNumbers.splice(index, 1);
  game.calledNumbers.push(number);
  game.currentNumber = number;
  game.currentUntil = Date.now() + DISPLAY_MS;
  game.aiLine = hostLine("draw", { number });
  return publicState(body.playerId);
}

function handleMark(body) {
  const player = findPlayer(body.playerId);
  const number = Number(body.number);
  const allTicketNumbers = ticketNumbers(player.ticket);

  if (!game.started) {
    throw new Error("The game has not started yet.");
  }

  if (!allTicketNumbers.includes(number)) {
    throw new Error("That number is not on your card.");
  }

  if (!game.calledNumbers.includes(number)) {
    throw new Error("You can only mark numbers that have been called.");
  }

  if (player.markedNumbers.has(number)) {
    player.markedNumbers.delete(number);
  } else {
    player.markedNumbers.add(number);
    game.aiLine = hostLine("mark", { playerName: player.name });
  }

  return publicState(body.playerId);
}

function handleClaim(body) {
  const player = findPlayer(body.playerId);
  const numbers = ticketNumbers(player.ticket);
  const marked = numbers.every((number) => player.markedNumbers.has(number));
  const called = numbers.every((number) => game.calledNumbers.includes(number));

  if (!game.started) {
    throw new Error("The game has not started yet.");
  }

  if (!marked) {
    game.aiLine = hostLine("claimFail", { playerName: player.name });
    throw new Error("Mark every number on your card before claiming.");
  }

  if (!called) {
    game.aiLine = hostLine("claimFail", { playerName: player.name });
    throw new Error("Claim rejected. Not every card number has been called.");
  }

  game.winner = { id: player.id, name: player.name };
  game.aiLine = hostLine("winner", { playerName: player.name });
  saveMatch(player);
  return publicState(body.playerId);
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;

      if (data.length > 1_000_000) {
        reject(new Error("Request is too large."));
      }
    });
    request.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
  });
}

async function handleApi(request, response, url) {
  try {
    if (request.method === "GET" && url.pathname === "/api/state") {
      sendJson(response, 200, publicState(url.searchParams.get("playerId")));
      return;
    }

    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }

    const body = await readBody(request);
    const routes = {
      "/api/create-game": handleCreateGame,
      "/api/join": handleJoin,
      "/api/start": handleStart,
      "/api/draw": handleDraw,
      "/api/mark": handleMark,
      "/api/claim": handleClaim,
    };
    const handler = routes[url.pathname];

    if (!handler) {
      sendJson(response, 404, { error: "API route not found" });
      return;
    }

    sendJson(response, 200, handler(body));
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
}

function serveStatic(request, response, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.join(PUBLIC_DIR, path.normalize(requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const contentTypes = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
  };

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(content);
  });
}

function localAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => `http://${item.address}:${PORT}`);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    handleApi(request, response, url);
    return;
  }

  serveStatic(request, response, url);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Housie server running at http://localhost:${PORT}`);
  localAddresses().forEach((address) => console.log(`Other players can join at ${address}`));
});
