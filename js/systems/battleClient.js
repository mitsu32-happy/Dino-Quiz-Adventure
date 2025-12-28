// js/systems/battleClient.js
export function createBattleClient(options = {}) {
  const transport = options.transport || "local";
  let playerProfile = options.playerProfile || {};

  if (!window.io) {
    throw new Error(
      "Socket.IO client が見つかりません（window.io）。index.html で socket.io の script を読み込んでください。"
    );
  }

  const serverUrl =
    options.serverUrl ||
    (transport === "local" ? "http://localhost:3001" : window.location.origin);

  const socket = window.io(serverUrl, {
    transports: ["websocket"],
    withCredentials: true,
  });

  const handlers = new Map(); // type -> Set(fn)
  let clientId = null;
  let roomId = null;
  let isHost = false;

  // ★最新状態を保持（ゲストが「表示されない」対策）
  let lastRoomUpdate = null;

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
      try { fn(payload); } catch (e) { console.error("[battleClient] handler error", type, e); }
    }
  }

  function normalizeProfileForServer(p) {
    // server.js sanitizeProfile に合わせる
    return {
      name: p?.name || "Player",
      titleName: p?.titleName || p?.title || p?.titleId || "—",
      avatar: p?.avatar || p?.avatarEquipped || p?.equippedAvatar || null,
      wins: Number.isFinite(Number(p?.pvpWins)) ? Number(p.pvpWins) : Number(p?.wins) || 0,
      losses: Number.isFinite(Number(p?.pvpLosses)) ? Number(p.pvpLosses) : Number(p?.losses) || 0,
    };
  }

  // ---- socket events ----
  socket.on("server:hello", (p) => {
    clientId = p?.clientId || socket.id;
  });

  socket.on("server:roomUpdate", (p) => {
    lastRoomUpdate = p || null;
    roomId = p?.roomId ?? roomId;

    if (p?.hostClientId && clientId) isHost = p.hostClientId === clientId;

    emitLocal("room:update", p);
  });

  socket.on("server:gameEvent", (ev) => {
    emitLocal("game:event", ev);
  });

  socket.on("connect_error", (err) => {
    console.error("[battleClient] connect_error", err);
  });

  // ---- public api ----
  function updateProfile(nextProfile) {
    playerProfile = nextProfile || {};
  }

  function getState() {
    return {
      room: lastRoomUpdate, // {roomId, hostClientId, players:[...]}
    };
  }

  async function createRoom() {
    const profile = normalizeProfileForServer(playerProfile);

    return await new Promise((resolve) => {
      socket.emit("room:create", { profile }, (res) => {
        if (!res?.ok) {
          console.error("[battleClient] room:create failed", res);
          resolve(null);
          return;
        }
        clientId = res.clientId || clientId;
        roomId = res.roomId;
        isHost = true;
        resolve(roomId);
      });
    });
  }

  async function joinRoom(targetRoomId) {
    const profile = normalizeProfileForServer(playerProfile);
    const rid = String(targetRoomId || "").trim().toUpperCase();

    return await new Promise((resolve) => {
      socket.emit("room:join", { roomId: rid, profile }, (res) => {
        if (!res?.ok) {
          console.error("[battleClient] room:join failed", res);
          resolve(false);
          return;
        }
        clientId = res.clientId || clientId;
        roomId = res.roomId;
        resolve(true);
      });
    });
  }

  async function leaveRoom() {
    return await new Promise((resolve) => {
      socket.emit("room:leave", null, (res) => {
        roomId = null;
        isHost = false;
        lastRoomUpdate = null;
        resolve(!!res?.ok);
      });
    });
  }

  function emitGameEvent(payload) {
    socket.emit("client:gameEvent", payload);
  }

  function sendAnswer({ index, choiceIndex, clientAnsweredAt }) {
    emitGameEvent({ type: "game:answer", index, choiceIndex, clientAnsweredAt });
  }

  function getMe() {
    return { clientId, roomId, isHost };
  }

  return {
    socket,
    on,
    off,

    updateProfile,
    getState,

    createRoom,
    joinRoom,
    leaveRoom,

    emitGameEvent,
    sendAnswer,
    getMe,

    get clientId() { return clientId; },
  };
}
