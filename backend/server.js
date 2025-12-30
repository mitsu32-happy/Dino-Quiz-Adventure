// backend/server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const PORT = process.env.PORT || 3001;

const ORIGIN_ALLOWLIST = [
  "https://mitsu32-happy.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];

// ======================
// questions master (server authoritative)
// ======================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const QUESTIONS_PATH = path.resolve(__dirname, "../data/questions.json");

function loadQuestionsMaster() {
  try {
    const raw = fs.readFileSync(QUESTIONS_PATH, "utf-8");
    const arr = JSON.parse(raw);
    const map = new Map();
    for (const q of arr) {
      if (!q || !q.id) continue;
      map.set(String(q.id), q);
    }
    console.log("[master] loaded questions:", map.size);
    return map;
  } catch (e) {
    console.error("[master] FAILED to load questions.json:", QUESTIONS_PATH, e?.message || e);
    return new Map();
  }
}
const QUESTION_MAP = loadQuestionsMaster();

// battleQuizScreen.js 側の getCorrectIndex と同じ解決順
function getCorrectIndexByQid(qid) {
  const q = QUESTION_MAP.get(String(qid));
  if (!q) return null;
  const v =
    q?.correct_choice_index ??
    q?.correct_index ??
    q?.answer_index ??
    q?.correct ??
    q?.correctChoiceIndex ??
    q?.correctIndex;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ======================
// utils
// ======================
function generateNumericRoomId(roomsMap, length = 6) {
  // 例: length=6 → 100000〜999999
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;

  // 衝突回避（念のため最大50回）
  for (let i = 0; i < 50; i++) {
    const id = String(Math.floor(min + Math.random() * (max - min + 1)));
    if (!roomsMap.has(id)) return id;
  }

  // ほぼ起きないが、起きたら length+1 に退避
  const fallback = String(Math.floor(Math.pow(10, length) + Math.random() * Math.pow(10, length)));
  return fallback;
}

function originAllowed(origin) {
  if (!origin) return true;
  return ORIGIN_ALLOWLIST.some((o) => origin.startsWith(o));
}

function roomPlayersArray(room) {
  return room.players.map((p) => ({
    clientId: p.clientId,
    profile: p.profile,
  }));
}

function emitRoomUpdate(io, room) {
  const payload = {
    roomId: room.roomId,
    hostClientId: room.hostClientId,
    players: roomPlayersArray(room),
  };
  io.to(room.roomId).emit("server:roomUpdate", payload);
  io.to(room.roomId).emit("room:update", payload); // 互換

  console.log("[server] emit room:update", {
    roomId: room.roomId,
    playersLen: room.players.length,
    hostClientId: room.hostClientId,
  });
}

function emitGameEvent(io, roomId, payload) {
  io.to(roomId).emit("server:gameEvent", payload);
  io.to(roomId).emit("game:event", payload); // battleQuizScreen.js がこれで受ける

  console.log("[server] emit game:event", {
    roomId,
    type: payload?.type,
    index: payload?.index,
    reason: payload?.reason,
  });
}

function createEmptyGame() {
  return {
    status: "waiting",
    questionIds: [],
    index: 0,
    timeLimitSec: 20,

    // qIndex -> { [clientId]: { choiceIndex, choiceIndexRaw, clientAnsweredAt, serverReceivedAtMs } }
    answersByIndex: {},

    // クライアントが期待する配列形式
    points: [0, 0, 0, 0],
    correctCounts: [0, 0, 0, 0],
    correctTimeSum: [0, 0, 0, 0],

    questionStartAtMs: 0,
    timerHandle: null,
    timerForIndex: null, // ← どの問題のタイマーかを固定して保持
  };
}

function clearGameTimer(game) {
  if (game.timerHandle) {
    clearTimeout(game.timerHandle);
    game.timerHandle = null;
  }
  game.timerForIndex = null;
}

function ensureAnswersContainer(game, qIndex) {
  if (!game.answersByIndex[qIndex]) game.answersByIndex[qIndex] = {};
  return game.answersByIndex[qIndex];
}

function makeClientIdToPi(room) {
  const map = {};
  for (let pi = 0; pi < 4; pi++) {
    const p = room.players?.[pi];
    if (p?.clientId) map[p.clientId] = pi;
  }
  return map;
}

// 速い順 3/2/1pt
function calcAwardsBySpeed(correctEntries) {
  const sorted = [...correctEntries].sort((a, b) => a.elapsedMs - b.elapsedMs);
  const awards = [3, 2, 1];
  const awardByClientId = new Map();
  for (let rank = 0; rank < Math.min(3, sorted.length); rank++) {
    awardByClientId.set(sorted[rank].clientId, awards[rank]);
  }
  return awardByClientId;
}

// ★ タイマーを必ず「特定の index に紐づけて」セットする（ここが重要）
function scheduleTimeout(io, room, index) {
  const game = room.game;
  clearGameTimer(game);
  game.timerForIndex = index;

  const ms = Math.max(1, Number(game.timeLimitSec || 20) * 1000);
  console.log("[server] scheduleTimeout", { roomId: room.roomId, index, ms });

  game.timerHandle = setTimeout(() => {
    console.log("[server] timeout fired", {
      roomId: room.roomId,
      scheduledIndex: index,
      gameIndex: room.game.index,
      timerForIndex: room.game.timerForIndex,
      status: room.game.status,
    });

    // その時点で index が変わっていたら何もしない（別問題に進んでいる）
    if (room.game.status !== "playing") return;
    if (room.game.timerForIndex !== index) return;
    if (room.game.index !== index) return;

    endQuestionAndAdvance(io, room, "timeout");
  }, ms);
}

function endQuestionAndAdvance(io, room, reason) {
  console.log("[server] endQuestionAndAdvance ENTER", {
    roomId: room.roomId,
    index: room.game.index,
    reason,
    playersLen: room.players.length,
  });

  const game = room.game;
  const qIndex = game.index;

  // 念のため：既に終了しているなら何もしない
  if (game.status !== "playing") return;

  const byClient = ensureAnswersContainer(game, qIndex);

  // 未回答者を timeout(-1) で埋める
  for (const p of room.players) {
    const cid = p.clientId;
    if (!byClient[cid]) {
      byClient[cid] = {
        choiceIndex: -1,
        choiceIndexRaw: -1,
        clientAnsweredAt: 0,
        serverReceivedAtMs: Date.now(),
      };
    }
  }

  const qid = game.questionIds[qIndex];
  const correctIdx = getCorrectIndexByQid(qid);
  const cidToPi = makeClientIdToPi(room);

  // 正解者（タイムアウト除外）
  const correctEntries = [];
  if (correctIdx !== null) {
    for (const [cid, a] of Object.entries(byClient)) {
      const chosen = Number(a.choiceIndex);
      if (chosen === -1) continue;

      // ✅ 採点は raw 優先（シャッフル前 index）
      const pickedRaw = Number.isFinite(Number(a.choiceIndexRaw)) ? Number(a.choiceIndexRaw) : chosen;

      if (pickedRaw === Number(correctIdx)) {
        const elapsedMs = Math.max(
          0,
          (Number(a.serverReceivedAtMs) || Date.now()) - (game.questionStartAtMs || Date.now())
        );
        correctEntries.push({ clientId: cid, elapsedMs });
      }
    }
  }

  // 速い順に 3/2/1 加点
  const awardByCid = calcAwardsBySpeed(correctEntries);
  for (const [cid, award] of awardByCid.entries()) {
    const pi = cidToPi[cid];
    if (Number.isFinite(pi)) game.points[pi] = Number(game.points[pi] || 0) + Number(award || 0);
  }

  // correctCounts / correctTimeSum
  if (correctIdx !== null) {
    for (const [cid, a] of Object.entries(byClient)) {
      const pi = cidToPi[cid];
      if (!Number.isFinite(pi)) continue;

      const chosen = Number(a.choiceIndex);
      if (chosen === -1) continue;

      // ✅ ここも raw 優先
      const pickedRaw = Number.isFinite(Number(a.choiceIndexRaw)) ? Number(a.choiceIndexRaw) : chosen;

      if (pickedRaw === Number(correctIdx)) {
        game.correctCounts[pi] = Number(game.correctCounts[pi] || 0) + 1;
        const elapsedMs = Math.max(
          0,
          (Number(a.serverReceivedAtMs) || Date.now()) - (game.questionStartAtMs || Date.now())
        );
        game.correctTimeSum[pi] = Number(game.correctTimeSum[pi] || 0) + elapsedMs;
      }
    }
  }

  console.log("[server] scoring snapshot", {
    roomId: room.roomId,
    qIndex,
    answersCount: Object.keys(byClient).length,
    points: game.points,
    correctCounts: game.correctCounts,
  });

  // 問題結果
  emitGameEvent(io, room.roomId, {
    type: "game:result_question",
    index: qIndex,
    reason: reason || "all_answered",
    points: game.points.slice(0, 4),
    correctCounts: game.correctCounts.slice(0, 4),
    correctTimeSum: game.correctTimeSum.slice(0, 4),
  });

  // 次へ
  game.index = qIndex + 1;

  if (game.index >= game.questionIds.length) {
    game.status = "finished";
    clearGameTimer(game);

    const entries = room.players.map((p, pi) => ({
      pi,
      clientId: p.clientId,
      name: p?.profile?.name ?? "Player",
      points: Number(game.points[pi] || 0),
      correct: Number(game.correctCounts[pi] || 0),
      timeSum: Number(game.correctTimeSum[pi] || 0),
    }));

    // points desc -> correct desc -> timeSum asc
    entries.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.correct !== a.correct) return b.correct - a.correct;
      return a.timeSum - b.timeSum;
    });

    emitGameEvent(io, room.roomId, {
      type: "game:result_final",
      result: { entries },
    });
    return;
  }

  // 次の問題開始
  game.questionStartAtMs = Date.now();
  emitGameEvent(io, room.roomId, {
    type: "game:question",
    index: game.index,
    questionStartAtMs: game.questionStartAtMs,
  });

  // タイマー張り直し（必ず index 固定で）
  scheduleTimeout(io, room, game.index);
}

