// backend/server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { randomUUID } from "crypto";

const PORT = process.env.PORT || 3001;

const ORIGIN_ALLOWLIST = [
  "https://mitsu32-happy.github.io",
  "https://mitsu32-happy.github.io/", // 末尾スラッシュ揺れ対策
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];

const app = express();
app.use(
  cors({
    origin: (origin, cb) => {
      // Render health check / curl等は origin が無いことがある
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
 * rooms 構造（サーバ内）
 * Map<roomId, room>
 *
 * room = {
 *   roomId,
 *   hostClientId,
 *   players: Map<clientId, { clientId, profile }>,
 *   game: {
 *     status: "lobby" | "playing" | "finished",
 *     questionIds: [],
 *     index: 0,
 *     answers: { [qIndex]: { [clientId]: { choiceIndex, timeMs } } },
 *     scores: { [clientId]: number },
 *   }
 * }
 */
const rooms = new Map();

function normalizeRoomId(roomId) {
  return String(roomId || "").trim().toUpperCase();
}

function createEmptyGame() {
  return {
    status: "lobby",
    questionIds: [],
    index: 0,
    answers: {},
    scores: {},
  };
}

function roomPlayersArray(room) {
  return Array.from(room.players.values());
}

function emitRoomUpdate(room) {
  io.to(room.roomId).emit("room:update", {
    roomId: room.roomId,
    hostClientId: room.hostClientId,
    players: roomPlayersArray(room),
  });
}

// 今の問題が「残っているプレイヤー全員」回答済みなら、questionEnd -> next/finished を進める
function maybeAdvance(room) {
  const game = room.game;
  if (!game || game.status !== "playing") return;

  const qIndex = game.index;
  const expectedClientIds = Array.from(room.players.keys());
  const expectedCount = expectedClientIds.length;

  if (!game.answers[qIndex]) game.answers[qIndex] = {};
  const ansMap = game.answers[qIndex];

  // 「残っているプレイヤー」分だけ回答が揃っているか
  let answeredCount = 0;
  for (const cid of expectedClientIds) {
    if (ansMap[cid]) answeredCount++;
  }

  if (expectedCount > 0 && answeredCount < expectedCount) return;

  // 全員分揃ったので questionEnd
  io.to(room.roomId).emit("game:event", {
    type: "game:questionEnd",
    qIndex,
    answers: ansMap,
  });

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

function removePlayerFromRoom(room, clientId) {
  if (!room.players.has(clientId)) return false;

  room.players.delete(clientId);

  // スコアは残しても良いが、残すと「途中退出者」が結果に出る可能性がある。
  // 表示はクライアント側で「現在のplayers」基準が多いので、ここでは残しても問題は少ない。
  // ただし、現在問題の回答待ちで止まりやすいので、再評価は必須。
  maybeAdvance(room);

  emitRoomUpdate(room);
  return true;
}

io.on("connection", (socket) => {
  console.log("connected:", socket.id);

  // ======================
  // ルーム作成
  // ======================
  socket.on("room:create", ({ profile }, cb) => {
    const roomId = randomUUID().slice(0, 6).toUpperCase();

    const room = {
      roomId,
      hostClientId: socket.id,
      players: new Map(),
      game: createEmptyGame(),
    };

    room.players.set(socket.id, { clientId: socket.id, profile: profile || {} });
    rooms.set(roomId, room);

    socket.data.roomId = roomId;
    socket.join(roomId);

    emitRoomUpdate(room);
    cb?.({ ok: true, roomId });
  });

  // ======================
  // ルーム参加（冪等）
  // ======================
  socket.on("room:join", ({ roomId, profile }, cb) => {
    const rid = normalizeRoomId(roomId);
    const room = rooms.get(rid);
    if (!room) {
      cb?.({ ok: false, error: "ROOM_NOT_FOUND" });
      return;
    }

    // 既に別ルームにいるなら先に抜ける（念のため）
    const prevRid = socket.data.roomId;
    if (prevRid && prevRid !== rid) {
      const prev = rooms.get(prevRid);
      if (prev) {
        socket.leave(prevRid);
        removePlayerFromRoom(prev, socket.id);
      }
      socket.data.roomId = null;
    }

    // ✅ すでに参加済みなら「上書き更新」してOK返す（重複pushを防ぐ）
    if (room.players.has(socket.id)) {
      room.players.set(socket.id, { clientId: socket.id, profile: profile || {} });
      socket.data.roomId = rid;
      socket.join(rid);
      emitRoomUpdate(room);
      cb?.({ ok: true });
      return;
    }

    // 満員チェック（未参加のときだけ）
    if (room.players.size >= 4) {
      cb?.({ ok: false, error: "ROOM_FULL" });
      return;
    }

    room.players.set(socket.id, { clientId: socket.id, profile: profile || {} });

    socket.data.roomId = rid;
    socket.join(rid);

    emitRoomUpdate(room);
    cb?.({ ok: true });
  });

  // ======================
  // ルーム退出
  // ======================
  socket.on("room:leave", () => {
    const rid = socket.data.roomId;

    if (rid) {
      const room = rooms.get(rid);
      socket.data.roomId = null;
      socket.leave(rid);

      if (!room) return;

      // ホスト退出 → ルーム解散
      if (room.hostClientId === socket.id) {
        io.to(room.roomId).emit("room:closed");
        rooms.delete(room.roomId);
        return;
      }

      removePlayerFromRoom(room, socket.id);
      return;
    }

    // フォールバック（万一 data が無い時）
    for (const room of rooms.values()) {
      if (room.players.has(socket.id)) {
        socket.leave(room.roomId);

        if (room.hostClientId === socket.id) {
          io.to(room.roomId).emit("room:closed");
          rooms.delete(room.roomId);
          return;
        }

        removePlayerFromRoom(room, socket.id);
        return;
      }
    }
  });

  // ======================
  // ゲームイベント
  // ======================
  socket.on("game:event", (ev) => {
    const rid = normalizeRoomId(ev?.roomId || socket.data.roomId);
    const room = rooms.get(rid);
    if (!room) return;

    // ルームのメンバー以外は無視（不正/古い接続対策）
    if (!room.players.has(socket.id)) return;

    const game = room.game;

    // ---- ゲーム開始 ----
    if (ev.type === "game:begin") {
      if (socket.id !== room.hostClientId) return;

      game.status = "playing";
      game.questionIds = Array.isArray(ev.questionIds) ? ev.questionIds : [];
      game.index = 0;
      game.answers = {};
      game.scores = {};

      for (const cid of room.players.keys()) game.scores[cid] = 0;

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

    // ---- 回答 ----
    if (ev.type === "game:answer") {
      if (game.status !== "playing") return;

      const qIndex = game.index;
      if (!game.answers[qIndex]) game.answers[qIndex] = {};
      const ansMap = game.answers[qIndex];

      // 二重回答防止（同一clientId）
      if (ansMap[socket.id]) return;

      ansMap[socket.id] = {
        choiceIndex: ev.choiceIndex,
        timeMs: ev.timeMs,
      };

      io.to(room.roomId).emit("game:event", {
        type: "game:answer",
        clientId: socket.id,
        qIndex,
      });

      // ✅ 残っているプレイヤー基準で進行
      maybeAdvance(room);
    }
  });

  // ======================
  // 切断
  // ======================
  socket.on("disconnect", () => {
    const rid = socket.data.roomId;
    socket.data.roomId = null;

    if (rid) {
      const room = rooms.get(rid);
      if (!room) return;

      if (room.hostClientId === socket.id) {
        io.to(room.roomId).emit("room:closed");
        rooms.delete(room.roomId);
        return;
      }

      removePlayerFromRoom(room, socket.id);
      return;
    }

    // フォールバック
    for (const room of rooms.values()) {
      if (room.players.has(socket.id)) {
        if (room.hostClientId === socket.id) {
          io.to(room.roomId).emit("room:closed");
          rooms.delete(room.roomId);
          return;
        }
        removePlayerFromRoom(room, socket.id);
        return;
      }
    }
  });
});

server.listen(PORT, () => {
  console.log("Battle server listening on", PORT);
});
