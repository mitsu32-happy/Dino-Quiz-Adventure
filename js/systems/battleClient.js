// js/systems/battleClient.js
export function createBattleClient(options = {}) {
  const transport = options.transport || "local";
  let playerProfile = options.playerProfile || {};

  if (!window.io) {
    throw new Error(
      "Socket.IO client が見つかりません（window.io）。index.html で socket.io-client を読み込んでください。"
    );
  }

  let serverUrl = options.serverUrl;
  if (!serverUrl) {
    if (transport === "local") serverUrl = "http://localhost:3001";
    else throw new Error("online transport では options.serverUrl が必須です。");
  }

  const socket = window.io(serverUrl, { transports: ["websocket"], withCredentials: true });

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
      try { fn(payload); } catch (e) { console.error("[battleClient]", type, e); }
    }
  }

  let clientId = null;
  let roomId = null;
  let isHost = false;
  let lastRoomUpdate = null;

  function normalizeProfile(p) {
    return {
      name: p?.name || "Player",
      titleName: p?.titleName ?? p?.title ?? p?.titleId ?? "—",
      // できれば {body, head} をそのまま渡す（表示側で拾える）
      avatar: p?.avatar ?? p?.avatarEquipped ?? p?.equippedAvatar ?? null,
      wins: Number.isFinite(Number(p?.pvpWins)) ? Number(p.pvpWins) : Number(p?.wins) || 0,
      losses: Number.isFinite(Number(p?.pvpLosses)) ? Number(p.pvpLosses) : Number(p?.losses) || 0,
    };
  }

  function withTimeout(factory, ms = 25000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), ms);
      Promise.resolve().then(factory).then((v) => { clearTimeout(t); resolve(v); })
        .catch((e) => { clearTimeout(t); reject(e); });
    });
  }

  // ===== server.js と一致 =====
  socket.on("connect", () => {
    clientId = socket.id;
    emitLocal("conn:connected", { clientId, serverUrl });
  });

  socket.on("disconnect", (reason) => {
    emitLocal("conn:disconnected", { reason });
  });

  socket.on("connect_error", (err) => {
    emitLocal("conn:error", { err });
  });

  socket.on("room:update", (room) => {
    lastRoomUpdate = room || null;
    if (room?.roomId) roomId = room.roomId;
    if (room?.hostClientId && clientId) isHost = room.hostClientId === clientId;
    emitLocal("room:update", room);
  });

  socket.on("room:closed", () => {
    lastRoomUpdate = null;
    roomId = null;
    isHost = false;
    emitLocal("room:closed", {});
  });

  socket.on("game:event", (ev) => {
    emitLocal("game:event", ev);
  });

  function updateProfile(next) {
    playerProfile = next || {};
  }

  function getState() {
    return { room: lastRoomUpdate };
  }

  function getMe() {
    return { clientId, roomId, isHost };
  }

  async function createRoom() {
    const profile = normalizeProfile(playerProfile);
    return await withTimeout(
      () =>
        new Promise((resolve) => {
          socket.emit("room:create", { profile }, (res) => {
            if (!res?.ok || !res?.roomId) return resolve(null);
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
    const profile = normalizeProfile(playerProfile);
    const rid = String(targetRoomId || "").trim().toUpperCase();
    return await withTimeout(
      () =>
        new Promise((resolve) => {
          socket.emit("room:join", { roomId: rid, profile }, (res) => {
            if (!res?.ok) return resolve(false);
            clientId = socket.id;
            roomId = rid; // ✅ ゲスト側でも表示できるように保持
            resolve(true);
          });
        }),
      25000
    );
  }

  // server.js は room:leave ack を返さないので待たない
  async function leaveRoom() {
    try { socket.emit("room:leave"); } catch (e) { console.error(e); }
    lastRoomUpdate = null;
    roomId = null;
    isHost = false;
    return true;
  }

  // ✅ roomId自動付与（server.js が rooms.get(ev.roomId) するため必須）
  function emitGameEvent(payload) {
    const p = (payload && typeof payload === "object") ? { ...payload } : payload;
    if (p && typeof p === "object") {
      if (!p.roomId && roomId) p.roomId = roomId;
    }
    socket.emit("game:event", p);
  }

  // ✅ server.js が期待する game:answer 形式
  function sendAnswer({ choiceIndex, timeMs }) {
    emitGameEvent({ type: "game:answer", choiceIndex, timeMs });
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
    get clientId() { return clientId; },
  };
}
