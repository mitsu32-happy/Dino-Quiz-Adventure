// js/systems/battleClient.js
// server.js（Render）とイベント名を完全に合わせる版

export function createBattleClient(options = {}) {
  const transport = options.transport || "local";
  let playerProfile = options.playerProfile || {};

  // Socket.IO client 必須
  if (!window.io) {
    throw new Error(
      "Socket.IO client が見つかりません（window.io）。index.html で socket.io-client を読み込んでください。"
    );
  }

  // serverUrl 決定
  let serverUrl = options.serverUrl;
  if (!serverUrl) {
    if (transport === "local") serverUrl = "http://localhost:3001";
    else {
      throw new Error(
        "online transport では options.serverUrl が必須です（例：https://dino-quiz-battle-server.onrender.com）。"
      );
    }
  }

  const socket = window.io(serverUrl, {
    transports: ["websocket"],
    withCredentials: true,
  });

  // ローカルイベント購読
  const handlers = new Map(); // type -> Set(fn)
  function on(type, fn) {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type).add(fn);
  }
  function off(type, fn) {
    handlers.get(type)?.delete(fn);
  }
  function emitLocal(type, payload) {
    const set = handlers.get(type);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch (e) {
        console.error("[battleClient] handler error", type, e);
      }
    }
  }

  // 状態
  let clientId = null;
  let roomId = null;
  let isHost = false;
  let lastRoomUpdate = null;

  // サーバ側の profile はそのまま表示されるので最低限整形
  function normalizeProfileForServer(p) {
    return {
      name: p?.name || "Player",
      titleName: p?.titleName ?? p?.title ?? p?.titleId ?? "—",
      avatar: p?.avatar ?? p?.avatarEquipped ?? p?.equippedAvatar ?? null,
      wins: Number.isFinite(Number(p?.pvpWins)) ? Number(p.pvpWins) : Number(p?.wins) || 0,
      losses: Number.isFinite(Number(p?.pvpLosses)) ? Number(p.pvpLosses) : Number(p?.losses) || 0,
    };
  }

  function withTimeout(promiseFactory, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      Promise.resolve()
        .then(promiseFactory)
        .then((v) => {
          clearTimeout(t);
          resolve(v);
        })
        .catch((e) => {
          clearTimeout(t);
          reject(e);
        });
    });
  }

  // ===== Socket.IO events（server.js と一致させる） =====

  socket.on("connect", () => {
    clientId = socket.id;
    emitLocal("conn:connected", { serverUrl, clientId });
  });

  socket.on("disconnect", (reason) => {
    emitLocal("conn:disconnected", { reason });
  });

  socket.on("connect_error", (err) => {
    console.error("[battleClient] connect_error", err);
    emitLocal("conn:error", { err });
  });

  // ✅ server.js は "room:update" を emit する
  socket.on("room:update", (p) => {
    lastRoomUpdate = p || null;
    if (p?.roomId) roomId = p.roomId;

    if (p?.hostClientId && clientId) {
      isHost = p.hostClientId === clientId;
    }
    emitLocal("room:update", p);
  });

  // ✅ server.js は "game:event" を emit する
  socket.on("game:event", (ev) => {
    emitLocal("game:event", ev);
  });

  // ✅ ルーム解散通知
  socket.on("room:closed", () => {
    lastRoomUpdate = null;
    roomId = null;
    isHost = false;
    emitLocal("room:closed", {});
  });

  // ===== Public API =====

  function updateProfile(nextProfile) {
    playerProfile = nextProfile || {};
  }

  function getState() {
    return { room: lastRoomUpdate };
  }

  function getMe() {
    return { clientId, roomId, isHost };
  }

  async function createRoom() {
    const profile = normalizeProfileForServer(playerProfile);

    return await withTimeout(
      () =>
        new Promise((resolve) => {
          socket.emit("room:create", { profile }, (res) => {
            if (!res?.ok || !res?.roomId) {
              console.error("[battleClient] room:create failed", res);
              resolve(null);
              return;
            }
            clientId = socket.id;
            roomId = res.roomId;
            isHost = true;
            resolve(roomId);
          });
        }),
      25000
    );
  }

  async function joinRoom(targetRoomId) {
    const profile = normalizeProfileForServer(playerProfile);
    const rid = String(targetRoomId || "").trim().toUpperCase();

    return await withTimeout(
      () =>
        new Promise((resolve) => {
          socket.emit("room:join", { roomId: rid, profile }, (res) => {
            if (!res?.ok) {
              console.error("[battleClient] room:join failed", res);
              resolve(false);
              return;
            }
            clientId = socket.id;
            roomId = rid;
            // isHost は room:update を受けた時点で判定される
            resolve(true);
          });
        }),
      25000
    );
  }

  // ✅ server.js の room:leave は ack を返さないので待たない
  async function leaveRoom() {
    try {
      socket.emit("room:leave");
    } catch (e) {
      console.error(e);
    }
    lastRoomUpdate = null;
    roomId = null;
    isHost = false;
    return true;
  }

  // ✅ server.js は "game:event" を受け取る
  function emitGameEvent(payload) {
    socket.emit("game:event", payload);
  }

  function sendAnswer({ index, choiceIndex, clientAnsweredAt }) {
    emitGameEvent({ type: "game:answer", index, choiceIndex, clientAnsweredAt });
  }

  return {
    socket,
    on,
    off,

    updateProfile,
    getState,
    getMe,

    createRoom,
    joinRoom,
    leaveRoom,

    emitGameEvent,
    sendAnswer,

    get clientId() {
      return clientId;
    },
  };
}
