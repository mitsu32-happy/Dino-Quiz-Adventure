// js/systems/battleClient.js
export function createBattleClient(options = {}) {
  if (!window.io) {
    throw new Error("Socket.IO client が見つかりません（window.io）。");
  }

  const serverUrl = options.serverUrl || "https://dino-quiz-battle-server.onrender.com";

  // 端末固定ID（同一端末が複数接続しても 1枠に固定）
  const STORAGE_KEY = "dino_quiz_battle_player_key_v1";
  let playerKey = localStorage.getItem(STORAGE_KEY);
  if (!playerKey) {
    playerKey = `pk_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
    localStorage.setItem(STORAGE_KEY, playerKey);
  }

  const socket = window.io(serverUrl, { transports: ["websocket"], withCredentials: true });

  const handlers = new Map();
  let lastRoom = null;

  const me = {
    clientId: null,
    roomId: null,
    isHost: false,
    playerKey,
  };

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
    for (const fn of set) fn(payload);
  }

  function buildProfile() {
    // 画面側から渡された最新状態を使う（名前/称号/アバター）
    const p = (options.getPlayerProfile && options.getPlayerProfile()) || options.playerProfile || {};
    const prof = { ...(p || {}) };

    // ✅ 必ず playerKey を載せる
    prof.playerKey = playerKey;

    // ✅ avatar.equipped が入っていない場合の保険（よくあるズレ）
    // - prof.avatarEquipped に入っててもOK
    // - prof.avatar.equipped に入っててもOK
    if (!prof.avatar) prof.avatar = {};
    if (!prof.avatar.equipped && prof.avatarEquipped) {
      prof.avatar.equipped = { ...(prof.avatarEquipped || {}) };
    }

    return prof;
  }

  socket.on("connect", () => {
    me.clientId = socket.id;
  });

  socket.on("room:update", (room) => {
    lastRoom = room;
    me.roomId = room?.roomId ?? me.roomId;
    me.isHost = !!(room?.hostClientId && me.clientId && room.hostClientId === me.clientId);
    emitLocal("room:update", room);
  });

  socket.on("room:closed", () => emitLocal("room:closed", {}));
  socket.on("game:event", (ev) => emitLocal("game:event", ev));

  async function createRoom() {
    const profile = buildProfile();
    return await new Promise((resolve) => {
      socket.emit("room:create", { profile }, (res) => {
        if (!res?.ok) return resolve(false);
        me.roomId = res.roomId;
        me.isHost = true;
        resolve(true);
      });
    });
  }

  async function joinRoom(roomId) {
    const rid = String(roomId || "").trim().toUpperCase();
    const profile = buildProfile();
    return await new Promise((resolve) => {
      socket.emit("room:join", { roomId: rid, profile }, (res) => resolve(!!res?.ok));
    });
  }

  function leaveRoom() {
    socket.emit("room:leave");
    me.roomId = null;
    me.isHost = false;
    lastRoom = null;
    return true;
  }

  function emitGameEvent(payload) {
    socket.emit("game:event", { ...(payload || {}), roomId: me.roomId });
  }

  return {
    socket,
    on,
    off,
    getMe: () => ({ ...me }),
    getState: () => ({ room: lastRoom }),
    createRoom,
    joinRoom,
    leaveRoom,
    emitGameEvent,
  };
}
