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
  cors: {
    origin: ORIGIN_ALLOWLIST,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.get("/", (req, res) => res.status(200).send("OK"));
app.get("/health", (req, res) => res.status(200).json({ ok: true }));

/**
 * rooms:
 * Map<roomId, room>
 *
 * room = {
 *  roomId,
 *  hostClientId,
 *  players: Map<playerKey, { playerKey, clientId, profile }>,
 *  game: { status, questionIds, index, answers }
 * }
 *
 * answers[qIndex][playerKey] = { choiceIndex, answeredAtMs }
 */
const rooms = new Map();

function normalizeRoomId(roomId) {
  return String(roomId || "").trim().toUpperCase();
}

function normalizePlayerKey(profile, socketId) {
  const pk = profile?.playerKey;
  if (pk && String(pk).trim()) return String(pk).trim();
  // フォールバック（playerKeyが無い古いクライアント用）
  return `socket:${socketId}`;
}

function createEmptyGame() {
  return {
    status: "lobby",
    questionIds: [],
    index: 0,
    answers: {},
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

function ensureAnswerBucket(game, qIndex) {
  if (!game.answers[qIndex]) game.answers[qIndex] = {};
  return game.answers[qIndex];
}

// 残っているプレイヤー全員が回答済みなら次へ
function maybeAdvance(room) {
  const game = room.game;
  if (!game || game.status !== "playing") return;

  const qIndex = game.index;
  const expectedKeys = Array.from(room.players.keys());
  const expectedCount = expectedKeys.length;

  const ansMap = ensureAnswerBucket(game, qIndex);

  let answeredCount = 0;
  for (const pk of expectedKeys) {
    if (ansMap[pk]) answeredCount++;
  }

  if (expectedCount > 0 && answeredCount < expectedCount) return;

  io.to(room.roomId).emit("game:event", {
    type: "game:questionEnd",
    qIndex,
    answers: ansMap, // ここで全員分がクライアントに共有される（同期の要）
  });

  game.index++;

  if (game.index >= game.questionIds.length) {
    game.status = "finished";
    io.to(room.roomId).emit("game:event", { type: "game:finished" });
  } else {
    io.to(room.roomId).emit("game:event", { type: "game:next", index: game.index });
  }
}

function removeBySocket(room, socketId) {
  // playerKey で持ってるので、socketId一致のものを探して消す
  for (const [pk, p] of room.players.entries()) {
    if (p.clientId === socketId) {
      room.players.delete(pk);
      return true;
    }
  }
  return false;
}

io.on("connection", (socket) => {
  // 参加しているroomIdを保持
  socket.data.roomId = null;
  socket.data.playerKey = null;

  // ルーム作成
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
    socket.data.playerKey = playerKey;
    socket.join(roomId);

    emitRoomUpdate(room);
    cb?.({ ok: true, roomId });
  });

  // ルーム参加（冪等 + playerKeyで重複排除）
  socket.on("room:join", ({ roomId, profile }, cb) => {
    const rid = normalizeRoomId(roomId);
    const room = rooms.get(rid);
    if (!room) {
      cb?.({ ok: false, error: "ROOM_NOT_FOUND" });
      return;
    }

    const prof = profile || {};
    const playerKey = normalizePlayerKey(prof, socket.id);

    // 既に別roomにいたら抜ける
    if (socket.data.roomId && socket.data.roomId !== rid) {
      const prev = rooms.get(socket.data.roomId);
      if (prev) {
        socket.leave(socket.data.roomId);
        removeBySocket(prev, socket.id);
        emitRoomUpdate(prev);
        maybeAdvance(prev);
      }
      socket.data.roomId = null;
      socket.data.playerKey = null;
    }

    // 満員チェック：playerKeyが未参加のときだけ
    if (!room.players.has(playerKey) && room.players.size >= 4) {
      cb?.({ ok: false, error: "ROOM_FULL" });
      return;
    }

    // ✅ ここが肝：同一playerKeyなら上書き（増殖しない）
    room.players.set(playerKey, { playerKey, clientId: socket.id, profile: prof });

    socket.data.roomId = rid;
    socket.data.playerKey = playerKey;
    socket.join(rid);

    emitRoomUpdate(room);
    cb?.({ ok: true });
  });

  // 退出
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

    removeBySocket(room, socket.id);
    emitRoomUpdate(room);
    maybeAdvance(room);
  });

  // ゲームイベント
  socket.on("game:event", (ev) => {
    const rid = normalizeRoomId(ev?.roomId || socket.data.roomId);
    const room = rooms.get(rid);
    if (!room) return;

    // socketが現在roomにいるか（clientId一致のplayerがいるか）
    let myPlayerKey = null;
    for (const [pk, p] of room.players.entries()) {
      if (p.clientId === socket.id) {
        myPlayerKey = pk;
        break;
      }
    }
    if (!myPlayerKey) return;

    const game = room.game;

    if (ev.type === "game:begin") {
      if (socket.id !== room.hostClientId) return;

      game.status = "playing";
      game.questionIds = Array.isArray(ev.questionIds) ? ev.questionIds : [];
      game.index = 0;
      game.answers = {};

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

    if (ev.type === "game:answer") {
      if (game.status !== "playing") return;

      const qIndex = game.index;
      const ansMap = ensureAnswerBucket(game, qIndex);

      // 二重回答防止（playerKeyベース）
      if (ansMap[myPlayerKey]) return;

      ansMap[myPlayerKey] = {
        choiceIndex: ev.choiceIndex,
        answeredAtMs: Number(ev.answeredAtMs) || Date.now(),
      };

      // ✅ ここで全員に「回答が入った」通知（他者SEのトリガーに使える）
      io.to(room.roomId).emit("game:event", {
        type: "game:answer",
        qIndex,
        playerKey: myPlayerKey,
      });

      // ✅ 進行判定（全員揃ったら questionEnd / next）
      maybeAdvance(room);
    }
  });

  // 切断
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

    removeBySocket(room, socket.id);
    emitRoomUpdate(room);
    maybeAdvance(room);
  });
});

server.listen(PORT, () => {
  console.log("Battle server listening on", PORT);
});
