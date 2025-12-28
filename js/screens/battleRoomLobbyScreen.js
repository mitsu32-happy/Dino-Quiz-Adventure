// js/screens/battleRoomLobbyScreen.js
import { playSe } from "../systems/audioManager.js";

const ROOT = new URL("../../", import.meta.url);
const asset = (p) => new URL(String(p || "").replace(/^\/+/, ""), ROOT).toString();

function pickRandomQuestionIds(masters, n = 10) {
  const map = masters?.questionById;
  const all = map ? Array.from(map.keys()) : [];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, Math.min(n, all.length));
}

function normalizePlayer(p) {
  if (!p) return null;
  const clientId = p.clientId ?? p.profile?.clientId ?? null;
  if (!clientId) return null;
  const profile = p.profile || p;
  return { clientId, profile };
}

// ✅ 重複排除して4枠に詰める
function playersToSlots(room) {
  const raw = Array.isArray(room?.players) ? room.players : [];
  const norm = raw.map(normalizePlayer).filter(Boolean);

  const seen = new Set();
  const uniq = [];
  for (const p of norm) {
    if (seen.has(p.clientId)) continue;
    seen.add(p.clientId);
    uniq.push(p);
  }

  const slots = [];
  for (let i = 0; i < 4; i++) slots.push(uniq[i] || null);
  return slots;
}

export function renderBattleRoomLobby({ state, goto }) {
  const bc = state.battleClient;

  let latestRoom = bc.getState()?.room || null;
  const me = bc.getMe();

  const displayRoomId = (me.roomId || latestRoom?.roomId || "");

  const html = `
    <div class="card"><div class="card-inner">
      <h2>ルーム待機</h2>
      <p class="notice">ルームID：<b id="roomIdText">${displayRoomId}</b></p>

      <div id="playerGrid" class="player-grid"></div>

      <div class="space"></div>

      <div class="row-btn">
        ${me.isHost ? `<button class="btn" id="startBtn">開始</button>` : ""}
        <button class="btn secondary" id="leaveBtn">${me.isHost ? "ルームを解散" : "退出"}</button>
      </div>
    </div></div>

    <style>
      .player-grid{ display:grid; grid-template-columns:repeat(2, 1fr); gap:10px; }
      .player-box{
        border:2px solid rgba(0,0,0,.15); border-radius:16px;
        padding:10px; background:rgba(255,255,255,.8);
        min-height:110px;
      }
      .player-box.empty{ opacity:.55; display:flex; align-items:center; justify-content:center; font-weight:900; }
      .player-name{ font-weight:1000; text-align:center; margin-bottom:6px; }
      .player-title{ font-size:12px; opacity:.85; text-align:center; }
      .row-btn{ display:flex; gap:10px; }
      .row-btn .btn{ width:100%; }
      .notice{ font-size: 13px; }
    </style>
  `;

  setTimeout(() => {
    const grid = document.getElementById("playerGrid");
    const roomIdEl = document.getElementById("roomIdText");

    function renderRoom(room) {
      if (!grid) return;
      latestRoom = room || latestRoom;

      const rid = (bc.getMe().roomId || latestRoom?.roomId || "");
      if (roomIdEl) roomIdEl.textContent = rid;

      const slots = playersToSlots(latestRoom);

      grid.innerHTML = "";
      for (let i = 0; i < 4; i++) {
        const p = slots[i];
        if (!p) {
          grid.innerHTML += `<div class="player-box empty">空き</div>`;
          continue;
        }
        const prof = p.profile || {};
        const name = prof.name ?? "Player";
        const title = prof.titleName ?? "—";
        grid.innerHTML += `
          <div class="player-box">
            <div class="player-name">${name}</div>
            <div class="player-title">${title}</div>
          </div>
        `;
      }
    }

    renderRoom(latestRoom);

    // ✅ 多重購読防止
    if (!state.__lobbySubscribed) {
      state.__lobbySubscribed = true;
      state.__lobbyOnRoomUpdate = (room) => renderRoom(room);
      bc.on("room:update", state.__lobbyOnRoomUpdate);
      state.__lobbyOnClosed = () => {
        alert("ルームが解散されました。");
        goto("#battle");
      };
      bc.on("room:closed", state.__lobbyOnClosed);
    }

    document.getElementById("startBtn")?.addEventListener("click", () => {
      if (!latestRoom) return;
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.9 });

      const questionIds = pickRandomQuestionIds(state.masters, 10);
      bc.emitGameEvent({ type: "game:begin", roomId: latestRoom.roomId, questionIds });
      goto(`#battleQuiz?i=0&t=${Date.now()}`);
    });

    document.getElementById("leaveBtn")?.addEventListener("click", async () => {
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.9 });
      await bc.leaveRoom();
      // 次回入場のために購読フラグも解除
      state.__lobbySubscribed = false;
      goto("#battle");
    });
  }, 0);

  return html;
}
