// backend/server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { randomUUID } from "crypto";

const PORT = process.env.PORT || 3001;

const ORIGIN_ALLOWLIST = [
  "https://mitsu32-happy.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];

const app = express();
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ORIGIN_ALLOWLIST.includes(origin)) return cb(null, true);
      return cb(new Error("CORS_NOT_ALLOWED"), false);
    },
    methods: ["GET", "POST"],
    credentials: true,
  })
);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ORIGIN_ALLOWLIST, methods: ["GET", "POST"], credentials: true },
});

app.get("/", (_req, res) => res.status(200).send("OK"));
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

const rooms = new Map();

function normalizeRoomId(roomId) {
  return String(roomId || "").trim().toUpperCase();
}
function normalizePlayerKey(profile, socketId) {
  const pk = profile?.playerKey;
  if (pk && String(pk).trim()) return String(pk).trim();
  return `socket:${socketId}`; // フォールバック
}

function createEmptyGame() {
  return {
    status: "lobby",
    questionIds: [],
    questionMeta: [], // [{ qid, correctRawIndex, choiceCount }]
    seedBase: "", // シャッフルの共通seed
    index: 0,
    answers: {}, // answers[qIndex][playerKey] = { choiceIndex, answeredAtMs }
    scores: {}, // scores[playerKey] = number
    timer: null, // setTimeout id
    questionStartAtMs: 0,
  };
}

function roomPlayersArray(room) {
  return Array.from(room.players.values()).map((p) => ({
    clientId: p.clientId,
    playerKey: p.playerKey,
    profile: p.profile,
  }));
}

function emitRoomUpdate(room) {
  io.to(room.roomId).emit("room:update", {
    roomId: room.roomId,
    hostClientId: room.hostClientId,
    players: roomPlayersArray(room),
  });
}

