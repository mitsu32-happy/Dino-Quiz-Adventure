import { loadAllMasters } from "./systems/dataLoader.js";
import { ensureSaveLoaded } from "./systems/saveManager.js";

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
  // リロード時はトップへ（既存仕様）
  if (location.hash !== "#top") location.hash = "#top";

  state.save = ensureSaveLoaded();
  state.masters = await loadAllMasters();

  window.addEventListener("hashchange", route);
  route();
}

function route() {
  const { parts, params } = parseHash();

  // top
  const isTop = parts.length === 0 || parts[0] === "top";
  if (isTop) {
    setView(renderTop({ goto }));
    return;
  }

  // home
  if (parts[0] === "home") {
    setView(renderHome({ state, goto, params }));
    return;
  }

  // quiz (stage)
  if (parts[0] === "quiz") {
    setView(renderQuiz({ state, goto, params }));
    return;
  }

  // result (stage)
  if (parts[0] === "result") {
    setView(renderResult({ state, goto }));
    return;
  }

  // options
  if (parts[0] === "options") {
    setView(renderOptions({ state, goto }));
    return;
  }

  // avatar
  if (parts[0] === "avatar") {
    setView(renderAvatar({ state, goto }));
    return;
  }

  // gacha
  if (parts[0] === "gacha") {
    setView(renderGacha({ state, goto, params }));
    return;
  }
  if (parts[0] === "gachaDraw") {
    setView(renderGachaDraw({ state, goto, params }));
    return;
  }

  // timeAttack
  if (parts[0] === "timeAttack") {
    setView(renderTimeAttack({ state, goto, params }));
    return;
  }

  // ★endless（3ミス終了）
  if (parts[0] === "endless") {
    setView(renderEndless({ state, goto, params }));
    return;
  }

  // battle はまだ準備中
  if (["battle"].includes(parts[0])) {
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
  setView(`
    <div class="card"><div class="card-inner">
      <h2>起動エラー</h2>
      <pre class="notice">${e?.stack || e}</pre>
      <button class="btn secondary" onclick="location.hash='#top'">トップへ</button>
    </div></div>
  `);
});
