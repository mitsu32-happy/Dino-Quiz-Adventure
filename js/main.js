import { loadAllMasters } from "./systems/dataLoader.js";
import { ensureSaveLoaded } from "./systems/saveManager.js";
import { playBgm, stopBgm, initAudio } from "./systems/audioManager.js";

import { renderTop } from "./screens/topScreen.js";
import { renderHome } from "./screens/homeScreen.js";
import { renderQuiz } from "./screens/quizScreen.js";
import { renderResult } from "./screens/resultScreen.js";

import { renderPlaceholder } from "./screens/placeholderScreen.js";
import { renderOptions } from "./screens/optionsScreen.js";
import { renderAvatar } from "./screens/avatarScreen.js";

import { renderGacha } from "./screens/gachaScreen.js";
import { renderGachaDraw } from "./screens/gachaDrawScreen.js";

import { renderTimeAttack } from "./screens/timeAttackScreen.js";
import { renderEndless } from "./screens/endlessScreen.js";

// ===== Battle =====
import { renderBattleMenu } from "./screens/battleMenuScreen.js";
import { renderBattleCpuSetup } from "./screens/battleCpuSetupScreen.js";
import { renderBattleQuiz } from "./screens/battleQuizScreen.js";
import { renderBattleResult } from "./screens/battleResultScreen.js";

// ★ 追加（オンライン対戦）
import { renderBattleRoomCreate } from "./screens/battleRoomCreateScreen.js";
import { renderBattleRoomJoin } from "./screens/battleRoomJoinScreen.js";
import { renderBattleRoomLobby } from "./screens/battleRoomLobbyScreen.js";

const appEl = document.getElementById("app");

const state = {
  masters: null,
  save: null,
  currentRun: null,
  timeAttackRun: null,
  endlessRun: null,

  // オンライン対戦用
  battleClient: null,
  currentRoomId: null,
};

function setView(html) {
  appEl.innerHTML = html;
}

function parseHash() {
  const hash = location.hash || "#top";
  const [path, query] = hash.replace(/^#/, "").split("?");
  const parts = String(path || "top").split("/").filter(Boolean);

  const params = {};
  if (query) {
    for (const kv of query.split("&")) {
      const [k, v] = kv.split("=");
      if (!k) continue;
      params[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
    }
  }
  return { parts, params };
}

/**
 * ✅ 重要：同じhashへgotoしても再描画されるようにする
 * - home: モーダル保存で goto("#home") → 同一hashで再描画されず閉じない問題を解消
 * - avatar: 装備変更で goto("#avatar") → 同一hashで再描画されず反映されない問題を解消
 */
function goto(hash) {
  const next = String(hash || "");
  if (!next) return;

  if (location.hash === next) {
    // hashchangeが発火しないので、明示的に再ルート
    route();
    return;
  }
  location.hash = next;
}

async function init() {
  // initAudio は await 不要（同期）だが、既存のままでもOK
  await initAudio();

  state.masters = await loadAllMasters();
  state.save = ensureSaveLoaded();

  window.addEventListener("hashchange", route);

  // F5更新時はトップへ
  if (location.hash && location.hash !== "#top") {
    location.hash = "#top";
  }

  route();
}

function route() {
  const { parts, params } = parseHash();

  // TOP
  if (parts[0] === "top") {
    // ✅ トップBGMを鳴らす（autoplay制限は audioManager が pending で吸収）
    playBgm("top");
    setView(renderTop({ state, goto }));
    return;
  }

  // HOME
  if (parts[0] === "home") {
    playBgm("home");
    setView(renderHome({ state, goto, params }));
    return;
  }

  // QUIZ
  if (parts[0] === "quiz") {
    stopBgm();
    setView(renderQuiz({ state, goto, params }));
    return;
  }

  if (parts[0] === "result") {
    stopBgm();
    setView(renderResult({ state, goto }));
    return;
  }

  // OPTIONS
  if (parts[0] === "options") {
    playBgm("home");
    setView(renderOptions({ state, goto }));
    return;
  }

  // AVATAR
  if (parts[0] === "avatar") {
    playBgm("home");
    setView(renderAvatar({ state, goto }));
    return;
  }

  // GACHA
  if (parts[0] === "gacha") {
    playBgm("home");
    setView(renderGacha({ state, goto, params }));
    return;
  }

  if (parts[0] === "gachaDraw") {
    playBgm("home");
    setView(renderGachaDraw({ state, goto, params }));
    return;
  }

  // TIME ATTACK
  if (parts[0] === "timeAttack") {
    stopBgm();
    setView(renderTimeAttack({ state, goto, params }));
    return;
  }

  // ENDLESS
  if (parts[0] === "endless") {
    stopBgm();
    setView(renderEndless({ state, goto, params }));
    return;
  }

  // =========================
  // BATTLE
  // =========================
  if (parts[0] === "battle") {
    stopBgm();
    setView(renderBattleMenu({ state, goto }));
    return;
  }

  if (parts[0] === "battleCpuSetup") {
    stopBgm();
    setView(renderBattleCpuSetup({ state, goto }));
    return;
  }

  if (parts[0] === "battleQuiz") {
    stopBgm();
    setView(renderBattleQuiz({ state, goto }));
    return;
  }

  if (parts[0] === "battleResult") {
    stopBgm();
    setView(renderBattleResult({ state, goto }));
    return;
  }

  // ★ オンライン対戦
  if (parts[0] === "battleRoomCreate") {
    stopBgm();
    setView(renderBattleRoomCreate({ state, goto }));
    return;
  }

  if (parts[0] === "battleRoomJoin") {
    stopBgm();
    setView(renderBattleRoomJoin({ state, goto }));
    return;
  }

  if (parts[0] === "battleRoomLobby") {
    stopBgm();
    setView(renderBattleRoomLobby({ state, goto }));
    return;
  }

  // fallback
  setView(
    renderPlaceholder({
      title: "ページが見つかりません",
      message: "URLが正しいか確認してください。",
      goto,
    })
  );
}

init().catch((e) => {
  console.error(e);
  stopBgm();
  setView(`
    <div class="card"><div class="card-inner">
      <h2>起動エラー</h2>
      <pre class="notice">${e?.stack || e}</pre>
      <button class="btn secondary" onclick="location.hash='#top'">トップへ</button>
    </div></div>
  `);
});
