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

// repo ルートに data/questions.json がある想定（backend/server.js から ../data/questions.json）
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
  if (!origin) return true; // curl等
  return ORIGIN_ALLOWLIST.some((o) => origin.startsWith(o));
}

function getPlayerKeyFromProfile(profile) {
  const pk = profile?.playerKey ?? profile?.player_key ?? null;
  return pk ? String(pk) : null;
}

function roomPlayersArray(room) {
  // ルーム更新でクライアントが使うため、playerKeyも明示
  return room.players.map((p) => ({
    clientId: p.clientId,
    playerKey: getPlayerKeyFromProfile(p.profile),
    profile: p.profile,
  }));
}

function emitRoomUpdate(io, room) {
  io.to(room.roomId).emit("room:update", {
    roomId: room.roomId,
    hostClientId: room.hostClientId,
    players: roomPlayersArray(room),
  });
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
    cb?.({ ok: true, roomId });
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
    cb?.({ ok: true });
  });

  // ---- room:leave ----
  socket.on("room:leave", () => {
    for (const room of rooms.values()) {
      const idx = room.players.findIndex((p) => p.clientId === socket.id);
      if (idx >= 0) {
        room.players.splice(idx, 1);

        // host leave -> close
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
  // game:event
  // ======================
  socket.on("game:event", (ev) => {
    const roomId = String(ev?.roomId || "").trim().toUpperCase();
    const room = rooms.get(roomId);
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

      // 初期スコア：playerKey をキーにする
      for (const p of room.players) {
        const pk = getPlayerKeyFromProfile(p.profile) || p.clientId;
        game.scores[pk] = 0;
      }

      io.to(room.roomId).emit("game:event", {
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

      // この回答者の playerKey
      const me = room.players.find((p) => p.clientId === socket.id);
      const playerKey = getPlayerKeyFromProfile(me?.profile) || socket.id;

      const qIndex = game.index;
      if (!game.answersByIndex[qIndex]) game.answersByIndex[qIndex] = {};

      // 二重回答防止（playerKey単位）
      if (game.answersByIndex[qIndex][playerKey]) return;

      const answeredAtMs = Number(ev.clientAnsweredAt ?? ev.answeredAtMs ?? ev.timeMs) || Date.now();
      const choiceIndex = Number(ev.choiceIndex);

      game.answersByIndex[qIndex][playerKey] = {
        choiceIndex,
        answeredAtMs,
      };

      // 全員に「この人が回答した」通知（クライアントは表示/SE用）
      io.to(room.roomId).emit("game:event", {
        type: "game:answer",
        playerKey,
        qIndex,
      });

      // 全員回答したら確定
      const need = room.players.length;
      const got = Object.keys(game.answersByIndex[qIndex]).length;

      if (got >= need) {
        // スコア計算（サーバー正）
        const qid = game.questionIds[qIndex];
        const correctIdx = getCorrectIndexByQid(qid);

        const correctList = [];
        for (const [pk, a] of Object.entries(game.answersByIndex[qIndex])) {
          if (Number(a.choiceIndex) === -1) continue; // timeout
          if (correctIdx === null) continue;
          if (Number(a.choiceIndex) === Number(correctIdx)) {
            correctList.push({ playerKey: pk, answeredAtMs: Number(a.answeredAtMs) || Date.now() });
          }
        }

        const awards = awardPointsBySpeed(correctList);
        for (const pk of Object.keys(game.scores)) {
          game.scores[pk] = Number(game.scores[pk] ?? 0) + Number(awards.get(pk) ?? 0);
        }

        // その問題の結果
        io.to(room.roomId).emit("game:event", {
          type: "game:questionEnd",
          qIndex,
          answers: game.answersByIndex[qIndex], // { [playerKey]: {choiceIndex, answeredAtMs} }
          scores: game.scores, // { [playerKey]: totalPt }
        });

        // 次へ
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
        }
      }

      return;
    }
  });

  // ---- disconnect ----
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
  console.log("Battle server listening on", PORT);
  console.log("Allowed origins:", ORIGIN_ALLOWLIST);
  console.log("Questions path:", QUESTIONS_PATH);
});
