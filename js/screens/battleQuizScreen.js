// js/screens/battleQuizScreen.js
import { playSe } from "../systems/audioManager.js";

const ROOT = new URL("../../", import.meta.url);
const asset = (p) => new URL(String(p || "").replace(/^\/+/, ""), ROOT).toString();

function normalizeChoice(c) {
  if (c == null) return { text: "", image: "" };
  if (typeof c !== "object") return { text: String(c), image: "" };
  return { text: String(c.text ?? c.label ?? ""), image: String(c.image ?? c.imagePath ?? "") };
}
function getCorrectIndex(q) {
  const v = q?.correct_choice_index ?? q?.correct_index ?? q?.correct ?? q?.correctChoiceIndex;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dedupePlayers(players = []) {
  const out = [];
  const seen = new Set();
  for (const p of Array.isArray(players) ? players : []) {
    const cid = p?.clientId ?? p?.profile?.clientId ?? null;
    if (!cid || seen.has(cid)) continue;
    seen.add(cid);
    out.push({ clientId: cid, profile: p.profile || p });
  }
  while (out.length < 4) out.push({ clientId: null, profile: {} });
  return out.slice(0, 4);
}

// 正解が速い順に 3/2/1pt（timeMs小さい順）
function awardPointsBySpeed(correctList) {
  const sorted = [...correctList].sort((a, b) => a.timeMs - b.timeMs);
  const awards = [3, 2, 1];
  const points = new Map();
  for (let r = 0; r < Math.min(3, sorted.length); r++) {
    points.set(sorted[r].clientId, (points.get(sorted[r].clientId) ?? 0) + awards[r]);
  }
  return points;
}

export function renderBattleQuiz({ state, goto }) {
  const run = state.currentRun;
  const masters = state.masters;
  const bc = state.battleClient;

  if (!run || !bc) {
    return `<div class="card"><div class="card-inner">
      <h2>対戦が開始されていません</h2>
      <a class="btn" href="#battle">戻る</a>
    </div></div>`;
  }

  // init
  run.mode = run.mode || "battle_online";
  run.index = Number.isFinite(run.index) ? run.index : 0;
  run.points = Array.isArray(run.points) ? run.points : [0,0,0,0];
  run._scored = run._scored || {}; // qIndex -> true
  run._answers = run._answers || {}; // qIndex -> {clientId:{choiceIndex,timeMs}}
  run._answeredPing = run._answeredPing || {}; // qIndex -> Set(clientId)

  const me = bc.getMe();
  run.myClientId = me.clientId;

  // players (from lobby beginPayload or room:update)
  run.players = Array.isArray(run.players) ? run.players : [];
  run.players = dedupePlayers(run.players);

  const TOTAL_Q = 10;
  const total = Math.min(TOTAL_Q, run.questionIds?.length ?? 0);

  if (run.index >= total) {
    goto("#battleResult");
    return "";
  }

  const idx = run.index;
  const qid = run.questionIds[idx];
  const q = masters?.questionById?.get?.(qid);
  if (!q) {
    return `<div class="card"><div class="card-inner">
      <h2>問題データが見つかりません</h2>
      <div class="notice">qid: ${qid}</div>
      <a class="btn secondary" href="#battle">戻る</a>
    </div></div>`;
  }

  const choices = (Array.isArray(q.choices) ? q.choices : []).map(normalizeChoice);
  const correctIdx = getCorrectIndex(q);

  // clientId -> pi
  const clientIdToPi = {};
  run.players.forEach((p, i) => { if (p.clientId) clientIdToPi[p.clientId] = i; });

  const myPi = Number.isFinite(clientIdToPi[run.myClientId]) ? clientIdToPi[run.myClientId] : 0;

  const TIME_LIMIT_SEC = 20;
  const startAtMs = run._startAtMsByIndex?.[idx] ?? Date.now();
  run._startAtMsByIndex = run._startAtMsByIndex || {};
  run._startAtMsByIndex[idx] = startAtMs;

  const html = `
    <div class="quiz-root">
      <div class="top-bar">
        <button id="retireBtn" class="pause-btn" type="button">やめる</button>
        <div class="timer-pill" id="timerText">⏱ ${TIME_LIMIT_SEC}</div>
      </div>

      <div class="players-row">
        ${run.players.map((p, pi) => {
          const name = p.clientId ? (p.profile?.name ?? `P${pi+1}`) : "空き";
          const pt = Number(run.points?.[pi] ?? 0);
          return `
            <div class="battle-player ${p.clientId ? "" : "inactive"}">
              <div class="pname">${name}</div>
              <div class="av-mark" id="mark_${pi}"></div>
              <div class="ppt"><span id="pt_${pi}">${pt}</span><span class="pptUnit">pt</span></div>
            </div>`;
        }).join("")}
      </div>

      <div class="card quiz-card"><div class="card-inner">
        <div class="question-no">Q${idx+1} / ${total}</div>
        <div class="question-text">${q.question_text ?? q.question ?? q.text ?? ""}</div>
        <div class="choices-grid" id="choicesGrid"></div>
      </div></div>
    </div>

    <style>
      .top-bar{ display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px; }
      .players-row{ display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:8px; margin-bottom:10px; }
      .battle-player{ padding:8px; border-radius:12px; background:rgba(255,255,255,.75); border:2px solid rgba(0,0,0,.12); text-align:center; }
      .battle-player.inactive{ opacity:.45; }
      .pname{ font-size:12px; font-weight:900; }
      .av-mark{ margin:6px 0; font-size:18px; min-height:1.2em; }
      .choices-grid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px; }
      .choice-btn{ width:100%; border-radius:14px; padding:10px; border:2px solid rgba(0,0,0,.15); background:#fff; font-weight:900; }
      .choice-btn:disabled{ opacity:.6; }
    </style>
  `;

  setTimeout(() => {
    const grid = document.getElementById("choicesGrid");
    const timerEl = document.getElementById("timerText");
    const retireBtn = document.getElementById("retireBtn");

    let ended = false;
    let answered = false;

    // choices render
    grid.innerHTML = "";
    choices.forEach((c, i) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.type = "button";
      btn.textContent = c.text || `選択肢${i+1}`;
      btn.addEventListener("click", () => {
        if (ended || answered) return;
        answered = true;
        const timeMs = Math.max(0, Date.now() - startAtMs);
        playSe("assets/sounds/se/se_decide.mp3", { volume: 0.9 });
        // ✅ server.js 仕様：type/game:answer + choiceIndex/timeMs（roomIdは battleClient が自動付与）
        bc.sendAnswer({ choiceIndex: i, timeMs });
        // disable
        grid.querySelectorAll("button").forEach(b => b.disabled = true);
      });
      grid.appendChild(btn);
    });

    function setMarkByClientId(cid, mark) {
      const pi = clientIdToPi[cid];
      if (!Number.isFinite(pi)) return;
      const el = document.getElementById(`mark_${pi}`);
      if (el) el.textContent = mark;
    }

    function updatePointsUi() {
      for (let pi = 0; pi < 4; pi++) {
        const el = document.getElementById(`pt_${pi}`);
        if (el) el.textContent = String(Number(run.points?.[pi] ?? 0));
      }
    }

    // ✅ game:event 購読（多重防止）
    if (!run.__quizSubscribed) {
      run.__quizSubscribed = true;

      run.__onGameEvent = (ev) => {
        if (!ev?.type) return;

        // server.js: beginPayload
        if (ev.type === "game:begin") {
          const bp = ev.beginPayload || {};
          if (Array.isArray(bp.players)) run.players = dedupePlayers(bp.players);
          if (Array.isArray(bp.questionIds)) run.questionIds = bp.questionIds;
          return;
        }

        // server.js: {type:"game:answer", clientId, qIndex}
        if (ev.type === "game:answer") {
          if (Number(ev.qIndex) !== idx) return;
          run._answeredPing[idx] = run._answeredPing[idx] || new Set();
          run._answeredPing[idx].add(ev.clientId);

          // 回答済みだけ見せる（選択肢/正誤は questionEnd で判明）
          setMarkByClientId(ev.clientId, "…");
          return;
        }

        // server.js: {type:"game:questionEnd", qIndex, answers}
        if (ev.type === "game:questionEnd") {
          const qIndex = Number(ev.qIndex);
          if (!Number.isFinite(qIndex) || qIndex !== idx) return;

          // 1問1回だけ採点（無限pt増殖防止）
          if (run._scored[qIndex]) return;
          run._scored[qIndex] = true;

          const answers = ev.answers || {};
          run._answers[qIndex] = answers;

          // 正解者リスト（timeMsで順位）
          const correctList = [];
          for (const [cid, a] of Object.entries(answers)) {
            const choiceIndex = Number(a?.choiceIndex);
            const timeMs = Number(a?.timeMs);
            if (choiceIndex === -1) continue;
            const ok = (correctIdx !== null) && (choiceIndex === correctIdx);
            if (ok) correctList.push({ clientId: cid, timeMs: Number.isFinite(timeMs) ? timeMs : 999999 });
          }
          const award = awardPointsBySpeed(correctList);

          // marks & points
          for (const [cid, a] of Object.entries(answers)) {
            const choiceIndex = Number(a?.choiceIndex);
            if (choiceIndex === -1) {
              setMarkByClientId(cid, "⏱");
              continue;
            }
            const ok = (correctIdx !== null) && (choiceIndex === correctIdx);
            setMarkByClientId(cid, ok ? "〇" : "×");

            const pi = clientIdToPi[cid];
            if (Number.isFinite(pi)) {
              run.points[pi] = Number(run.points?.[pi] ?? 0) + (award.get(cid) ?? 0);
            }
          }
          updatePointsUi();
          return;
        }

        // server.js: {type:"game:next", index}
        if (ev.type === "game:next") {
          const next = Number(ev.index);
          if (!Number.isFinite(next)) return;
          run.index = next;
          ended = true;
          goto(`#battleQuiz?i=${run.index}&t=${Date.now()}`);
          return;
        }

        // server.js: {type:"game:game:finished", scores}
        if (ev.type === "game:finished") {
          ended = true;
          goto("#battleResult");
        }
      };

      bc.on("game:event", run.__onGameEvent);
    }

    // timer (未回答はタイムアップで -1 送信 → 全員回答成立 → serverが次へ)
    const timerStartMs = startAtMs;
    let remain = TIME_LIMIT_SEC;
    timerEl.textContent = `⏱ ${remain}`;

    const timerIv = setInterval(() => {
      if (ended) return;
      const elapsed = (Date.now() - timerStartMs) / 1000;
      const newRemain = Math.max(0, Math.ceil(TIME_LIMIT_SEC - elapsed));
      if (newRemain !== remain) {
        remain = newRemain;
        timerEl.textContent = `⏱ ${remain}`;
      }
      if (elapsed >= TIME_LIMIT_SEC) {
        clearInterval(timerIv);
        if (!answered) {
          answered = true;
          // ✅ タイムアップ未回答：choiceIndex=-1 を送信
          bc.sendAnswer({ choiceIndex: -1, timeMs: TIME_LIMIT_SEC * 1000 });
          grid.querySelectorAll("button").forEach(b => b.disabled = true);
        }
      }
    }, 100);

    retireBtn?.addEventListener("click", () => {
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.85 });
      if (confirm("対戦を中断して戻りますか？（結果は保存されません）")) {
        ended = true;
        clearInterval(timerIv);
        state.currentRun = null;
        goto("#battle");
      }
    });
  }, 0);

  return html;
}
