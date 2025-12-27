import { playSe } from "../systems/audioManager.js";

// GitHub Pages (Project Pages) / ローカル両対応：このモジュール位置から assets を解決する
const ROOT = new URL("../../", import.meta.url);
const asset = (p) => new URL(String(p || "").replace(/^\/+/, ""), ROOT).toString();
const normalizeAsset = (p) => {
  if (!p) return "";
  const s = String(p);
  if (/^https?:\/\//.test(s) || /^data:/.test(s)) return s;
  return asset(s);
};

function ensureCssLoadedOnce(href, id) {
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}


function isStageUnlocked(stage, save) {
  const cond = stage.unlock_condition?.type ?? "always";
  if (cond === "always") return true;
  if (cond === "stage_clear") {
    const need = stage.unlock_condition?.stage_id;
    return Boolean(save.progress?.stages?.[need]?.cleared);
  }
  return false;
}

function ensureRun(state, stage) {
  const { save } = state;
  if (!isStageUnlocked(stage, save)) return { ok: false, reason: "locked" };

  if (!state.currentRun || state.currentRun.stageId !== stage.id || state.currentRun.mode !== "stage") {
    const qids = Array.isArray(stage.question_ids) ? stage.question_ids.slice() : [];
    state.currentRun = {
      mode: "stage",
      stageId: stage.id,
      stageName: stage.name ?? stage.id,
      questionIds: qids,
      cursor: 0,
      correctCount: 0,
      answers: [],
      startedAt: new Date().toISOString(),
      totalCount: qids.length, // ✅ リザルト表示用
    };
  }
  return { ok: true };
}

function getCorrectIndex(q) {
  const v = q?.correct_choice_index ?? q?.correct_index ?? q?.answer_index ?? q?.correct;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function getItemById(items, id) {
  return (items || []).find((it) => it?.item_id === id) ?? null;
}

// 画像パスフォールバック
function imgWithFallback(className, primarySrc, fallbackSrcList = []) {
  const fallbacks = [primarySrc, ...fallbackSrcList].filter(Boolean);
  const data = encodeURIComponent(JSON.stringify(fallbacks));
  return `<img class="${className}" src="${fallbacks[0]}" data-fallbacks="${data}"
    onerror="
      try {
        const arr = JSON.parse(decodeURIComponent(this.dataset.fallbacks||'[]'));
        const cur = this.getAttribute('src');
        const idx = arr.indexOf(cur);
        const next = arr[idx+1];
        if (next) { this.src = next; return; }
      } catch(e){}
      this.style.display='none';
    "
    alt="">
  `;
}

export function renderQuiz({ state, goto, params }) {
  const { save, masters } = state;

  // ✅ 共通レイアウトCSS（最初だけ崩れて、エンドレス後に直る問題の対策）
  ensureCssLoadedOnce(asset("assets/css/endless.css"), "quiz-base-css");

  const stageId = params?.stageId ?? null;
  const stage = masters?.stageById?.get(stageId);
  if (!stage) {
    return `
      <div class="card"><div class="card-inner">
        <h2>ステージ</h2>
        <div class="notice">stageId が不正です。</div>
        <div class="space"></div>
        <a class="btn secondary" href="#home">ホームへ</a>
      </div></div>
    `;
  }

  const init = ensureRun(state, stage);
  if (!init.ok) {
    return `
      <div class="card"><div class="card-inner">
        <h2>${stage.name ?? "ステージ"}</h2>
        <div class="notice">このステージは未解放です。</div>
        <div class="space"></div>
        <a class="btn secondary" href="#home">ホームへ</a>
      </div></div>
    `;
  }

  const run = state.currentRun;

  // ✅ もし全問終わってたら結果へ（安全策）
  if (run.cursor >= (run.questionIds?.length ?? 0)) {
    goto("#result");
    return "";
  }

  const qid = run.questionIds?.[run.cursor] ?? null;
  const q = masters?.questionById?.get(qid);

  if (!q) {
    // 事故回避：結果へ
    goto("#result");
    return "";
  }

  const timeLimit = Number(q.time_limit ?? 10);
  const safeLimit = Number.isFinite(timeLimit) ? clamp(timeLimit, 3, 60) : 10;

  // アバター表示ゾーン（背景→アバター→クイズ台）
  const avatarItems = masters?.avatar_items ?? masters?.avatarItems ?? [];
  const eq = save.avatar?.equipped ?? { body: null, head: null };
  const eqBody = getItemById(avatarItems, eq.body);
  const eqHead = getItemById(avatarItems, eq.head);

  // 画像パス（両方のルートを試す / ファイル名の揺れも吸収）
  const bgCandidates = [
    asset("assets/images/quiz/avatar_bg.png"),
    asset("assets/images/quiz/avetar_bg.png"),
    asset("images/quiz/avatar_bg.png"),
    asset("images/quiz/avetar_bg.png"),
  ];
  const standCandidates = [
    asset("assets/images/quiz/quiz_stand.png"),
    asset("images/quiz/quiz_stand.png"),
  ];

  const avatarZoneHtml = `
    <div class="avatar-zone">
      <div class="avatar-stage">
        ${imgWithFallback("az-bg", bgCandidates[0], bgCandidates.slice(1))}
        <div class="az-actor">
          ${eqBody?.asset_path ? `<img class="az-layer az-body" src="${normalizeAsset(eqBody.asset_path)}" alt="" onerror="this.style.display='none'">` : ``}
          ${eqHead?.asset_path ? `<img class="az-layer az-head" src="${normalizeAsset(eqHead.asset_path)}" alt="" onerror="this.style.display='none'">` : ``}
          ${imgWithFallback("az-layer az-stand", standCandidates[0], standCandidates.slice(1))}
        </div>
      </div>
    </div>
  `;

  // 選択肢（2x2）※表示順をシャッフル（data-idx は元indexのまま）
  const choices = Array.isArray(q.choices) ? q.choices : [];

  const order = shuffle(choices.map((_, i) => i));

  const choicesHtml = order.map((origIdx) => {
    const c = choices[origIdx];
    const isImage = c?.type === "image" && c?.image_url;
    const label = (c?.label ?? "").trim();

    return `
      <button class="choice-btn" data-idx="${origIdx}" type="button">
        ${isImage ? `<img class="choice-img" src="${normalizeAsset(c.image_url)}" alt="" onerror="this.style.display='none'">` : ``}
        ${isImage ? `` : `<div class="choice-text">${label}</div>`}
      </button>
    `;
  }).join("");

  // DOMイベント/タイマー
  setTimeout(() => {
    const timerEl = document.getElementById("timerText");
    const typeEl = document.getElementById("typewriter");
    const verdictEl = document.getElementById("verdict");

// ✅ 出題SE（問題表示のたびに1回）
playSe("assets/sounds/se/se_question.mp3", { volume: 0.9 });


    const pauseBtn = document.getElementById("pauseBtn");
    const modal = document.getElementById("pauseModal");
    const resumeBtn = document.getElementById("resumeBtn");
    const retireBtn = document.getElementById("retireBtn");

    const choiceButtons = Array.from(document.querySelectorAll(".choice-btn"));

    let answered = false;
    let paused = false;

    let typeIntervalId = null;

    function cleanup() {
      try { clearInterval(tick); } catch (_) {}
      try { if (typeIntervalId) clearInterval(typeIntervalId); } catch (_) {}
      typeIntervalId = null;
    }

    // タイマー
    let remain = safeLimit;
    function setTimer() {
      if (timerEl) timerEl.textContent = `⏱ ${remain}`;
    }
    setTimer();

    const tick = setInterval(() => {
      if (answered) return;
      if (paused) return;
      remain -= 1;
      remain = Math.max(0, remain);
      setTimer();
      if (remain <= 0) {
        // 時間切れ
        finishByTimeout();
      }
    }, 1000);

    // 一時停止
    function openPause() {
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.75 });
      paused = true;
      if (modal) modal.style.display = "flex";
    }

    function closePause() {
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.75 });
      paused = false;
      if (modal) modal.style.display = "none";
    }

    function setChoicesEnabled(enabled) {
      choiceButtons.forEach((b) => (b.disabled = !enabled));
    }

    function goNextOrResult() {
      // ✅ 次の問題 or 結果
      if (run.cursor >= (run.questionIds?.length ?? 0)) {
        cleanup();
        goto("#result");
      } else {
        cleanup();
        goto("#quiz?stageId=" + encodeURIComponent(stage.id));
      }
    }

    function finishByTimeout() {
      if (answered) return;
      answered = true;
      setChoicesEnabled(false);

      playSe("assets/sounds/se/se_wrong.mp3", { volume: 0.95 });

      verdictEl.textContent = "×";
      verdictEl.className = "verdict bad";

      const correctIdx = getCorrectIndex(q);

      // ✅ ログ形式は resultScreen が拾える形で統一（qidも併記）
      run.answers.push({
        qid,
        questionId: qid,
        selectedIndex: null,
        chosenIndex: null,
        correctIndex: correctIdx,
        isCorrect: false,
        reason: "timeout",
      });

      run.cursor += 1;

      setTimeout(() => {
        goNextOrResult();
      }, 600);
    }

    function finishByAnswer(selectedIdx) {
      if (answered) return;
      if (paused) return;
      answered = true;
      setChoicesEnabled(false);

      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.8 });

      const correctIdx = getCorrectIndex(q);
      const isCorrect = (correctIdx != null) ? (selectedIdx === correctIdx) : false;

      playSe(
        isCorrect ? "assets/sounds/se/se_correct.mp3" : "assets/sounds/se/se_wrong.mp3",
        { volume: 0.95 }
      );

      verdictEl.textContent = isCorrect ? "〇" : "×";
      verdictEl.className = `verdict ${isCorrect ? "good" : "bad"}`;

      // ✅ ログ形式を統一（resultScreen対応）
      run.answers.push({
        qid,
        questionId: qid,
        selectedIndex: selectedIdx,
        chosenIndex: selectedIdx,
        correctIndex: correctIdx,
        isCorrect,
        reason: "answer",
      });

      if (isCorrect) run.correctCount += 1;

      run.cursor += 1;

      setTimeout(() => {
        goNextOrResult();
      }, 600);
    }

    // 一時停止
    pauseBtn?.addEventListener("click", () => openPause());
    resumeBtn?.addEventListener("click", () => closePause());
    retireBtn?.addEventListener("click", () => {
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.85 });
      cleanup();
      state.currentRun = null;
      if (modal) modal.style.display = "none";
      goto("#home");
    });
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) closePause();
    });

    // 選択
    choiceButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (answered) return;
        if (paused) return;
        const idx = Number(btn.dataset.idx);
        finishByAnswer(idx);
      });
    });

    // タイプライター
    const fullText = String(q.question_text ?? "");
    let i = 0;
    const speedMs = 38;
    if (typeEl) typeEl.textContent = "";

    typeIntervalId = setInterval(() => {
      if (answered) {
        clearInterval(typeIntervalId);
        typeIntervalId = null;
        return;
      }
      if (paused) return;
      if (!typeEl) return;
      if (i >= fullText.length) {
        clearInterval(typeIntervalId);
        typeIntervalId = null;
        return;
      }
      typeEl.textContent += fullText[i];
      i += 1;
    }, speedMs);
  }, 0);

  return `
    <div class="quiz-root">
      <div class="top-bar">
        <button id="pauseBtn" class="pause-btn" type="button">⏸ 一時停止</button>
      </div>

      <div class="stage-row">
        <div class="stage-name">${stage.name}</div>
        <div id="timerText" class="timer-pill">⏱ ${safeLimit}</div>
      </div>

      <div class="divider"></div>

      <div class="question-box">
        <div id="typewriter" class="question-text"></div>
      </div>

      <div class="divider"></div>

      ${avatarZoneHtml}

      <div class="divider"></div>

      <div class="choices-grid">
        ${choicesHtml}
      </div>

      <div id="verdict" class="verdict"></div>

      <div id="pauseModal" class="modal" style="display:none;">
        <div class="modal-sheet">
          <div class="modal-title">一時中断</div>
          <div class="modal-sub">再開するか、リタイアするか選んでください。</div>
          <div class="space"></div>
          <div class="row">
            <button id="resumeBtn" class="btn" type="button">再開</button>
            <button id="retireBtn" class="btn secondary" type="button">リタイア</button>
          </div>
        </div>
      </div>

      <style>
        .quiz-root{ max-width:520px; margin:0 auto; padding:14px 12px 18px; }
        .top-bar{ display:flex; justify-content:flex-start; margin-bottom:10px; }
        .pause-btn{
          appearance:none; border:2px solid rgba(31,42,68,.18); background:rgba(255,255,255,.96);
          border-radius:14px; padding:10px 12px; font-weight:1000; cursor:pointer;
          box-shadow:0 10px 18px rgba(31,42,68,.12);
        }
        .pause-btn:active{ transform: translateY(2px); }

        .stage-row{ display:flex; justify-content:space-between; align-items:center; gap:10px; padding:0 2px 6px; }
        .stage-name{ font-weight:1000; font-size:16px; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .timer-pill{
          border:2px solid rgba(31,42,68,.18); background:rgba(255,255,255,.96);
          border-radius:999px; padding:8px 10px; font-weight:1000; min-width:84px; text-align:center;
          box-shadow:0 10px 18px rgba(31,42,68,.10);
        }

        .divider{ height:1px; background:rgba(31,42,68,.16); margin:10px 0; }

        .question-box{
          border:2px solid rgba(31,42,68,.20); background:rgba(255,255,255,.96);
          border-radius:18px; padding:14px 14px; box-shadow:0 12px 20px rgba(31,42,68,.12);
          min-height:82px;
        }
        .question-text{
          font-weight:1000; color:var(--text); line-height:1.55; word-break:break-word;
          white-space:pre-wrap; font-size:18px;
        }

        .avatar-zone{ margin:0; }
        .avatar-stage{
          width:100%; max-width:420px; margin:0 auto; aspect-ratio:16/9; position:relative;
          border-radius:18px; border:2px solid rgba(31,42,68,.18); background:rgba(255,255,255,.92);
          box-shadow:0 12px 22px rgba(31,42,68,.14); overflow:hidden;
        }
        .az-bg{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; pointer-events:none; }
        .az-actor{
          position:absolute; left:50%; top:58%; transform:translate(-50%,-50%); width:64%;
          aspect-ratio:1/1; pointer-events:none;
        }
        .az-layer{ position:absolute; inset:0; width:100%; height:100%; object-fit:contain; }
        .az-body{ z-index:1; } .az-head{ z-index:2; } .az-stand{ z-index:3; }

        .choices-grid{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .choice-btn{
          appearance:none; border:2px solid rgba(31,42,68,.18); background:rgba(255,255,255,.96);
          border-radius:18px; padding:12px; cursor:pointer; box-shadow:0 12px 20px rgba(31,42,68,.14);
          display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px;
          min-height:110px;
        }
        .choice-btn:active{ transform: translateY(2px); }
        .choice-btn:disabled{ opacity:.55; cursor:not-allowed; transform:none; box-shadow:none; }

        .choice-img{
          width:100%; max-height:110px; object-fit:contain; border-radius:14px;
          border:2px solid rgba(31,42,68,.12); background:rgba(255,255,255,.95);
        }
        .choice-text{
          width:100%; text-align:center; font-weight:1000; font-size:14px; color:var(--text);
          word-break:break-word; display:flex; align-items:center; justify-content:center; min-height:24px;
        }

        .verdict{
          position:fixed; left:50%; top:46%; transform:translate(-50%,-50%);
          font-size:96px; font-weight:1000; line-height:1; opacity:0; pointer-events:none;
          text-shadow:0 18px 32px rgba(31,42,68,.20); transition:opacity .12s ease; z-index:1200;
        }
        .verdict.good{ opacity:1; color:var(--good); }
        .verdict.bad{ opacity:1; color:var(--bad); }

        .modal{
          position:fixed; inset:0; background:rgba(0,0,0,.35); backdrop-filter: blur(6px);
          display:flex; align-items:center; justify-content:center; z-index:1100; padding:14px;
        }
        .modal-sheet{
          width:92%; max-width:420px; border-radius:22px; border:2px solid rgba(31,42,68,.18);
          background: linear-gradient(180deg, #ffffff, #f8fafc);
          box-shadow:0 22px 50px rgba(31,42,68,.22); padding:14px; color:var(--text);
        }
        .modal-title{ font-weight:1000; font-size:16px; }
        .modal-sub{ margin-top:6px; color:var(--muted); font-size:12px; line-height:1.5; }
      </style>
    </div>
  `;
}
