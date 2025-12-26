// backend/server.js
// 最小のオンライン対戦サーバ土台（Socket.IO + CORS + ヘルスチェック）
// 仕様: specs/battle_online_spec.md を前提（サーバ正）
// ※ ここでは「接続できること」確認が目的。対戦ロジックは後で段階的に追加。

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(express.json());

// Render等の環境で PORT が渡される前提。ローカルは 3001 に寄せる。
const PORT = process.env.PORT || 3001;

// CORS：開発中は広め。本番でGitHub PagesのURLが決まったら絞る。
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST"],
    credentials: true,
  })
);

// ヘルスチェック（Renderの疎通確認や監視用）
app.get("/health", (req, res) => {
  res.status(200).json({ ok: true, time: new Date().toISOString() });
});

const server = http.createServer(app);

// Socket.IO（同様にCORSは広め）
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// 接続確認用イベント
io.on("connection", (socket) => {
  console.log(`[socket] connected: ${socket.id}`);

  // クライアントに接続確認を返す
  socket.emit("server:hello", {
    socketId: socket.id,
    time: new Date().toISOString(),
  });

  // クライアント→サーバ疎通テスト
  socket.on("client:ping", (payload) => {
    socket.emit("server:pong", {
      received: payload ?? null,
      time: new Date().toISOString(),
    });
  });

  socket.on("disconnect", (reason) => {
    console.log(`[socket] disconnected: ${socket.id} reason=${reason}`);
  });
});

server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
