// js/systems/battleClient.js
export function createBattleClient(options = {}) {
  if (!window.io) {
    throw new Error(
      "Socket.IO client が見つかりません（window.io）。index.html で socket.io の script を読み込んでください。"
    );
  }

  // Render URL をここに入れてください（既に設定済みなら options.serverUrl で渡してOK）
  const defaultServerUrl = "https://dino-quiz-battle-server.onrender.com";
  const serverUrl = options.serverUrl || defaultServerUrl;

  // 端末固定ID（同一端末が複数接続しても1枠に固定するため）
  const STORAGE_KEY = "dino_quiz_battle_player_key_v1";
  let playerKey = localStorage.getItem(STORAGE_KEY);
  if (!playerKey) {
    playerKey = `pk_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
    localStorage.setItem(STORAGE_KEY, playerKey);
  }

  const playerProfile = options.playerProfile || {};

  const socket = window.io(serverUrl, {
    transports: ["websocket"],
    withCredentials: true,
  });

  const handlers = new Map(); // eventType -> Set(fn)

  let lastRoomUpdate = null;
  let me = {
    clientId: null,
    playerKey,
    roomId: null,
    isHost: false,
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

  socket.on("connect", () => {
    me.clientId = socket.id;
  });

  socket.on("room:update", (room) => {
    lastRoomUpdate = room;
    if (room?.roomId) me.roomId = room.roomId;
    if (room?.hostClientId && me.clientId) me.isHost = room.hostClientId === me.clientId;
    emitLocal("room:update", room);
  });

  socket.on("room:closed", () => {
    emitLocal("room:closed", {});
  });

  socket.on("game:event", (ev) => {
    emitLocal("game:event", ev);
  });

  async function createRoom() {
    const profile = { ...playerProfile, playerKey };
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
    const profile = { ...playerProfile, playerKey };
    return await new Promise((resolve) => {
      socket.emit("room:join", { roomId: rid, profile }, (res) => {
        resolve(!!res?.ok);
      });
    });
  }

  async function leaveRoom() {
    socket.emit("room:leave");
    me.roomId = null;
    me.isHost = false;
    lastRoomUpdate = null;
    return true;
  }

  function emitGameEvent(payload) {
    socket.emit("game:event", payload);
  }

  function sendAnswer({ choiceIndex, answeredAtMs }) {
    emitGameEvent({
      type: "game:answer",
      roomId: me.roomId,
      choiceIndex,
      answeredAtMs: answeredAtMs || Date.now(),
    });
  }

  return {
    socket,
    clientId: () => me.clientId,
    getMe: () => ({ ...me }),
    getState: () => ({ room: lastRoomUpdate }),
    on,
    off,
    createRoom,
    joinRoom,
    leaveRoom,
    emitGameEvent,
    sendAnswer,
  };
}
