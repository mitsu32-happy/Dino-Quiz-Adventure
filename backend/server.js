// backend/server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { randomUUID } from "crypto";

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors({
  origin: [
    "https://mitsu32-happy.github.io",
  ],
  methods: ["GET", "POST"],
  credentials: true,
}));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://mitsu32-happy.github.io",
    methods: ["GET", "POST"],
  },
});

app.get("/", (req, res) => res.status(200).send("OK"));
app.get("/health", (req, res) => res.status(200).json({ ok: true }));


/**
 * rooms 構造
 * {
 *   roomId: {
 *     roomId,
 *     hostClientId,
 *     players: [{ clientId, profile }],
 *     game: {
 *       status: "lobby" | "playing" | "finished",
 *       questionIds: [],
 *       index: 0,
 *       answers: {},   // { [qIndex]: { [clientId]: { choiceIndex, timeMs } } }
 *       scores: {},    // { [clientId]: number }
 *     }
 *   }
 * }
 */
const rooms = new Map();

function emitRoomUpdate(room) {
  io.to(room.roomId).emit("room:update", {
    roomId: room.roomId,
    hostClientId: room.hostClientId,
    players: room.players,
  });
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
      players: [{ clientId: socket.id, profile }],
      game: createEmptyGame(),
    };

    rooms.set(roomId, room);
    socket.join(roomId);

    emitRoomUpdate(room);
    cb?.({ ok: true, roomId });
  });

  // ======================
  // ルーム参加
  // ======================
  socket.on("room:join", ({ roomId, profile }, cb) => {
    const room = rooms.get(roomId);
    if (!room) {
      cb?.({ ok: false, error: "ROOM_NOT_FOUND" });
      return;
    }
    if (room.players.length >= 4) {
      cb?.({ ok: false, error: "ROOM_FULL" });
      return;
    }

    room.players.push({ clientId: socket.id, profile });
    socket.join(roomId);

    emitRoomUpdate(room);
    cb?.({ ok: true });
  });

  // ======================
  // ルーム退出
  // ======================
  socket.on("room:leave", () => {
    for (const room of rooms.values()) {
      const idx = room.players.findIndex(p => p.clientId === socket.id);
      if (idx >= 0) {
        room.players.splice(idx, 1);

        // ホスト退出 → ルーム解散
        if (room.hostClientId === socket.id) {
          io.to(room.roomId).emit("room:closed");
          rooms.delete(room.roomId);
          return;
        }

        emitRoomUpdate(room);
        return;
      }
    }
  });

  // ======================
  // ゲームイベント
  // ======================
  socket.on("game:event", (ev) => {
    const room = rooms.get(ev?.roomId);
    if (!room) return;

    const game = room.game;

    // ---- ゲーム開始 ----
    if (ev.type === "game:begin") {
      if (socket.id !== room.hostClientId) return;

      game.status = "playing";
      game.questionIds = ev.questionIds;
      game.index = 0;
      game.answers = {};
      game.scores = {};
      room.players.forEach(p => game.scores[p.clientId] = 0);

      io.to(room.roomId).emit("game:event", {
        type: "game:begin",
        beginPayload: {
          roomId: room.roomId,
          hostClientId: room.hostClientId,
          players: room.players,
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

      // 二重回答防止
      if (game.answers[qIndex][socket.id]) return;

      game.answers[qIndex][socket.id] = {
        choiceIndex: ev.choiceIndex,
        timeMs: ev.timeMs,
      };

      io.to(room.roomId).emit("game:event", {
        type: "game:answer",
        clientId: socket.id,
        qIndex,
      });

      // 全員回答したら次へ
      if (Object.keys(game.answers[qIndex]).length >= room.players.length) {
        io.to(room.roomId).emit("game:event", {
          type: "game:questionEnd",
          qIndex,
          answers: game.answers[qIndex],
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
    }
  });

  // ======================
  // 切断
  // ======================
  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      const idx = room.players.findIndex(p => p.clientId === socket.id);
      if (idx >= 0) {
        room.players.splice(idx, 1);

        if (room.hostClientId === socket.id) {
          io.to(room.roomId).emit("room:closed");
          rooms.delete(room.roomId);
          return;
        }

        emitRoomUpdate(room);
        return;
      }
    }
  });
});

server.listen(PORT, () => {
  console.log("Battle server listening on", PORT);
});
