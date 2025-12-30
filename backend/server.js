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

function getCorrectIndexByQid(qid) {
  const q = QUESTION_MAP.get(String(qid));
  if (!q) return null;
  const v =
    q.correct_choice_index ??
    q.correct_index ??
    q.answer_index ??
    q.correct ??
    q.correctChoiceIndex ??
    q.correctIndex;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ======================
// utils
// ======================
function originAllowed(origin) {
  if (!origin) return true;
  return ORIGIN_ALLOWLIST.some((o) => origin.startsWith(o));
}

function getPlayerKeyFromProfile(profile) {
  const pk = profile?.playerKey ?? profile?.player_key ?? null;
  return pk ? String(pk) : null;
}

function roomPlayersArray(room) {
  return room.players.map((p) => ({
    clientId: p.clientId,
    playerKey: getPlayerKeyFromProfile(p.profile),
    profile: p.profile,
  }));
}

// battleClient.js は server:roomUpdate を受け取る
function emitRoomUpdate(io, room) {
  const payload = {
    roomId: room.roomId,
    hostClientId: room.hostClientId,
    players: roomPlayersArray(room),
  };
  io.to(room.roomId).emit("server:roomUpdate", payload);
  // 互換
  io.to(room.roomId).emit("room:update", payload);
}

function emitGameEvent(io, roomId, payload) {
  io.to(roomId).emit("server:gameEvent", payload);
  // 互換
  io.to(roomId).emit("game:event", payload);
}

function createEmptyGame() {
  return {
    status: "waiting",
    questionIds: [],
    index: 0,
    answersByIndex: {}, // { [qIndex]: { [playerKey]: { choiceIndex, answeredAtMs } } }
    scores: {}, // { [playerKey]: totalPt }
    timeLimitSec: 20,
  };
}

// 速い順 3/2/1pt
function awardPointsBySpeed(correctList) {
  const sorted = [...correctList].sort((a, b) => a.answeredAtMs - b.answeredAtMs);
  const awards = [3, 2, 1];
  const awardsMap = new Map();
  for (let rank = 0; rank < Math.min(3, sorted.length); rank++) {
    const pk = sorted[rank].playerKey;
    awardsMap.set(pk, (awardsMap.get(pk) ?? 0) + awards[rank]);
  }
  return awardsMap;
}

// socket.id から所属ルームを逆引き（roomIdが来ない場合の救済）
function findRoomBySocketId(rooms, socketId) {
  for (const room of rooms.values()) {
    if (room.players.some((p) => p.clientId === socketId)) return room;
  }
  return null;
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

// ✅ /health を追加（入室時の疎通確認が404でループしていたため）
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
  // battleClient.js は server:hello を受ける
  socket.emit("server:hello", { clientId: socket.id });

  // ---- room:create ----
  socket.on("room:create", ({ profile }, cb) => {
    const roomId = randomUUID().slice(0, 6).toUpperCase();
    const room = {
      roomId,
      hostClientId: socket.id,
      players: [{ clientId: socket.id, profile: profile || {} }],
      game: createEmptyGame(),
    };
    rooms.set(roomId, room);
    socket.join(roomId);
    emitRoomUpdate(io, room);

    // ✅ roomId を必ず返す（battleClient.js が res.roomId を使う）
    cb?.({ ok: true, roomId, clientId: socket.id });
  });

  // ---- room:join ----
  socket.on("room:join", ({ roomId, profile }, cb) => {
    const rid = String(roomId || "").trim().toUpperCase();
    const room = rooms.get(rid);
    if (!room) return cb?.({ ok: false, error: "ROOM_NOT_FOUND" });
    if (room.players.length >= 4) return cb?.({ ok: false, error: "ROOM_FULL" });

    room.players.push({ clientId: socket.id, profile: profile || {} });
    socket.join(rid);
    emitRoomUpdate(io, room);

    // ✅ roomId を必ず返す（ここが抜けるとクライアントが同期不能になる）
    cb?.({ ok: true, roomId: rid, clientId: socket.id });
  });

  // ---- room:leave ----
  socket.on("room:leave", () => {
    for (const room of rooms.values()) {
      const idx = room.players.findIndex((p) => p.clientId === socket.id);
      if (idx >= 0) {
        room.players.splice(idx, 1);

        if (room.hostClientId === socket.id) {
          io.to(room.roomId).emit("room:closed");
          rooms.delete(room.roomId);
          return;
        }

        emitRoomUpdate(io, room);
        return;
      }
    }
  });

  // ======================
  // game event handler
  // ======================
  function handleGameEvent(ev) {
    // ✅ roomId が来ないケースがあるので救済する
    let room = null;
    const rid = String(ev?.roomId || "").trim().toUpperCase();
    if (rid) room = rooms.get(rid);
    if (!room) room = findRoomBySocketId(rooms, socket.id);
    if (!room) return;

    const game = room.game;

    // ---- game begin (host only) ----
    if (ev.type === "game:begin") {
      if (socket.id !== room.hostClientId) return;

      game.status = "playing";
      game.questionIds = Array.isArray(ev.questionIds) ? ev.questionIds : [];
      game.index = 0;
      game.answersByIndex = {};
      game.scores = {};
      game.timeLimitSec = Number(ev.timeLimitSec ?? 20) || 20;

      for (const p of room.players) {
        const pk = getPlayerKeyFromProfile(p.profile) || p.clientId;
        game.scores[pk] = 0;
      }

      emitGameEvent(io, room.roomId, {
        type: "game:begin",
        beginPayload: {
          roomId: room.roomId,
          hostClientId: room.hostClientId,
          players: roomPlayersArray(room),
          questionIds: game.questionIds,
        },
      });
      return;
    }

    // ---- answer ----
    if (ev.type === "game:answer") {
      if (game.status !== "playing") return;

      const me = room.players.find((p) => p.clientId === socket.id);
      const playerKey = getPlayerKeyFromProfile(me?.profile) || socket.id;

      const qIndex = game.index;
      if (!game.answersByIndex[qIndex]) game.answersByIndex[qIndex] = {};
      if (game.answersByIndex[qIndex][playerKey]) return;

      const answeredAtMs = Number(ev.clientAnsweredAt ?? ev.answeredAtMs ?? ev.timeMs) || Date.now();
      const choiceIndex = Number(ev.choiceIndex);

      game.answersByIndex[qIndex][playerKey] = { choiceIndex, answeredAtMs };

      // 回答通知
      emitGameEvent(io, room.roomId, { type: "game:answer", playerKey, qIndex });

      // 全員回答したら確定
      const need = room.players.length;
      const got = Object.keys(game.answersByIndex[qIndex]).length;
      if (got < need) return;

      const qid = game.questionIds[qIndex];
      const correctIdx = getCorrectIndexByQid(qid);

      const correctList = [];
      for (const [pk, a] of Object.entries(game.answersByIndex[qIndex])) {
        if (Number(a.choiceIndex) === -1) continue;
        if (correctIdx === null) continue;
        if (Number(a.choiceIndex) === Number(correctIdx)) {
          correctList.push({ playerKey: pk, answeredAtMs: Number(a.answeredAtMs) || Date.now() });
        }
      }

      const awards = awardPointsBySpeed(correctList);
      for (const pk of Object.keys(game.scores)) {
        game.scores[pk] = Number(game.scores[pk] ?? 0) + Number(awards.get(pk) ?? 0);
      }

      emitGameEvent(io, room.roomId, {
        type: "game:questionEnd",
        qIndex,
        answers: game.answersByIndex[qIndex],
        scores: game.scores,
      });

      game.index++;
      if (game.index >= game.questionIds.length) {
        game.status = "finished";
        emitGameEvent(io, room.roomId, { type: "game:finished", scores: game.scores });
      } else {
        emitGameEvent(io, room.roomId, { type: "game:next", index: game.index });
      }
      return;
    }
  }

  // battleClient.js は client:gameEvent で送る（念のため両対応）
  socket.on("client:gameEvent", handleGameEvent);
  socket.on("game:event", handleGameEvent);

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      const idx = room.players.findIndex((p) => p.clientId === socket.id);
      if (idx >= 0) {
        room.players.splice(idx, 1);

        if (room.hostClientId === socket.id) {
          io.to(room.roomId).emit("room:closed");
          rooms.delete(room.roomId);
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
