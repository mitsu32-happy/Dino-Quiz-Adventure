// js/screens/battleResultScreen.js
import { saveNow } from "../systems/saveManager.js";
import { unlockTitlesIfAny, getEquippedTitle } from "../systems/titleManager.js";

const ROOT = new URL("../../", import.meta.url);
const asset = (p) => new URL(String(p || "").replace(/^\/+/, ""), ROOT).toString();

function safe(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
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

function coinRewardByRank(rank) {
  if (rank === 1) return 30;
  if (rank === 2) return 20;
  if (rank === 3) return 10;
  return 0;
}

// --- avatar helpers (id / item_id 両対応) ---
function getAvatarItems(masters) {
  return masters?.avatar_items || masters?.avatarItems || masters?.avatarItemsMaster || [];
}
function getItemKey(it) {
  return String(it?.item_id ?? it?.id ?? "");
}
function getItemById(items, id) {
  if (!id || !Array.isArray(items)) return null;
  const s = String(id);
  return items.find((it) => getItemKey(it) === s) || null;
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

export function renderBattleResult({ state, goto }) {
  const run = state.currentRun;
  const save = state.save;
  const masters = state.masters;

  if (!run || (run.mode !== "battle_cpu" && run.mode !== "battle_online_local") || !run.result) {
    return `
      <div class="card"><div class="card-inner">
        <h2 style="margin:0 0 8px;">結果がありません</h2>
        <div class="notice">対戦を開始してください。</div>
        <div class="space"></div>
        <a class="btn" href="#battle">対戦へ</a>
      </div></div>
    `;
  }

  if (!save.battle) save.battle = { cpu: { wins: 0, losses: 0 }, pvp: { wins: 0, losses: 0 } };
  if (!save.battle.cpu) save.battle.cpu = { wins: 0, losses: 0 };
  if (!save.battle.pvp) save.battle.pvp = { wins: 0, losses: 0 };
  if (!save.economy) save.economy = { coins: 0 };

  const isOnline = run.mode === "battle_online_local";
  const activeCount = Math.min(4, Array.isArray(run.players) ? run.players.length : 0);

  let myPi = 0;
  if (isOnline && run.online?.myClientId) {
    const map = run.online.clientIdToPi || {};
    const v = map[run.online.myClientId];
    if (Number.isFinite(Number(v))) myPi = Number(v);
  }

  const rows = run.result.rows || [];
  const myRow = rows.find((r) => Number(r.pi) === Number(myPi));
  const myRank = myRow?.rank ?? 99;
  const reward = coinRewardByRank(myRank);

  const battleKey = isOnline ? "pvp" : "cpu";

  if (!run._resultApplied) {
    save.economy.coins = safe(save.economy.coins) + reward;

    if (myRank === 1) save.battle[battleKey].wins = safe(save.battle[battleKey].wins) + 1;
    else save.battle[battleKey].losses = safe(save.battle[battleKey].losses) + 1;

    unlockTitlesIfAny(masters, save);
    saveNow(save);
    run._resultApplied = true;
  }

  const equippedTitle = getEquippedTitle(masters, save);

  function wlFor(pi) {
    if (isOnline) {
      const p = run.players?.[pi]?.profile;
      if (pi === myPi) {
        const wl = save.battle.pvp;
        return `${safe(wl.wins)}勝 ${safe(wl.losses)}敗`;
      }
      return `${safe(p?.pvpWins)}勝 ${safe(p?.pvpLosses)}敗`;
    } else {
      if (pi === 0) return `${safe(save.battle.cpu.wins)}勝 ${safe(save.battle.cpu.losses)}敗`;
      const p = run.players?.[pi];
      return `${safe(p?.wins)}勝 ${safe(p?.losses)}敗`;
    }
  }

  function nameFor(pi) {
    if (!isOnline && pi === 0) return save.playerName ?? "みっつー";
    return run.players?.[pi]?.profile?.name ?? run.players?.[pi]?.name ?? `P${pi + 1}`;
  }

  function titleFor(pi) {
    if (!isOnline && pi === 0) return equippedTitle?.name ?? "—";

    const raw =
      run.players?.[pi]?.profile?.titleName ??
      run.players?.[pi]?.profile?.title ??
      run.players?.[pi]?.profile?.titleId ??
      run.players?.[pi]?.titleName ??
      run.players?.[pi]?.title ??
      run.players?.[pi]?.titleId ??
      "—";

    return resolveTitleJa(masters, raw);
  }

  function avatarMiniFor(pi) {
    const items = getAvatarItems(masters);

    const eq =
      (pi === myPi ? resolveEquippedFromAny(save?.avatar?.equipped) : null) ||
      resolveEquippedFromAny(run.players?.[pi]?.profile?.avatar?.equipped) ||
      resolveEquippedFromAny(run.players?.[pi]?.profile?.avatarEquipped) ||
      resolveEquippedFromAny(run.players?.[pi]?.avatar?.equipped) ||
      resolveEquippedFromAny(run.players?.[pi]?.avatarEquipped);

    if (!eq) return `<div class="avatar-mini-fallback">🧑</div>`;

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

    return `
      <div class="avatar-mini">
        ${bodyImg || `<div class="avatar-mini-fallback">🧑</div>`}
        ${headImg}
      </div>
    `;
  }

  const tableRows = rows
    .slice(0, activeCount)
    .map((r) => {
      const pi = Number(r.pi);
      const rank = Number(r.rank);
      const score = safe(r.score);
      const correct = safe(r.correct);
      const wl = wlFor(pi);
      const coin = coinRewardByRank(rank);

      return `
        <tr class="${pi === myPi ? "me" : ""}">
          <td class="rank">${rank}位</td>
          <td class="av">${avatarMiniFor(pi)}</td>
          <td class="name">${nameFor(pi)}</td>
          <td class="title">${titleFor(pi)}</td>
          <td class="pt">${score}pt</td>
          <td class="correct">${correct}問</td>
          <td class="wl">${wl}</td>
          <td class="coin">+${coin}</td>
        </tr>
      `;
    })
    .join("");

  const html = `
    <div class="card"><div class="card-inner">
      <h2 style="margin:0 0 10px;">順位発表</h2>

      <div class="space"></div>

      <div style="overflow:auto;">
        <table class="result-table">
          <thead>
            <tr>
              <th>順位</th>
              <th></th>
              <th>名前</th>
              <th>称号</th>
              <th>獲得pt</th>
              <th>正解数</th>
              <th>勝敗数</th>
              <th>獲得コイン</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>

      <div class="space"></div>

      <div class="notice">
        あなたの獲得コイン：<b>+${reward}</b>（所持：${safe(save.economy.coins)}）
      </div>

      <div class="space"></div>

      <div class="row-btn">
        <button id="toBattleBtn" class="btn">対戦へ戻る</button>
        <button id="toHomeBtn" class="btn secondary">ホームへ</button>
      </div>
    </div></div>

    <style>
      .result-table{
        width:100%;
        border-collapse:separate;
        border-spacing:0;
        background:#fff;
        border:2px solid rgba(0,0,0,.12);
        border-radius:12px;
        overflow:hidden;
        font-size:13px;
        min-width:760px;
      }
      .result-table th, .result-table td{
        padding:10px 8px;
        border-bottom:1px solid rgba(0,0,0,.08);
        text-align:center;
        white-space:nowrap;
      }
      .result-table thead th{
        background:rgba(0,0,0,.03);
        font-weight:1000;
      }
      .result-table tbody tr.me{
        background: rgba(255, 235, 180, .35);
      }
      .result-table td.name, .result-table td.title{
        text-align:left;
      }
      .result-table td.av{ width:54px; }

      .avatar-mini{
        position:relative;
        width:40px; height:40px;
        margin:0 auto;
        border-radius:10px;
        background:rgba(0,0,0,.06);
        overflow:hidden;
      }
      .avatar-mini .mini-layer{
        position:absolute;
        left:50%; top:50%;
        transform:translate(-50%,-50%);
        width:40px; height:40px;
        object-fit:contain;
        pointer-events:none;
      }
      .avatar-mini-fallback{
        width:40px; height:40px;
        display:flex; align-items:center; justify-content:center;
        font-weight:1000;
      }

      .row-btn{ display:flex; gap:10px; }
      .row-btn .btn{ flex:1; }
    </style>
  `;

  setTimeout(() => {
    document.getElementById("toBattleBtn")?.addEventListener("click", () => {
      state.currentRun = null;
      goto("#battle");
    });
    document.getElementById("toHomeBtn")?.addEventListener("click", () => {
      state.currentRun = null;
      goto("#home");
    });
  }, 0);

  return html;
}