// ======================
// server setup
// ======================
const app = express();
app.use(express.json());

app.use(
  cors({
    origin: (origin, cb) => {
      if (originAllowed(origin)) return cb(null, true);
      return cb(new Error("CORS blocked: " + origin));
    },
    credentials: true,
  })
);

app.get("/", (req, res) => res.status(200).send("Battle server OK"));
app.get("/health", (req, res) => res.status(200).json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ORIGIN_ALLOWLIST,
    credentials: true,
  },
});

const rooms = new Map(); // roomId -> {roomId, hostClientId, players[], game}

// ======================
// socket.io
// ======================
io.on("connection", (socket) => {
  console.log("[server] connect", { socketId: socket.id });
  socket.emit("server:hello", { clientId: socket.id });

  socket.on("room:create", ({ profile }, cb) => {
    const roomId = generateNumericRoomId(rooms, 6);
    const room = {
      roomId,
      hostClientId: socket.id,
      players: [{ clientId: socket.id, profile: profile || {} }],
      game: createEmptyGame(),
    };
    rooms.set(roomId, room);
    socket.join(roomId);
    emitRoomUpdate(io, room);
    cb?.({ ok: true, roomId, clientId: socket.id });

    console.log("[server] room:create", { roomId, socketId: socket.id });
  });

  socket.on("room:join", ({ roomId, profile }, cb) => {
    const rid = String(roomId || "").trim().toUpperCase();
    const room = rooms.get(rid);
    if (!room) return cb?.({ ok: false, error: "ROOM_NOT_FOUND" });
    if (room.players.length >= 4) return cb?.({ ok: false, error: "ROOM_FULL" });

    room.players.push({ clientId: socket.id, profile: profile || {} });
    socket.join(rid);
    emitRoomUpdate(io, room);
    cb?.({ ok: true, roomId: rid, clientId: socket.id });

    console.log("[server] room:join", {
      roomId: rid,
      socketId: socket.id,
      playersLen: room.players.length,
    });
  });

  socket.on("room:leave", () => {
    console.log("[server] room:leave", { socketId: socket.id });
    for (const room of rooms.values()) {
      const idx = room.players.findIndex((p) => p.clientId === socket.id);
      if (idx >= 0) {
        room.players.splice(idx, 1);

        if (room.hostClientId === socket.id) {
          io.to(room.roomId).emit("room:closed");
          rooms.delete(room.roomId);
          console.log("[server] host left -> room closed", { roomId: room.roomId });
          return;
        }

        emitRoomUpdate(io, room);
        return;
      }
    }
  });

  function findRoomBySocket() {
    for (const room of rooms.values()) {
      if (room.players.some((p) => p.clientId === socket.id)) return room;
    }
    return null;
  }

  function handleGameEvent(ev) {
    console.log("[server] recv game:event", {
      socketId: socket.id,
      type: ev?.type,
      roomId: ev?.roomId,
      index: ev?.index,
      choiceIndex: ev?.choiceIndex,
    });

    let room = null;
    const rid = String(ev?.roomId || "").trim().toUpperCase();
    if (rid) room = rooms.get(rid);
    if (!room) room = findRoomBySocket();
    if (!room) {
      console.log("[server] room not found for socket", { socketId: socket.id, rid });
      return;
    }

    const game = room.game;

    // host starts game
    if (ev.type === "game:begin") {
      if (socket.id !== room.hostClientId) return;

      game.status = "playing";
      game.questionIds = Array.isArray(ev.questionIds) ? ev.questionIds : [];
      game.index = 0;
      game.timeLimitSec = Number(ev.timeLimitSec ?? 20) || 20;

      game.answersByIndex = {};
      game.points = [0, 0, 0, 0];
      game.correctCounts = [0, 0, 0, 0];
      game.correctTimeSum = [0, 0, 0, 0];

      emitGameEvent(io, room.roomId, {
        type: "game:begin",
        beginPayload: {
          roomId: room.roomId,
          hostClientId: room.hostClientId,
          players: roomPlayersArray(room),
          questionIds: game.questionIds,
        },
      });

      // 最初の問題開始
      game.questionStartAtMs = Date.now();
      emitGameEvent(io, room.roomId, {
        type: "game:question",
        index: 0,
        questionStartAtMs: game.questionStartAtMs,
      });

      // タイマー（index固定）
      scheduleTimeout(io, room, 0);
      return;
    }

    // answer (any player)
    if (ev.type === "game:answer") {
      if (game.status !== "playing") return;

      // ★ index がズレてても「現在の問題」を優先して受理する（止まり防止）
      const requestedIndex = Number(ev.index);
      const index = Number.isFinite(requestedIndex) ? requestedIndex : game.index;

      if (index !== game.index) {
        console.log("[server] ignored answer due to index mismatch", { index, gameIndex: game.index });
        return;
      }

      const byClient = ensureAnswersContainer(game, index);
      if (byClient[socket.id]) return; // 二重回答防止

      const choiceIndex = Number(ev.choiceIndex);
      const clientAnsweredAt = Number(ev.clientAnsweredAt) || 0;
      const serverReceivedAtMs = Date.now();

      // ✅ raw index を受け取って保存（無ければ choiceIndex を raw とみなす）
      const choiceIndexRaw = Number(ev.choiceIndexRaw);
      byClient[socket.id] = {
        choiceIndex,
        choiceIndexRaw: Number.isFinite(choiceIndexRaw) ? choiceIndexRaw : choiceIndex,
        clientAnsweredAt,
        serverReceivedAtMs,
      };

      console.log("[server] accepted answer", {
        roomId: room.roomId,
        index,
        need: room.players.length,
        got: Object.keys(byClient).length,
        choiceIndex,
      });

      // クライアントが期待する形式：from / index / choiceIndex
      emitGameEvent(io, room.roomId, {
        type: "game:answer",
        index,
        from: socket.id,
        // 画面同期用（シャッフル後）
        choiceIndex,
        // 採点用（シャッフル前）
        choiceIndexRaw: byClient[socket.id].choiceIndexRaw,
        clientAnsweredAt,
        serverReceivedAtMs,
      });

      // 全員回答で確定
      const need = room.players.length;
      const got = Object.keys(byClient).length;
      if (got >= need) {
        clearGameTimer(game);
        endQuestionAndAdvance(io, room, "all_answered");
      }
      return;
    }
  }

  socket.on("client:gameEvent", handleGameEvent);
  socket.on("game:event", handleGameEvent); // 互換

  socket.on("disconnect", () => {
    console.log("[server] disconnect", { socketId: socket.id });

    for (const room of rooms.values()) {
      const idx = room.players.findIndex((p) => p.clientId === socket.id);
      if (idx >= 0) {
        room.players.splice(idx, 1);

        if (room.hostClientId === socket.id) {
          io.to(room.roomId).emit("room:closed");
          rooms.delete(room.roomId);
          console.log("[server] host disconnected -> room closed", { roomId: room.roomId });
          return;
        }

        emitRoomUpdate(io, room);
        return;
      }
    }
  });
});

server.listen(PORT, () => {
  console.log("[master] loaded questions:", QUESTION_MAP.size);
  console.log("Battle server listening on", PORT);
  console.log("Allowed origins:", ORIGIN_ALLOWLIST);
  console.log("Questions path:", QUESTIONS_PATH);
});
