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
  // どちらでも拾えるように
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
  // {equipped:{...}}
  if (obj.equipped && typeof obj.equipped === "object") return obj.equipped;
  // {body, head}
  if (typeof obj.body !== "undefined" || typeof obj.head !== "undefined") return obj;
  // {avatar:{...}}
  if (obj.avatar) return resolveEquippedFromAny(obj.avatar);
  if (obj.profile) return resolveEquippedFromAny(obj.profile);
  return null;
}
function getEquippedForPi({ pi, myPi, save, run }) {
  // 自分は save 優先
  if (pi === myPi) {
    const eq = resolveEquippedFromAny(save?.avatar?.equipped);
    if (eq) return eq;
  }

  // run.players 側（CPU/オンライン共通）
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

// 案1：正解が速い順に上位3人へ 3/2/1pt
function awardPointsBySpeed(correctList) {
  const sorted = [...correctList].sort((a, b) => a.tSec - b.tSec);
  const awards = [3, 2, 1];
  const pointsMap = new Map();
  for (let rank = 0; rank < Math.min(3, sorted.length); rank++) {
    const pi = sorted[rank].pi;
    pointsMap.set(pi, (pointsMap.get(pi) ?? 0) + awards[rank]);
  }
  return pointsMap;
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

export function renderBattleQuiz({ state, goto }) {
  ensureCssLoadedOnce(asset("assets/css/endless.css"), "quiz-base-css");
  killTypewriter();

  const run = state.currentRun;
  const masters = state.masters;
  const save = state.save;
  const bc = state.battleClient;

  const isCpu = run?.mode === "battle_cpu";
  const isOnline = run?.mode === "battle_online_local";

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
      if (cid) activePis.push(pi);
    }
    if (activePis.length === 0) activePis = [0];
  }

  // online sync store / cpu local store
  const online = (run.online = run.online || {});
  const sync = (online.sync = online.sync || {
    qIndex: 0,
    startAtMs: 0,
    answersByIndex: {},
    lastResultIndex: -1,
    lastSeenAnswerKey: "",
  });
  const local = (run.localSync = run.localSync || {
    startAtMs: 0,
    answersByIndex: {},
    lastAppliedIndex: -1,
  });

  if (isOnline) {
    const me = bc?.getMe?.();
    online.myClientId = online.myClientId ?? (me?.clientId ?? bc?.clientId ?? null);
    online.hostClientId = online.hostClientId ?? (run.hostClientId ?? null);
    online.isHost = !!(
      online.myClientId &&
      online.hostClientId &&
      online.myClientId === online.hostClientId
    );

    online.clientIdToPi = online.clientIdToPi || {};
    for (let pi = 0; pi < 4; pi++) {
      const p = run.players?.[pi];
      const cid = p?.clientId ?? p?.profile?.clientId ?? null;
      if (cid) online.clientIdToPi[cid] = pi;
    }

    if (!online._handlersRegistered) {
      online._handlersRegistered = true;

      bc.on("game:event", (ev) => {
        if (!ev?.type) return;

        if (ev.type === "game:question") {
          const i = Number(ev.index);
          if (!Number.isFinite(i)) return;
          sync.qIndex = i;
          sync.startAtMs = Number(ev.questionStartAtMs) || Date.now();
          run.index = i;
          return;
        }

        if (ev.type === "game:answer") {
          const i = Number(ev.index);
          if (!Number.isFinite(i)) return;

          const pi = Number(online.clientIdToPi?.[ev.from]);
          if (!Number.isFinite(pi)) return;

          const byPi = (sync.answersByIndex[i] = sync.answersByIndex[i] || {});
          if (byPi[pi]?.answered) return;

          byPi[pi] = {
            answered: true,
            choiceIndex: Number(ev.choiceIndex),
            answeredAtMs: Number(ev.clientAnsweredAt) || Number(ev.serverReceivedAtMs) || Date.now(),
          };
          return;
        }

        if (ev.type === "game:result_question") {
          const i = Number(ev.index);
          if (!Number.isFinite(i)) return;
          if (i <= sync.lastResultIndex) return;
          sync.lastResultIndex = i;

          if (Array.isArray(ev.points)) run.points = ev.points;
          if (Array.isArray(ev.correctCounts)) run.correctCounts = ev.correctCounts;
          if (Array.isArray(ev.correctTimeSum)) run.correctTimeSum = ev.correctTimeSum;

          run.index = i + 1;
          return;
        }

        if (ev.type === "game:result_final") {
          run.result = ev.result;
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

  // choice shuffle
  const seedStr = `${isOnline ? online.hostClientId || "room" : "cpu"}|${run.roomId || ""}|${qid}|${idx}`;
  const order = shuffledIndices(rawChoices.length, seedStr);
  const choices = order.map((oi) => rawChoices[oi]);

  // map correct index after shuffle
  let correctIdx = null;
  if (correctIdxRaw !== null) {
    const pos = order.indexOf(Number(correctIdxRaw));
    correctIdx = pos >= 0 ? pos : null;
  }

  // myPi
  let myPi = 0;
  if (isOnline) {
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
      .players-row{ display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; align-items:start; }
      .battle-player{
        background: rgba(255,255,255,.92);
        border-radius: 14px;
        padding: 10px 8px;
        border: 2px solid rgba(0,0,0,.12);
        text-align:center;
      }
      .battle-player.inactive{ opacity:.35; }
      .pname{ font-weight: 1000; margin-bottom:4px; }
      .ptitle{ opacity:.85; margin-top:4px; font-size:12px; min-height:1.2em; }
      .ppt{ margin-top:6px; font-weight:1000; font-size:22px; }
      .pptUnit{ font-size:12px; opacity:.8; margin-left:2px; }

      .battle-avatar{
        position:relative;
        width:92px;
        height:92px;
        margin:6px auto 2px;
      }
      .battle-avatar .av-layer{
        position:absolute;
        left:50%;
        top:50%;
        transform:translate(-50%,-50%);
        width:86px;
        height:86px;
        object-fit:contain;
        pointer-events:none;
      }
      .battle-avatar .av-stand{
        position:absolute;
        left:50%;
        top:50%;
        transform:translate(-50%,-50%);
        width:92px;
        height:92px;
        object-fit:contain;
        pointer-events:none;
        z-index:5;
      }
      .battle-avatar .av-mark{
        position:absolute;
        left:50%;
        top:50%;
        transform:translate(-50%,-50%);
        font-weight:1000;
        font-size:34px;
        z-index:10;
        text-shadow: 0 2px 0 rgba(0,0,0,.15);
        pointer-events:none;
        min-width:1em;
      }
      .av-fallback{
        position:absolute;
        left:50%;
        top:50%;
        transform:translate(-50%,-50%);
        width:86px;
        height:86px;
        border-radius:12px;
        background: rgba(0,0,0,.06);
        display:flex;
        align-items:center;
        justify-content:center;
        font-weight:1000;
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
      .choice-img{
        width:100%;
        max-height:92px;
        object-fit:contain;
        border-radius:10px;
      }
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

    let startMs = Date.now();
    if (isOnline) {
      if (sync.startAtMs) startMs = Number(sync.startAtMs) || startMs;
    } else {
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

    function showMarksAndOtherAnswerSe() {
      const answeredKeys = [];
      for (let pi = 0; pi < 4; pi++) {
        if (!activePis.includes(pi)) continue;
        if (byPi?.[pi]?.answered) answeredKeys.push(`${pi}`);
      }
      const keyNow = answeredKeys.sort().join(",");
      if (keyNow && keyNow !== sync.lastSeenAnswerKey) {
        const prevSet = new Set((sync.lastSeenAnswerKey || "").split(",").filter(Boolean));
        const nowSet = new Set(keyNow.split(",").filter(Boolean));
        let otherAnswered = false;
        nowSet.forEach((k) => {
          if (!prevSet.has(k)) {
            const pi = Number(k);
            if (Number.isFinite(pi) && pi !== myPi) otherAnswered = true;
          }
        });
        if (otherAnswered) playSe("assets/sounds/se/se_battle_other_answer.mp3", { volume: 0.9 });
        sync.lastSeenAnswerKey = keyNow;
      }

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
      const t = Math.max(1, base + (Math.random() * 4 - 2)); // base±2秒

      setTimeout(() => {
        if (ended) return;
        if (byPi?.[pi]?.answered) return;

        const choiceIndex = pickCpuChoice(pi);
        byPi[pi] = { answered: true, choiceIndex, answeredAtMs: Date.now() };
      }, t * 1000);
    }
    if (isCpu) {
      scheduleCpu(1);
      scheduleCpu(2);
      scheduleCpu(3);
    }

    if (isOnline && online.isHost && sync.qIndex !== idx) {
      sync.qIndex = idx;
      sync.startAtMs = Date.now();
      bc?.emitGameEvent?.({ type: "game:question", index: idx, qid, questionStartAtMs: sync.startAtMs });
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
        bc?.emitGameEvent?.({ type: "game:answer", index: idx, choiceIndex, clientAnsweredAt: Date.now() });
      }
    }

    function hostTryFinalize() {
      if (!isOnline || !online.isHost) return;

      const cur = sync.answersByIndex[idx] || {};
      const all = activePis.every((pi) => !!cur?.[pi]?.answered);
      if (!all) return;
      if (sync.lastResultIndex >= idx) return;

      const correctList = [];
      for (const pi of activePis) {
        const a = cur[pi];
        if (Number(a.choiceIndex) === -1) continue;
        const tSec = Math.max(0, (Number(a.answeredAtMs) - startMs) / 1000);
        const correct = correctIdx !== null && Number(a.choiceIndex) === Number(correctIdx);
        if (correct) correctList.push({ pi, tSec });
      }

      const pointsMap = awardPointsBySpeed(correctList);

      for (const pi of activePis) {
        const a = cur[pi];
        const tSec = Math.max(0, (Number(a.answeredAtMs) - startMs) / 1000);
        const correct = correctIdx !== null && Number(a.choiceIndex) === Number(correctIdx);

        run.points[pi] = Number(run.points?.[pi] ?? 0) + (pointsMap.get(pi) ?? 0);
        if (correct) {
          run.correctCounts[pi] = Number(run.correctCounts?.[pi] ?? 0) + 1;
          run.correctTimeSum[pi] = Number(run.correctTimeSum?.[pi] ?? 0) + tSec;
        }
      }

      const isLast = idx + 1 >= total;
      const result = isLast ? calcFinalStandings(run, activePis) : null;

      bc?.emitGameEvent?.({ type: "game:result_question", index: idx, points: run.points, correctCounts: run.correctCounts, correctTimeSum: run.correctTimeSum, result });
      if (isLast) bc?.emitGameEvent?.({ type: "game:result_final", result });
    }

    function cpuTryAdvance() {
      if (!isCpu) return;

      const cur = local.answersByIndex[idx] || {};
      const all = activePis.every((pi) => !!cur?.[pi]?.answered);
      if (!all) return;

      if (local._scoredIndex === idx) return;
      local._scoredIndex = idx;

      const correctList = [];
      for (const pi of activePis) {
        const a = cur[pi];
        if (Number(a.choiceIndex) === -1) continue;
        const tSec = Math.max(0, (Number(a.answeredAtMs) - startMs) / 1000);
        const correct = correctIdx !== null && Number(a.choiceIndex) === Number(correctIdx);
        if (correct) correctList.push({ pi, tSec });
      }
      const pointsMap = awardPointsBySpeed(correctList);

      for (const pi of activePis) {
        const a = cur[pi];
        const tSec = Math.max(0, (Number(a.answeredAtMs) - startMs) / 1000);
        const correct = correctIdx !== null && Number(a.choiceIndex) === Number(correctIdx);

        run.points[pi] = Number(run.points?.[pi] ?? 0) + (pointsMap.get(pi) ?? 0);
        if (correct) {
          run.correctCounts[pi] = Number(run.correctCounts?.[pi] ?? 0) + 1;
          run.correctTimeSum[pi] = Number(run.correctTimeSum?.[pi] ?? 0) + tSec;
        }
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

    const paintIv = setInterval(() => {
      if (ended) return;

      updatePoints();
      showMarksAndOtherAnswerSe();

      if (isOnline) hostTryFinalize();
      if (isCpu) cpuTryAdvance();

      if (isOnline && run.index !== idx) {
        ended = true;
        goto(`#battleQuiz?i=${run.index}&t=${Date.now()}`);
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
        for (const pi of activePis) {
          if (!byPi?.[pi]?.answered) byPi[pi] = { answered: true, choiceIndex: -1, answeredAtMs: Date.now() };
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
