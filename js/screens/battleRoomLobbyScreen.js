// js/screens/battleRoomLobbyScreen.js
import { playBgm, playSe } from "../systems/audioManager.js";

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

function resolveTitleJa(masters, maybeIdOrName) {
  const v = (maybeIdOrName ?? "—").toString();
  const list = masters?.titles;
  if (!Array.isArray(list)) return v;

  const hit = list.find((t) => {
    const id = (t?.id ?? t?.title_id ?? t?.titleId ?? t?.key ?? t?.code ?? "").toString();
    const name = (t?.name ?? t?.title_name ?? t?.titleName ?? "").toString();
    return id === v || name === v;
  });

  const name =
    hit?.name ??
    hit?.title_name ??
    hit?.titleName ??
    hit?.title_name_ja ??
    hit?.name_ja ??
    null;

  return name ? String(name) : v;
}

// --- avatar helpers (id / item_id 両対応) ---
function getAvatarItems(masters) {
  return masters?.avatarItems || masters?.avatar_items || masters?.avatarItemsMaster || [];
}
function getItemKey(it) {
  return String(it?.item_id ?? it?.id ?? "");
}
function getItemById(items, id) {
  if (!id || !Array.isArray(items)) return null;
  const s = String(id);
  return items.find((x) => getItemKey(x) === s) || null;
}
function getItemAssetPath(item) {
  if (!item) return "";
  return (
    item.asset_path ||
    item.assetPath ||
    item.path ||
    item.image ||
    item.imagePath ||
    item.iconPath ||
    item.src ||
    ""
  );
}
function resolveEquippedFromAny(obj) {
  if (!obj) return null;
  if (obj.equipped && typeof obj.equipped === "object") return obj.equipped;
  if (typeof obj.body !== "undefined" || typeof obj.head !== "undefined") return obj;
  if (obj.avatar) return resolveEquippedFromAny(obj.avatar);
  if (obj.profile) return resolveEquippedFromAny(obj.profile);
  return null;
}

function normalizePlayer(p) {
  if (!p) return null;
  const prof = p.profile || p;
  return {
    clientId: p.clientId || prof.clientId || null,
    profile: {
      name: prof.name ?? "PLAYER",
      titleName: prof.titleName ?? prof.title ?? prof.titleId ?? "—",
      wins: Number(prof.wins ?? 0),
      losses: Number(prof.losses ?? 0),
      avatar: prof.avatar ?? null,
      avatarEquipped: prof.avatarEquipped ?? null,
    },
  };
}

function buildOnlineRun({ roomId, hostClientId, myClientId, players, questionIds }) {
  const run = {
    mode: "battle_online_local",
    roomId,
    hostClientId,
    players,
    questionIds,
    index: 0,
    points: [0, 0, 0, 0],
    correctCounts: [0, 0, 0, 0],
    correctTimeSum: [0, 0, 0, 0],
    answers: [],
    online: {
      roomId,
      hostClientId,
      myClientId,
      isHost: hostClientId === myClientId,
      clientIdToPi: {},
      sync: {
        qIndex: 0,
        startAtMs: 0,
        answersByIndex: {},
        lastResultIndex: -1,
      },
    },
  };
  players.forEach((pp, i) => {
    if (pp?.clientId) run.online.clientIdToPi[pp.clientId] = i;
  });
  return run;
}

