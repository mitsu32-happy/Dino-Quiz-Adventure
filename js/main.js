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

const appEl = document.getElementById("app");

const state = {
  masters: null,
  save: null,
  currentRun: null,
  timeAttackRun: null,
  endlessRun: null,
};

function setView(html) {
  appEl.innerHTML = html;
}

function parseHash() {
  const hash = location.hash || "#top";
  const [path, query] = hash.replace(/^#/, "").split("?");
  const parts = path.split("/").filter(Boolean);

  const params = {};
  if (query) {
    for (const kv of query.split("&")) {
      const [k, v] = kv.split("=");
      params[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
    }
  }
  return { parts, params };
}

function goto(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

async function init() {
  if (location.hash !== "#top") location.hash = "#top";

  state.save = ensureSaveLoaded();
  state.masters = await loadAllMasters();

  // 🔓 最初の操作で音を解禁
  initAudio();

  window.addEventListener("hashchange", route);
  route();
}

function route() {
  const { parts, params } = parseHash();

  // トップ
  if (parts.length === 0 || parts[0] === "top") {
    playBgm("top");
    setView(renderTop({ goto }));
    return;
  }

  // ホーム
  if (parts[0] === "home") {
    playBgm("home");
    setView(renderHome({ state, goto, params }));
    return;
  }

  // ステージクイズ（BGMなし）
  if (parts[0] === "quiz") {
    stopBgm();
    setView(renderQuiz({ state, goto, params }));
    return;
  }

  // リザルト
  if (parts[0] === "result") {
    playBgm("home");
    setView(renderResult({ state, goto }));
    return;
  }

  // オプション
  if (parts[0] === "options") {
    playBgm("home");
    setView(renderOptions({ state, goto }));
    return;
  }

  // アバター
  if (parts[0] === "avatar") {
    playBgm("home");
    setView(renderAvatar({ state, goto }));
    return;
  }

  // ガチャ
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

  // タイムアタック（BGMなし）
  if (parts[0] === "timeAttack") {
    stopBgm();
    setView(renderTimeAttack({ state, goto, params }));
    return;
  }

  // エンドレス（BGMなし）
  if (parts[0] === "endless") {
    stopBgm();
    setView(renderEndless({ state, goto, params }));
    return;
  }

  // 対戦（準備中・BGMなし）
  if (parts[0] === "battle") {
    stopBgm();
    setView(
      renderPlaceholder({
        title: "準備中",
        message: "このモードは次フェーズで実装予定です。",
        goto,
      })
    );
    return;
  }

  goto("#top");
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
