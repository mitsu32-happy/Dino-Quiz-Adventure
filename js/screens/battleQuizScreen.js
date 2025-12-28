// js/screens/battleQuizScreen.js
import { playSe } from "../systems/audioManager.js";
import { getEquippedTitle } from "../systems/titleManager.js";

const ROOT = new URL("../../", import.meta.url);
const asset = (p) => new URL(String(p || "").replace(/^\/+/, ""), ROOT).toString();

function ensureCssLoadedOnce(href, id) {
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.id = id;
  document.head.appendChild(link);
}

function normalizeChoice(c) {
  if (c == null) return { text: "", image: "" };
  if (typeof c === "string" || typeof c === "number" || typeof c === "boolean") {
    return { text: String(c), image: "" };
  }
  const text =
    c.text ?? c.label ?? c.name ?? c.title ?? c.caption ?? c.value ?? (c.id ? String(c.id) : "");
  const image = c.image ?? c.imagePath ?? c.image_path ?? c.image_url ?? c.img ?? c.src ?? "";
  return { text: text ? String(text) : "", image: image ? String(image) : "" };
}

function getCorrectIndex(q) {
  const v =
    q?.correct_choice_index ??
    q?.correct_index ??
    q?.answer_index ??
    q?.correct ??
    q?.correctChoiceIndex ??
    q?.correctIndex;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

// --- avatar helpers (重要：id / item_id 両対応) ---
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
function getEquippedForPi({ pi, myPi, save, run }) {
  if (pi === myPi) {
    const eq = resolveEquippedFromAny(save?.avatar?.equipped);
    if (eq) return eq;
  }
  const p = run?.players?.[pi];
  const prof = p?.profile || p || {};
  const eq =
    resolveEquippedFromAny(prof?.avatar?.equipped) ||
    resolveEquippedFromAny(prof?.avatarEquipped) ||
    resolveEquippedFromAny(p?.avatar?.equipped) ||
    resolveEquippedFromAny(p?.avatarEquipped) ||
    resolveEquippedFromAny(prof?.equipped);
  return eq || null;
}

function calcFinalStandings(run, activePis) {
  const rows = [];
  for (const pi of activePis) {
    const prof = run.players?.[pi]?.profile || run.players?.[pi] || {};
    rows.push({
      pi,
      name: prof.name ?? `P${pi + 1}`,
      titleRaw: prof.titleName ?? prof.title ?? prof.titleId ?? "—",
      score: Number(run.points?.[pi] ?? 0),
      correct: Number(run.correctCounts?.[pi] ?? 0),
      timeSum: Number(run.correctTimeSum?.[pi] ?? 0),
    });
  }
  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.timeSum - b.timeSum;
  });
  rows.forEach((r, i) => (r.rank = i + 1));
  return { rows };
}

// --- typewriter ---
function killTypewriter() {
  const w = window;
  if (w.__battleTypewriterId) {
    try {
      clearInterval(w.__battleTypewriterId);
    } catch (_) {}
    w.__battleTypewriterId = null;
  }
}
function startTypewriter(el, text, speedMs = 18) {
  killTypewriter();
  if (!el) return;
  const full = String(text ?? "");
  el.textContent = "";
  let i = 0;
  const id = setInterval(() => {
    if (!el.isConnected) {
      clearInterval(id);
      return;
    }
    if (i >= full.length) {
      clearInterval(id);
      return;
    }
    el.textContent += full[i];
    i++;
  }, speedMs);
  window.__battleTypewriterId = id;
}