export function renderBattleRoomLobby({ state, goto }) {
  const bc = state.battleClient;
  const me = bc.getMe();
  const roomId = me.roomId ?? "";

  let latestRoom = bc.getState()?.room || null;

  const html = `
    <div class="card"><div class="card-inner">
      <h2>ルーム待機</h2>
      <p class="notice">ルームID：<b>${roomId}</b></p>

      <div id="playerGrid" class="player-grid"></div>

      <div class="space"></div>

      <div class="row-btn">
        ${me.isHost ? `<button class="btn" id="startBtn">開始</button>` : ""}
        <button class="btn secondary" id="leaveBtn">${me.isHost ? "ルームを解散" : "退出"}</button>
      </div>
    </div></div>

    <style>
      .player-grid{
        display:grid;
        grid-template-columns:repeat(4, minmax(0, 1fr));
        gap:8px;
        margin-top:10px;
      }

      .player-box{
        background:#fff;
        border:2px solid rgba(0,0,0,.15);
        border-radius:12px;
        padding:8px 6px;
        text-align:center;
        font-size:12px;
      }
      .player-box.empty{ opacity:.4; display:flex; align-items:center; justify-content:center; }

      .player-name{
        font-weight:900;
        font-size: clamp(11px, 3.0vw, 14px);
        text-align:center;
      }
      .player-title{
        font-size: clamp(10px, 2.6vw, 12px);
        opacity:.85;
        margin-top:2px;
        text-align:center;
      }
      .player-wl{
        font-size:11px;
        opacity:.8;
        margin-top:2px;
        text-align:center;
        white-space:nowrap;
      }

      .player-avatar{
        --av: clamp(36px, 10vw, 44px);
        width: var(--av);
        height: var(--av);
        margin:6px auto 0;
        border-radius:10px;
        background:rgba(0,0,0,.06);
        display:flex;
        align-items:center;
        justify-content:center;
        overflow:hidden;
        position:relative;
      }
      .player-avatar .mini-layer{
        position:absolute;
        left:50%;
        top:50%;
        transform:translate(-50%,-50%);
        width: var(--av);
        height: var(--av);
        object-fit:contain;
        pointer-events:none;
      }
      .player-avatar .fallback{
        width: var(--av);
        height: var(--av);
        display:flex;
        align-items:center;
        justify-content:center;
        font-weight:1000;
      }

      .row-btn{ display:flex; gap:10px; }
      .row-btn .btn{ flex:1; }

      @media (max-width: 360px){
        .player-grid{ gap:6px; }
        .player-box{ padding:7px 5px; }
      }
    </style>
  `;

  function renderAvatarMini(prof) {
    const items = getAvatarItems(state.masters);

    // 1) equipped優先（id / item_id 両対応で検索）
    const eq =
      resolveEquippedFromAny(prof?.avatar?.equipped) ||
      resolveEquippedFromAny(prof?.avatarEquipped) ||
      resolveEquippedFromAny(prof?.avatar);

    if (eq) {
      const bodyItem = getItemById(items, eq.body);
      const headItem = getItemById(items, eq.head);

      const bodyPath = getItemAssetPath(bodyItem);
      const headPath = getItemAssetPath(headItem);

      const bodyImg = bodyPath
        ? `<img class="mini-layer" src="${asset(bodyPath)}" alt="" onerror="this.style.opacity=0.25">`
        : "";
      const headImg = headPath
        ? `<img class="mini-layer" src="${asset(headPath)}" alt="" onerror="this.style.opacity=0.25">`
        : "";

      if (bodyImg || headImg) return `${bodyImg || `<div class="fallback">🧑</div>`}${headImg}`;
    }

    // 2) iconPath/文字列パスの旧形式
    if (typeof prof?.avatar === "string" && prof.avatar.trim()) {
      return `<img class="mini-layer" src="${asset(prof.avatar)}" alt="" onerror="this.style.opacity=0.25">`;
    }
    if (prof?.avatar && typeof prof.avatar === "object" && typeof prof.avatar.iconPath === "string") {
      return `<img class="mini-layer" src="${asset(prof.avatar.iconPath)}" alt="" onerror="this.style.opacity=0.25">`;
    }

    return `<div class="fallback">🧑</div>`;
  }

  function renderPlayersFromRoom(room) {
    const grid = document.getElementById("playerGrid");
    if (!grid) return;

    const raw = room?.players || [];
    const normalized = raw.map(normalizePlayer).filter(Boolean);

    const slots = [];
    for (let i = 0; i < 4; i++) slots.push(normalized[i] || null);

    grid.innerHTML = "";
    for (let i = 0; i < 4; i++) {
      const p = slots[i];
      if (!p) {
        grid.innerHTML += `<div class="player-box empty">空き</div>`;
        continue;
      }
      const prof = p.profile;

      const titleJa = resolveTitleJa(state.masters, prof.titleName);

      grid.innerHTML += `
        <div class="player-box">
          <div class="player-name">${prof.name ?? "PLAYER"}</div>
          <div class="player-avatar">${renderAvatarMini(prof)}</div>
          <div class="player-title">${titleJa}</div>
          <div class="player-wl">${prof.wins ?? 0}勝 ${prof.losses ?? 0}敗</div>
        </div>
      `;
    }
  }

  setTimeout(() => {
    playBgm("assets/sounds/bgm/bgm_main.mp3");

    renderPlayersFromRoom(latestRoom);

    bc.on("room:update", (room) => {
      latestRoom = room;
      renderPlayersFromRoom(room);
    });

    bc.on("game:event", (ev) => {
      if (ev?.type !== "game:begin") return;

      const begin = ev.beginPayload;
      const players = (begin.players || []).map(normalizePlayer).filter(Boolean);
      const questionIds = begin.questionIds || [];

      state.currentRun = buildOnlineRun({
        roomId: begin.roomId,
        hostClientId: begin.hostClientId,
        myClientId: bc.clientId,
        players,
        questionIds,
      });

      goto(`#battleQuiz?i=0&t=${Date.now()}`);
    });

    document.getElementById("leaveBtn")?.addEventListener("click", async () => {
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.9 });
      await bc.leaveRoom();
      goto("#battle");
    });

    document.getElementById("startBtn")?.addEventListener("click", () => {
      if (!latestRoom) return;

      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.9 });

      const beginPayload = {
        roomId: latestRoom.roomId,
        hostClientId: latestRoom.hostClientId,
        players: latestRoom.players,
        questionIds: pickRandomQuestionIds(state.masters, 10),
      };

      bc.emitGameEvent({ type: "game:begin", beginPayload });
    });
  }, 0);

  return html;
}