// ---- shuffle (clientと同じ) ----
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function makeRng(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x >>>= 0;
    x ^= x << 5;
    x >>>= 0;
    return (x >>> 0) / 4294967296;
  };
}
function shuffledIndices(n, seedStr) {
  const arr = Array.from({ length: n }, (_, i) => i);
  const rng = makeRng(hashSeed(seedStr));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function calcCorrectShuffledIndex({ seedBase, qid, qIndex, correctRawIndex, choiceCount }) {
  if (correctRawIndex == null) return null;
  const order = shuffledIndices(choiceCount, `${seedBase}|${qid}|${qIndex}`);
  const pos = order.indexOf(Number(correctRawIndex));
  return pos >= 0 ? pos : null;
}

function ensureAnswerBucket(game, qIndex) {
  if (!game.answers[qIndex]) game.answers[qIndex] = {};
  return game.answers[qIndex];
}

function clearGameTimer(game) {
  if (game.timer) {
    try {
      clearTimeout(game.timer);
    } catch (_) {}
    game.timer = null;
  }
}

function startQuestionTimer(room) {
  const game = room.game;
  clearGameTimer(game);

  game.questionStartAtMs = Date.now();
  const qIndex = game.index;

  game.timer = setTimeout(() => {
    // 未回答を -1 で埋めて強制終了
    const ansMap = ensureAnswerBucket(game, qIndex);
    for (const pk of room.players.keys()) {
      if (!ansMap[pk]) {
        ansMap[pk] = { choiceIndex: -1, answeredAtMs: Date.now() };
      }
    }
    endQuestion(room, qIndex, true);
  }, 20_000);
}

function endQuestion(room, qIndex, byTimeout) {
  const game = room.game;
  if (game.status !== "playing") return;
  if (qIndex !== game.index) return; // 旧問題の遅延対策

  clearGameTimer(game);

  const meta = game.questionMeta[qIndex] || {};
  const correct = calcCorrectShuffledIndex({
    seedBase: game.seedBase,
    qid: meta.qid,
    qIndex,
    correctRawIndex: meta.correctRawIndex,
    choiceCount: meta.choiceCount,
  });

  const ansMap = ensureAnswerBucket(game, qIndex);

  // 正解者リスト（早い順）
  const correctList = [];
  for (const [pk, a] of Object.entries(ansMap)) {
    if (!a) continue;
    if (Number(a.choiceIndex) === -1) continue;
    const ok = correct !== null && Number(a.choiceIndex) === Number(correct);
    if (ok) correctList.push({ playerKey: pk, answeredAtMs: Number(a.answeredAtMs) || Date.now() });
  }
  correctList.sort((a, b) => a.answeredAtMs - b.answeredAtMs);

  const awards = [3, 2, 1];
  const awardMap = {};
  for (let i = 0; i < Math.min(3, correctList.length); i++) {
    awardMap[correctList[i].playerKey] = awards[i];
  }

  // 累計に加算
  for (const pk of room.players.keys()) {
    game.scores[pk] = Number(game.scores[pk] ?? 0) + Number(awardMap[pk] ?? 0);
  }

  // questionEnd を全員へ（確定情報）
  io.to(room.roomId).emit("game:event", {
    type: "game:questionEnd",
    qIndex,
    byTimeout: !!byTimeout,
    correctIndex: correct, // シャッフル後の正解index（全員一致）
    answers: ansMap, // { [playerKey]: { choiceIndex, answeredAtMs } }
    awards: awardMap, // { [playerKey]: ptThisQuestion }
    scores: game.scores, // { [playerKey]: totalPt }
  });

  // next / finished
  game.index++;

  if (game.index >= game.questionIds.length) {
    game.status = "finished";
    io.to(room.roomId).emit("game:event", {
      type: "game:finished",
      scores: game.scores,
    });
  } else {
    io.to(room.roomId).emit("game:event", {
      type: "game:next",
      index: game.index,
    });
    startQuestionTimer(room);
  }
}

io.on("connection", (socket) => {
  socket.data.roomId = null;

  socket.on("room:create", ({ profile }, cb) => {
    const roomId = randomUUID().slice(0, 6).toUpperCase();
    const prof = profile || {};
    const playerKey = normalizePlayerKey(prof, socket.id);

    const room = {
      roomId,
      hostClientId: socket.id,
      players: new Map(),
      game: createEmptyGame(),
    };

    room.players.set(playerKey, { playerKey, clientId: socket.id, profile: prof });
    rooms.set(roomId, room);

    socket.data.roomId = roomId;
    socket.join(roomId);

    emitRoomUpdate(room);
    cb?.({ ok: true, roomId });
  });

  socket.on("room:join", ({ roomId, profile }, cb) => {
    const rid = normalizeRoomId(roomId);
    const room = rooms.get(rid);
    if (!room) return cb?.({ ok: false, error: "ROOM_NOT_FOUND" });

    const prof = profile || {};
    const playerKey = normalizePlayerKey(prof, socket.id);

    // ✅ 同一playerKeyは上書き（増殖しない）
    if (!room.players.has(playerKey) && room.players.size >= 4) {
      return cb?.({ ok: false, error: "ROOM_FULL" });
    }
    room.players.set(playerKey, { playerKey, clientId: socket.id, profile: prof });

    socket.data.roomId = rid;
    socket.join(rid);

    emitRoomUpdate(room);
    cb?.({ ok: true });
  });

  socket.on("room:leave", () => {
    const rid = socket.data.roomId;
    socket.data.roomId = null;
    if (!rid) return;

    const room = rooms.get(rid);
    socket.leave(rid);
    if (!room) return;

    if (room.hostClientId === socket.id) {
      io.to(room.roomId).emit("room:closed");
      rooms.delete(room.roomId);
      return;
    }

    // socket.id一致のplayerを削除
    for (const [pk, p] of room.players.entries()) {
      if (p.clientId === socket.id) {
        room.players.delete(pk);
        break;
      }
    }

    emitRoomUpdate(room);

    // 進行中なら、抜けた分を考慮して「全員回答済み？」を再評価
    const game = room.game;
    if (game.status === "playing") {
      const qIndex = game.index;
      const ansMap = ensureAnswerBucket(game, qIndex);
      const all = Array.from(room.players.keys()).every((pk) => !!ansMap[pk]);
      if (all) endQuestion(room, qIndex, false);
    }
  });

  socket.on("game:event", (ev) => {
    const rid = normalizeRoomId(ev?.roomId || socket.data.roomId);
    const room = rooms.get(rid);
    if (!room) return;

    // socket.id に紐づく playerKey を探す
    let myPlayerKey = null;
    for (const [pk, p] of room.players.entries()) {
      if (p.clientId === socket.id) {
        myPlayerKey = pk;
        break;
      }
    }
    if (!myPlayerKey) return;

    const game = room.game;

    // ---- begin（ホストのみ）----
    if (ev.type === "game:begin") {
      if (socket.id !== room.hostClientId) return;

      const questionIds = Array.isArray(ev.questionIds) ? ev.questionIds : [];
      const questionMeta = Array.isArray(ev.questionMeta) ? ev.questionMeta : [];

      game.status = "playing";
      game.questionIds = questionIds;
      game.questionMeta = questionMeta.map((m) => ({
        qid: m.qid,
        correctRawIndex: Number.isFinite(Number(m.correctRawIndex)) ? Number(m.correctRawIndex) : null,
        choiceCount: Number(m.choiceCount) || 4,
      }));
      game.seedBase = `${room.roomId}|${room.hostClientId}`;
      game.index = 0;
      game.answers = {};
      game.scores = {};
      for (const pk of room.players.keys()) game.scores[pk] = 0;

      io.to(room.roomId).emit("game:event", {
        type: "game:begin",
        beginPayload: {
          roomId: room.roomId,
          hostClientId: room.hostClientId,
          seedBase: game.seedBase,
          players: roomPlayersArray(room),
          questionIds: game.questionIds,
        },
      });

      startQuestionTimer(room);
      return;
    }

    // ---- answer ----
    if (ev.type === "game:answer") {
      if (game.status !== "playing") return;

      const qIndex = game.index;
      const ansMap = ensureAnswerBucket(game, qIndex);

      // 二重回答防止
      if (ansMap[myPlayerKey]) return;

      const choiceIndex = Number(ev.choiceIndex);
      ansMap[myPlayerKey] = {
        choiceIndex: Number.isFinite(choiceIndex) ? choiceIndex : -1,
        answeredAtMs: Date.now(), // サーバ時刻
      };

      // 他者SE/表示用（回答が入ったことだけ通知）
      io.to(room.roomId).emit("game:event", {
        type: "game:answer",
        qIndex,
        playerKey: myPlayerKey,
      });

      // 全員回答で終了
      const all = Array.from(room.players.keys()).every((pk) => !!ansMap[pk]);
      if (all) endQuestion(room, qIndex, false);
    }
  });

  socket.on("disconnect", () => {
    const rid = socket.data.roomId;
    socket.data.roomId = null;
    if (!rid) return;

    const room = rooms.get(rid);
    if (!room) return;

    if (room.hostClientId === socket.id) {
      io.to(room.roomId).emit("room:closed");
      rooms.delete(room.roomId);
      return;
    }

    for (const [pk, p] of room.players.entries()) {
      if (p.clientId === socket.id) {
        room.players.delete(pk);
        break;
      }
    }

    emitRoomUpdate(room);

    const game = room.game;
    if (game.status === "playing") {
      const qIndex = game.index;
      const ansMap = ensureAnswerBucket(game, qIndex);
      const all = Array.from(room.players.keys()).every((pk) => !!ansMap[pk]);
      if (all) endQuestion(room, qIndex, false);
    }
  });
});

server.listen(PORT, () => {
  console.log("Battle server listening on", PORT);
});