// --- seeded shuffle (stable per question) ---
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function makeRng(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x >>>= 0;
    x ^= x << 5;
    x >>>= 0;
    return (x >>> 0) / 4294967296;
  };
}
function shuffledIndices(n, seedStr) {
  const arr = Array.from({ length: n }, (_, i) => i);
  const rng = makeRng(hashSeed(seedStr));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// --- online helper: playerKey/clientId -> pi ---
function rebuildOnlineMaps(run, online) {
  online.playerKeyToPi = {};
  online.clientIdToPi = {};
  for (let pi = 0; pi < 4; pi++) {
    const p = run?.players?.[pi];
    const cid = p?.clientId ?? p?.profile?.clientId ?? null;
    const pk = p?.playerKey ?? p?.profile?.playerKey ?? null;
    if (cid) online.clientIdToPi[cid] = pi;
    if (pk) online.playerKeyToPi[String(pk)] = pi;
  }
}

function mergePlayersFromBeginPayload(run, beginPlayers) {
  if (!Array.isArray(beginPlayers)) return;

  // すでに4枠の run.players があるなら「一致する人だけ」profile更新
  if (Array.isArray(run.players) && run.players.length === 4) {
    for (const bp of beginPlayers) {
      const bCid = bp?.clientId ?? null;
      const bPk = bp?.playerKey ?? bp?.profile?.playerKey ?? null;
      for (let pi = 0; pi < 4; pi++) {
        const p = run.players?.[pi];
        const cid = p?.clientId ?? p?.profile?.clientId ?? null;
        const pk = p?.playerKey ?? p?.profile?.playerKey ?? null;
        if ((bPk && pk && String(bPk) === String(pk)) || (bCid && cid && String(bCid) === String(cid))) {
          run.players[pi] = {
            ...p,
            ...bp,
            clientId: bp?.clientId ?? p?.clientId,
            playerKey: bp?.playerKey ?? p?.playerKey,
            profile: { ...(p?.profile || {}), ...(bp?.profile || {}) },
          };
        }
      }
    }
    return;
  }

  // run.players が無い/崩れてる場合：先頭から詰める
  run.players = Array.from({ length: 4 }, (_, i) => {
    const bp = beginPlayers[i] || null;
    if (!bp) return {};
    return {
      clientId: bp?.clientId ?? null,
      playerKey: bp?.playerKey ?? bp?.profile?.playerKey ?? null,
      profile: bp?.profile || {},
    };
  });
}

function applyScoresObjectToRunPoints(scoresObj, run, online) {
  if (!scoresObj || typeof scoresObj !== "object") return;
  // run.points は UI 側が [pi] 前提なので、playerKey -> pi に変換して反映
  for (const [pk, score] of Object.entries(scoresObj)) {
    const piRaw = online?.playerKeyToPi?.[String(pk)];
    const pi = Number(piRaw);
    if (!Number.isFinite(pi)) continue;
    run.points[pi] = Number(score ?? 0);
  }
}


export function renderBattleQuiz({ state, goto }) {
  ensureCssLoadedOnce(asset("assets/css/endless.css"), "quiz-base-css");
  killTypewriter();

  const run = state.currentRun;
  const masters = state.masters;
  const save = state.save;
  const bc = state.battleClient;

  const mode = String(run?.mode ?? "");
  const isCpu = mode === "battle_cpu" || mode.startsWith("battle_cpu_");
  const isOnline = mode === "battle_online_local" || mode.startsWith("battle_online_");

  if (!run || (!isCpu && !isOnline)) {
    return `
      <div class="card"><div class="card-inner">
        <h2 style="margin:0 0 8px;">対戦が開始されていません</h2>
        <div class="notice">対戦を開始してください。</div>
        <div class="space"></div>
        <a class="btn" href="#battle">対戦へ</a>
      </div></div>
    `;
  }

  // run init
  if (!Array.isArray(run.points)) run.points = [0, 0, 0, 0];
  if (!Array.isArray(run.correctCounts)) run.correctCounts = [0, 0, 0, 0];
  if (!Array.isArray(run.correctTimeSum)) run.correctTimeSum = [0, 0, 0, 0];
  if (typeof run.index !== "number") run.index = 0;

  const TOTAL_Q = 10;
  const total = Math.min(TOTAL_Q, run.questionIds?.length ?? 0);

  // activePis
  let activePis = [0, 1, 2, 3];
  if (isOnline) {
    activePis = [];
    for (let pi = 0; pi < 4; pi++) {
      const p = run.players?.[pi];
      const cid = p?.clientId ?? p?.profile?.clientId ?? null;
      const pk = p?.playerKey ?? p?.profile?.playerKey ?? null;
      if (cid || pk) activePis.push(pi);
    }
    if (activePis.length === 0) activePis = [0];
  }

  // online sync store / cpu local store
  const online = (run.online = run.online || {});
  const sync = (online.sync = online.sync || {
    answersByIndex: {},
    lastQuestionEndIndex: -1,
    lastSeenOtherAnswerKey: "",
  });
  const local = (run.localSync = run.localSync || {
    startAtMs: 0,
    answersByIndex: {},
    lastAppliedIndex: -1,
    lastSeenOtherAnswerKey: "",
    _scoredIndex: -1,
  });

  // online init
  if (isOnline) {
    const me = bc?.getMe?.();
    online.myClientId = online.myClientId ?? (me?.clientId ?? bc?.clientId ?? null);
    online.myPlayerKey = online.myPlayerKey ?? (me?.playerKey ?? me?.getMe?.()?.playerKey ?? null);
    online.hostClientId = online.hostClientId ?? (run.hostClientId ?? null);
    online.isHost = !!(online.myClientId && online.hostClientId && online.myClientId === online.hostClientId);

    rebuildOnlineMaps(run, online);

    if (!online._handlersRegistered) {
      online._handlersRegistered = true;

      bc.on("game:event", (ev) => {
        if (!ev?.type) return;

        // begin payload（他人アバター表示など）
        if (ev.type === "game:begin") {
          const bp = ev.beginPayload || {};
          if (Array.isArray(bp.questionIds) && !Array.isArray(run.questionIds)) {
            run.questionIds = bp.questionIds;
          }
          if (bp.hostClientId) {
            run.hostClientId = bp.hostClientId;
            online.hostClientId = bp.hostClientId;
            online.isHost = !!(online.myClientId && online.hostClientId && online.myClientId === online.hostClientId);
          }
          mergePlayersFromBeginPayload(run, bp.players);
          rebuildOnlineMaps(run, online);
          return;
        }

        // 他者回答通知（表示＆SE）
        if (ev.type === "game:answer") {
          const i = Number(ev.qIndex);
          if (!Number.isFinite(i)) return;

          const pk = ev.playerKey != null ? String(ev.playerKey) : "";
          const piRaw = online.playerKeyToPi?.[pk];
          const pi = Number(piRaw);
          if (!Number.isFinite(pi)) return;

          const byPi = (sync.answersByIndex[i] = sync.answersByIndex[i] || {});
          if (byPi[pi]?.answered) return;

          // choiceIndex は questionEnd で確定するので、ここは「回答済み表示」だけ
          byPi[pi] = { answered: true, choiceIndex: null, answeredAtMs: Date.now() };

          // 自分以外のSE（連打防止）
          if (pi !== online.clientIdToPi?.[online.myClientId]) {
            const k = `${i}:${pi}`;
            if (sync.lastSeenOtherAnswerKey !== k) {
              sync.lastSeenOtherAnswerKey = k;
              playSe("assets/sounds/se/se_battle_other_answer.mp3", { volume: 0.85 });
            }
          }
          return;
        }

        // 問題終了（回答結果の反映のみ。採点・pt加算はしない）
        if (ev.type === "game:questionEnd") {
          const i = Number(ev.qIndex);
          if (!Number.isFinite(i)) return;
          if (i <= sync.lastQuestionEndIndex) return;
          sync.lastQuestionEndIndex = i;

          const ansByPk = ev.answers || {};
          const byPi = (sync.answersByIndex[i] = sync.answersByIndex[i] || {});
          for (const [pk, a] of Object.entries(ansByPk)) {
            const piRaw = online.playerKeyToPi?.[String(pk)];
            const pi = Number(piRaw);
            if (!Number.isFinite(pi)) continue;
            byPi[pi] = {
              answered: true,
              choiceIndex: Number(a?.choiceIndex),
              answeredAtMs: Number(a?.answeredAtMs) || Date.now(),
            };
          }

// ✅ server.js は scores を { [playerKey]: totalPt } 形式で送る
applyScoresObjectToRunPoints(ev.scores, run, online);
// 互換：もし points という名前で来ても同じ扱い
applyScoresObjectToRunPoints(ev.points, run, online);
															
          return;
        }

        // 次問題（サーバ正で進行）
        if (ev.type === "game:next") {
          const n = Number(ev.index);
          if (Number.isFinite(n)) run.index = n;
          return;
        }

        // 終了（サーバ正で結果へ）
        if (ev.type === "game:finished") {
applyScoresObjectToRunPoints(ev.scores, run, online);
applyScoresObjectToRunPoints(ev.points, run, online);

run.result = calcFinalStandings(run, activePis);
          return;
        }
      });
    }
  }

  // finish
  if (run.index >= total) {
    if (!run.result) run.result = calcFinalStandings(run, activePis);
    goto("#battleResult");
    return "";
  }

  const idx = run.index;
  const qid = run.questionIds[idx];
  const q = masters?.questionById?.get?.(qid);
  if (!q) {
    return `
      <div class="card"><div class="card-inner">
        <h2 style="margin:0 0 8px;">問題データが見つかりません</h2>
        <div class="notice">qid: ${qid}</div>
        <div class="space"></div>
        <a class="btn secondary" href="#battle">対戦へ戻る</a>
      </div></div>
    `;
  }

  const rawChoices = (Array.isArray(q.choices) ? q.choices : []).map(normalizeChoice);
  const correctIdxRaw = getCorrectIndex(q);

  // choice shuffle（全員一致）
  const seedStr = `${isOnline ? (run.hostClientId || online.hostClientId || "room") : "cpu"}|${
    run.roomId || ""
  }|${qid}|${idx}`;
  const order = shuffledIndices(rawChoices.length, seedStr);
  const choices = order.map((oi) => rawChoices[oi]);

  // map correct index after shuffle（表示用）
  let correctIdx = null;
  if (correctIdxRaw !== null) {
    const pos = order.indexOf(Number(correctIdxRaw));
    correctIdx = pos >= 0 ? pos : null;
  }
  window.__battleCorrectIdx = correctIdx;
  window.__battleActivePis = activePis;

  // myPi
  let myPi = 0;
  if (isOnline) {
    rebuildOnlineMaps(run, online);
    const v = online.clientIdToPi?.[online.myClientId];
    const n = Number(v);
    if (Number.isFinite(n)) myPi = n;
  }

  const equippedTitle = getEquippedTitle(masters, save);

  function nameFor(pi) {
    const prof = run.players?.[pi]?.profile || run.players?.[pi] || {};
    if (isCpu && pi === 0) return save?.playerName ?? "みっつー";
    return prof.name ?? `P${pi + 1}`;
  }

  function titleFor(pi) {
    if (isCpu && pi === 0) return equippedTitle?.name ?? "—";
    const prof = run.players?.[pi]?.profile || run.players?.[pi] || {};
    const raw = prof.titleName ?? prof.title ?? prof.titleId ?? "—";
    return resolveTitleJa(masters, raw);
  }

  const TIME_LIMIT_SEC = 20;
  const standSrc = asset("assets/images/quiz/quiz_stand.png");
  const avatarItems = getAvatarItems(masters);

  // ---- UI（ここは一切いじらない） ----
  const html = `
    <div class="quiz-root">
      <div class="top-bar">
        <button id="retireBtn" class="pause-btn" type="button">やめる</button>
        <div class="timer-pill" id="timerText">⏱ ${TIME_LIMIT_SEC}</div>
      </div>

      <div class="players-row">
        ${Array.from({ length: 4 }, (_, pi) => {
          const active = activePis.includes(pi);
          const pt = Number(run.points?.[pi] ?? 0);

          const eq = active ? getEquippedForPi({ pi, myPi, save, run }) : null;

          const bodyItem = eq ? getItemById(avatarItems, eq.body) : null;
          const headItem = eq ? getItemById(avatarItems, eq.head) : null;

          const bodyPath = getItemAssetPath(bodyItem);
          const headPath = getItemAssetPath(headItem);

          const bodyImg = bodyPath
            ? `<img class="av-layer av-body" src="${asset(bodyPath)}" alt="" onerror="this.style.opacity=0.25">`
            : "";
          const headImg = headPath
            ? `<img class="av-layer av-head" src="${asset(headPath)}" alt="" onerror="this.style.opacity=0.25">`
            : "";

          const avatarHtml = active
            ? `
              <div class="battle-avatar">
                ${bodyImg || `<div class="av-fallback">🧑</div>`}
                ${headImg}
                <img class="av-stand" src="${standSrc}" alt="" onerror="this.style.opacity=0.25">
                <div class="av-mark" id="mark_${pi}"></div>
              </div>
            `
            : `
              <div class="battle-avatar" style="opacity:.35;">
                <div class="av-fallback">空</div>
                <img class="av-stand" src="${standSrc}" alt="" style="opacity:.25">
              </div>
            `;

          return `
            <div class="battle-player ${active ? "" : "inactive"}">
              <div class="pname">${active ? nameFor(pi) : "空き"}</div>
              ${avatarHtml}
              <div class="ptitle">${active ? titleFor(pi) : "—"}</div>
              <div class="ppt"><span id="pt_${pi}">${pt}</span><span class="pptUnit">pt</span></div>
            </div>
          `;
        }).join("")}
      </div>

      <div class="space"></div>

      <div class="card quiz-card">
        <div class="card-inner">
          <div class="question-no">Q${idx + 1} / ${total}</div>
          <div class="question-text" id="qText"></div>
          <div class="choices-grid" id="choicesGrid"></div>
        </div>
      </div>
    </div>

    <style>
      .top-bar{ display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px; }
      .players-row{ display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:8px; align-items:start; }
      .battle-player{ padding: 8px 6px; border-radius: 12px; }
      .battle-avatar{ --av: clamp(64px, 18vw, 92px); position:relative; width: var(--av); height: var(--av); margin: 6px auto 2px; }
      .battle-avatar .av-layer{
        position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
        width: calc(var(--av) - 6px); height: calc(var(--av) - 6px);
        object-fit:contain; pointer-events:none;
      }
      .battle-avatar .av-stand{
        position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
        width: var(--av); height: var(--av);
        object-fit:contain; pointer-events:none; z-index:5;
      }
      .pname{ font-size: clamp(11px, 3.0vw, 14px); margin-bottom: 4px; text-align: center; font-weight:900; }
      .ptitle{ font-size: clamp(10px, 2.6vw, 12px); text-align: center; opacity:.85; }
      .ppt{ font-size: clamp(16px, 4.5vw, 22px); text-align: center; font-weight:1000; }
      .av-fallback{
        position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
        width: calc(var(--av) - 6px); height: calc(var(--av) - 6px);
        border-radius: 12px; background: rgba(0,0,0,.06);
        display:flex; align-items:center; justify-content:center; font-weight:1000;
      }
      .question-no{ opacity:.8; margin-bottom:6px; }
      .question-text{ min-height:2.6em; font-size:18px; font-weight:900; line-height:1.3; }
      .choices-grid{ margin-top:10px; display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      .choice-btn{
        width:100%;
        border-radius:14px;
        padding:10px 10px;
        border: 2px solid rgba(0,0,0,.15);
        background:#fff;
        font-weight:900;
        font-size:16px;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:8px;
        min-height:86px;
      }
      .choice-img{ width:100%; max-height:92px; object-fit:contain; border-radius:10px; }
      .choice-text{ width:100%; text-align:center; }
      .choice-btn:disabled{ opacity:.6; }
    </style>
  `;

  setTimeout(() => {
    const retireBtn = document.getElementById("retireBtn");
    const timerEl = document.getElementById("timerText");
    const qEl = document.getElementById("qText");
    const grid = document.getElementById("choicesGrid");

    let ended = false;

    const byPi = isOnline
      ? (sync.answersByIndex[idx] = sync.answersByIndex[idx] || {})
      : (local.answersByIndex[idx] = local.answersByIndex[idx] || {});

    // startMs
    let startMs = Date.now();
    if (!isOnline) {
      if (!local.startAtMs || local.lastAppliedIndex !== idx) {
        local.startAtMs = Date.now();
        local.lastAppliedIndex = idx;
      }
      startMs = local.startAtMs;
    }

    playSe("assets/sounds/se/se_question.mp3", { volume: 0.9 });
    startTypewriter(qEl, q.question_text ?? q.question ?? q.text ?? "", 18);

    grid.innerHTML = "";
    choices.forEach((c, i) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.type = "button";

      if (c.image) {
        const img = document.createElement("img");
        img.className = "choice-img";
        img.src = asset(c.image);
        img.alt = c.text || `choice_${i + 1}`;
        btn.appendChild(img);
      }

      const isImageChoice = choices.some((x) => !!x?.image);
      const tx = document.createElement("div");
      tx.className = "choice-text";
      tx.textContent = isImageChoice ? "" : c.text || "";
      btn.appendChild(tx);

      btn.addEventListener("click", () => handleAnswerSelect(i));
      grid.appendChild(btn);
    });

    function setChoicesEnabled(enabled) {
      const btns = grid?.querySelectorAll?.(".choice-btn") ?? [];
      btns.forEach((b) => (b.disabled = !enabled));
    }

    function updatePoints() {
      for (let pi = 0; pi < 4; pi++) {
        const el = document.getElementById(`pt_${pi}`);
        if (el) el.textContent = String(Number(run.points?.[pi] ?? 0));
      }
    }

    function showMarks() {
      for (let pi = 0; pi < 4; pi++) {
        const el = document.getElementById(`mark_${pi}`);
        if (!el) continue;
        if (!activePis.includes(pi)) {
          el.textContent = "";
          continue;
        }
        const a = byPi?.[pi];
        if (!a?.answered) {
          el.textContent = "";
          continue;
        }
        if (a.choiceIndex == null) {
          el.textContent = "…";
          continue;
        }
        if (Number(a.choiceIndex) === -1) {
          el.textContent = "⏱";
          continue;
        }
        const correct = correctIdx !== null && Number(a.choiceIndex) === Number(correctIdx);
        el.textContent = correct ? "〇" : "×";
      }
    }

    // ---- CPU auto answer ----
    function getCpuSetting(pi) {
      const s = run?.cpuStrengths?.[pi] || run?.players?.[pi]?.strength || "normal";
      if (s === "weak") return { acc: 0.5, base: 8 };
      if (s === "strong") return { acc: 1.0, base: 4 };
      return { acc: 0.75, base: 6 };
    }
    function pickCpuChoice() {
      const { acc } = getCpuSetting(1);
      const ok = Math.random() < acc;
      if (ok && correctIdx !== null) return correctIdx;

      const cand = [];
      for (let i = 0; i < choices.length; i++) if (i !== correctIdx) cand.push(i);
      return cand.length ? cand[Math.floor(Math.random() * cand.length)] : 0;
    }
    function scheduleCpu(pi) {
      if (!isCpu) return;
      if (!activePis.includes(pi)) return;
      if (byPi?.[pi]?.answered) return;

      const { base } = getCpuSetting(pi);
      const t = Math.max(1, base + (Math.random() * 4 - 2));

      setTimeout(() => {
        if (ended) return;
        if (byPi?.[pi]?.answered) return;

        const choiceIndex = pickCpuChoice(pi);
        byPi[pi] = { answered: true, choiceIndex, answeredAtMs: Date.now() };

        if (pi !== 0) {
          const k = `cpu:${idx}:${pi}`;
          if (local.lastSeenOtherAnswerKey !== k) {
            local.lastSeenOtherAnswerKey = k;
            playSe("assets/sounds/se/se_battle_other_answer.mp3", { volume: 0.85 });
          }
        }
      }, t * 1000);
    }
    if (isCpu) {
      scheduleCpu(1);
      scheduleCpu(2);
      scheduleCpu(3);
    }

    function handleAnswerSelect(choiceIndex) {
      if (ended) return;
      if (!activePis.includes(myPi)) return;
      if (byPi?.[myPi]?.answered) return;

      byPi[myPi] = { answered: true, choiceIndex, answeredAtMs: Date.now() };

      const correct = correctIdx !== null && Number(choiceIndex) === Number(correctIdx);
      if (correct) playSe("assets/sounds/se/se_correct.mp3", { volume: 0.9 });
      else playSe("assets/sounds/se/se_wrong.mp3", { volume: 0.9 });

      setChoicesEnabled(false);

      if (isOnline) {
        bc?.emitGameEvent?.({ type: "game:answer", choiceIndex });
      }
    }

    function cpuTryAdvance() {
      if (!isCpu) return;

      const cur = local.answersByIndex[idx] || {};
      const all = activePis.every((pi) => !!cur?.[pi]?.answered);
      if (!all) return;

      if (local._scoredIndex === idx) return;
      local._scoredIndex = idx;

      // CPU戦のみ：ローカル採点（元の挙動を維持）
      // ※ここは元ファイルのまま（UI影響なし）
      const correctList = [];
      for (const pi of activePis) {
        const a = cur[pi];
        if (Number(a.choiceIndex) === -1) continue;
        const ok = correctIdx !== null && Number(a.choiceIndex) === Number(correctIdx);
        if (ok) {
          const tSec = (Number(a.answeredAtMs) || Date.now()) / 1000;
          correctList.push({ pi, tSec });
        }
      }
      // 速い順：3/2/1
      const sorted = [...correctList].sort((a, b) => a.tSec - b.tSec);
      const awards = [3, 2, 1];
      for (let r = 0; r < Math.min(3, sorted.length); r++) {
        run.points[sorted[r].pi] = Number(run.points?.[sorted[r].pi] ?? 0) + awards[r];
      }

      ended = true;
      run.index = idx + 1;
      if (run.index >= total) {
        run.result = calcFinalStandings(run, activePis);
        goto("#battleResult");
      } else {
        goto(`#battleQuiz?i=${run.index}&t=${Date.now()}`);
      }
    }

    // 描画更新
    const paintIv = setInterval(() => {
      if (ended) return;

      updatePoints();
      showMarks();

      if (isCpu) cpuTryAdvance();

      // online: server から game:next が来たら移動
      if (isOnline && run.index !== idx) {
        ended = true;
        clearInterval(paintIv);
        clearInterval(timerIv);
        goto(`#battleQuiz?i=${run.index}&t=${Date.now()}`);
      }

      if (isOnline && run.result) {
        ended = true;
        clearInterval(paintIv);
        clearInterval(timerIv);
        goto("#battleResult");
      }
    }, 120);

    let remain = TIME_LIMIT_SEC;
    if (timerEl) timerEl.textContent = `⏱ ${remain}`;

    const timerIv = setInterval(() => {
      if (ended) return;

      const elapsedSec = (Date.now() - startMs) / 1000;
      const newRemain = Math.max(0, Math.ceil(TIME_LIMIT_SEC - elapsedSec));
      if (newRemain !== remain) {
        remain = newRemain;
        if (timerEl) timerEl.textContent = `⏱ ${remain}`;
      }

      if (elapsedSec >= TIME_LIMIT_SEC) {
        if (isCpu) {
          for (const pi of activePis) {
            if (!byPi?.[pi]?.answered) byPi[pi] = { answered: true, choiceIndex: -1, answeredAtMs: Date.now() };
          }
        }

        if (isOnline) {
          if (activePis.includes(myPi) && !byPi?.[myPi]?.answered) {
            byPi[myPi] = { answered: true, choiceIndex: -1, answeredAtMs: Date.now() };
            bc?.emitGameEvent?.({ type: "game:answer", choiceIndex: -1 });
          }
        }

        clearInterval(timerIv);
      }
    }, 100);

    retireBtn?.addEventListener("click", () => {
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.85 });
      if (confirm("対戦を中断して戻りますか？（結果は保存されません）")) {
        ended = true;
        clearInterval(paintIv);
        clearInterval(timerIv);
        state.currentRun = null;
        goto("#battle");
      }
    });
  }, 0);

  return html;
}
