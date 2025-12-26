import { saveNow } from "../systems/saveManager.js";

/**
 * クイズ画面（元構成）
 * - 一時停止（左上）→ 再開/リタイアのモーダル。停止中はタイマー＆タイプライター停止。
 * - ステージ名（左）/タイマー（右）
 * - 問題文：枠付き＋タイプライター（表示中も選択可能）
 * - アバター表示ゾーン：背景→アバター(body/head)→クイズ台（中央付近に小さめ）
 * - 選択肢：2x2 大きめ、テキストは縦横中央寄せ
 */

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
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
  const { save, masters } = state;
  if (!isStageUnlocked(stage, save)) return { ok: false, reason: "locked" };

  if (!state.currentRun || state.currentRun.stageId !== stage.id) {
    const ids = Array.isArray(stage.question_ids) ? stage.question_ids.slice() : [];
    const qids = ids.filter((id) => masters?.questionById?.has(id));

    state.currentRun = {
      stageId: stage.id,
      questionIds: qids,
      currentIndex: 0,
      correctCount: 0,
      answers: [],
      startedAt: new Date().toISOString(),
    };
  }
  return { ok: true };
}

function getItemById(items, id) {
  return (items || []).find((it) => it?.item_id === id) ?? null;
}

// 正解Indexのキーゆれ対策（questions.json は correct_index）
function getCorrectIndex(q) {
  const v = q?.correct_choice_index ?? q?.correct_index ?? q?.answer_index ?? q?.correct;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 画像パスフォールバック（assets/images と images の揺れ、ファイル名の揺れも吸収）
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
  const stageId = params?.stageId ?? null;

  const stage = (masters.stages || []).find((s) => s.id === stageId);

  if (!stage) {
    return `
      <div class="card"><div class="card-inner">
        <h2 style="margin:0 0 8px;">ステージが見つかりません</h2>
        <div class="notice">stageId: ${stageId || "(none)"} を確認してください。</div>
        <div class="space"></div>
        <button class="btn" onclick="location.hash='#home'">ホームへ</button>
      </div></div>
    `;
  }

  if (!isStageUnlocked(stage, save)) {
    return `
      <div class="card"><div class="card-inner">
        <h2 style="margin:0 0 8px;">未解放ステージ</h2>
        <div class="notice">このステージはまだ解放されていません。</div>
        <div class="space"></div>
        <button class="btn" onclick="location.hash='#home'">ホームへ</button>
      </div></div>
    `;
  }

  // progress 初期
  if (!save.progress) save.progress = {};
  if (!save.progress.stages) save.progress.stages = {};
  if (!save.progress.stages[stageId]) {
    save.progress.stages[stageId] = { cleared: false, bestScore: null, lastPlayedAt: null };
  }
  save.progress.stages[stageId].lastPlayedAt = new Date().toISOString();
  saveNow(save);

  // Run 初期化
  const runInit = ensureRun(state, stage);
  if (!runInit.ok) {
    return `
      <div class="card"><div class="card-inner">
        <h2 style="margin:0 0 8px;">開始できません</h2>
        <div class="notice">reason: ${runInit.reason}</div>
        <div class="space"></div>
        <button class="btn" onclick="location.hash='#home'">ホームへ</button>
      </div></div>
    `;
  }

  const run = state.currentRun;
  const total = run.questionIds.length;

  const qid = run.questionIds[clamp(run.currentIndex, 0, Math.max(0, total - 1))];
  const q = masters?.questionById?.get(qid);

  if (!q) {
    return `
      <div class="card"><div class="card-inner">
        <h2 style="margin:0 0 8px;">問題が見つかりません</h2>
        <div class="notice">stage: ${stageId} / questionId: ${qid}</div>
        <div class="space"></div>
        <button class="btn" onclick="location.hash='#home'">ホームへ</button>
      </div></div>
    `;
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
    "/assets/images/quiz/avatar_bg.png",
    "/assets/images/quiz/avetar_bg.png",
    "/images/quiz/avatar_bg.png",
    "/images/quiz/avetar_bg.png",
  ];
  const standCandidates = [
    "/assets/images/quiz/quiz_stand.png",
    "/images/quiz/quiz_stand.png",
  ];

  const avatarZoneHtml = `
    <div class="avatar-zone">
      <div class="avatar-stage">
        ${imgWithFallback("az-bg", bgCandidates[0], bgCandidates.slice(1))}
        <div class="az-actor">
          ${eqBody?.asset_path ? `<img class="az-layer az-body" src="${eqBody.asset_path}" alt="" onerror="this.style.display='none'">` : ``}
          ${eqHead?.asset_path ? `<img class="az-layer az-head" src="${eqHead.asset_path}" alt="" onerror="this.style.display='none'">` : ``}
          ${imgWithFallback("az-layer az-stand", standCandidates[0], standCandidates.slice(1))}
        </div>
      </div>
    </div>
  `;

  // 選択肢（2x2）
  const choices = Array.isArray(q.choices) ? q.choices : [];
  const choicesHtml = choices.map((c, idx) => {
    const isImage = c?.type === "image" && c?.image_url;
    const label = (c?.label ?? "").trim();

    return `
      <button class="choice-btn" data-idx="${idx}" type="button">
        ${isImage ? `<img class="choice-img" src="${c.image_url}" alt="" onerror="this.style.display='none'">` : ``}
        <div class="choice-text">${label}</div>
      </button>
    `;
  }).join("");

  setTimeout(() => {
    let remaining = safeLimit;
    let answered = false;
    let paused = false;

    const timerEl = document.getElementById("timerText");
    const pauseBtn = document.getElementById("pauseBtn");
    const modal = document.getElementById("pauseModal");
    const resumeBtn = document.getElementById("resumeBtn");
    const retireBtn = document.getElementById("retireBtn");
    const verdictEl = document.getElementById("verdict");
    const typeEl = document.getElementById("typewriter");

    const choiceButtons = Array.from(document.querySelectorAll(".choice-btn"));

    function setTimerText() {
      if (timerEl) timerEl.textContent = `⏱ ${remaining}`;
    }

    function setChoicesEnabled(enabled) {
      choiceButtons.forEach((b) => (b.disabled = !enabled));
    }

    function openPause() {
      if (answered) return;
      paused = true;
      if (modal) modal.style.display = "flex";
    }

    function closePause() {
      paused = false;
      if (modal) modal.style.display = "none";
    }

    function finishByTimeout() {
      if (answered) return;
      answered = true;
      setChoicesEnabled(false);
      verdictEl.textContent = "×";
      verdictEl.className = "verdict bad";

      run.answers.push({
        questionId: qid,
        selectedIndex: null,
        correctIndex: getCorrectIndex(q),
        isCorrect: false,
        reason: "timeout",
      });

      setTimeout(() => {
        if (run.currentIndex + 1 >= total) goto("#result");
        else {
          run.currentIndex += 1;
          goto(`#quiz?stageId=${encodeURIComponent(stageId)}`);
        }
      }, 900);
    }

    function finishByAnswer(selectedIdx) {
      if (answered) return;
      answered = true;
      closePause();
      setChoicesEnabled(false);

      const correctIdx = getCorrectIndex(q);
      const isCorrect = (correctIdx != null) ? (selectedIdx === correctIdx) : false;

      verdictEl.textContent = isCorrect ? "〇" : "×";
      verdictEl.className = `verdict ${isCorrect ? "good" : "bad"}`;

      run.answers.push({
        questionId: qid,
        selectedIndex: selectedIdx,
        correctIndex: correctIdx,
        isCorrect,
        reason: "answer",
      });

      if (isCorrect) run.correctCount += 1;

      setTimeout(() => {
        if (run.currentIndex + 1 >= total) goto("#result");
        else {
          run.currentIndex += 1;
          goto(`#quiz?stageId=${encodeURIComponent(stageId)}`);
        }
      }, 900);
    }

    // タイマー
    setTimerText();
    const interval = setInterval(() => {
      if (answered) return;
      if (paused) return;
      remaining -= 1;
      setTimerText();
      if (remaining <= 0) {
        clearInterval(interval);
        finishByTimeout();
      }
    }, 1000);

    // 一時停止
    pauseBtn?.addEventListener("click", () => openPause());
    resumeBtn?.addEventListener("click", () => closePause());
    retireBtn?.addEventListener("click", () => {
      clearInterval(interval);
      state.currentRun = null;
      closePause();
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

    // タイプライター（少し遅く）
    const fullText = String(q.question_text ?? "");
    let i = 0;
    const speedMs = 38; // ← 以前より遅く（体感しやすい）
    typeEl.textContent = "";

    const t = setInterval(() => {
      if (answered) {
        clearInterval(t);
        return;
      }
      if (paused) return;
      if (i >= fullText.length) {
        clearInterval(t);
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
        .quiz-root{
          max-width: 520px;
          margin: 0 auto;
          padding: 14px 12px 18px;
        }

        .top-bar{
          display:flex;
          justify-content:flex-start;
          margin-bottom: 10px;
        }
        .pause-btn{
          appearance:none;
          border: 2px solid rgba(31,42,68,.18);
          background: rgba(255,255,255,.96);
          border-radius: 14px;
          padding: 10px 12px;
          font-weight: 1000;
          cursor:pointer;
          box-shadow: 0 10px 18px rgba(31,42,68,.12);
        }
        .pause-btn:active{ transform: translateY(2px); }

        .stage-row{
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap: 10px;
          padding: 0 2px 6px;
        }
        .stage-name{
          font-weight: 1000;
          font-size: 16px;
          color: var(--text);
          overflow:hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .timer-pill{
          border: 2px solid rgba(31,42,68,.18);
          background: rgba(255,255,255,.96);
          border-radius: 999px;
          padding: 8px 10px;
          font-weight: 1000;
          min-width: 84px;
          text-align:center;
          box-shadow: 0 10px 18px rgba(31,42,68,.10);
        }

        .divider{
          height: 1px;
          background: rgba(31,42,68,.16);
          margin: 10px 0;
        }

        .question-box{
          border: 2px solid rgba(31,42,68,.20);
          background: rgba(255,255,255,.96);
          border-radius: 18px;
          padding: 14px 14px;
          box-shadow: 0 12px 20px rgba(31,42,68,.12);
          min-height: 82px;
        }
        .question-text{
          font-weight: 1000;
          color: var(--text);
          line-height: 1.55;
          word-break: break-word;
          white-space: pre-wrap;
          font-size: 18px; /* ← 問題文を大きめに */
        }

        /* アバター表示ゾーン */
        .avatar-zone{ margin: 0; }
        .avatar-stage{
          width: 100%;
          max-width: 420px;
          margin: 0 auto;
          aspect-ratio: 16 / 9;
          position: relative;
          border-radius: 18px;
          border: 2px solid rgba(31,42,68,.18);
          background: rgba(255,255,255,.92);
          box-shadow: 0 12px 22px rgba(31,42,68,.14);
          overflow: hidden;
        }
        .az-bg{
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          pointer-events: none;
        }
        .az-actor{
          position: absolute;
          left: 50%;
          top: 58%;
          transform: translate(-50%, -50%);
          width: 64%;
          aspect-ratio: 1 / 1;
          pointer-events: none;
        }
        .az-layer{
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .az-body{ z-index: 1; }
        .az-head{ z-index: 2; }
        .az-stand{ z-index: 3; }

        /* 選択肢（縦横中央寄せ） */
        .choices-grid{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .choice-btn{
          appearance:none;
          border: 2px solid rgba(31,42,68,.18);
          background: rgba(255,255,255,.96);
          border-radius: 18px;
          padding: 12px;
          cursor:pointer;
          box-shadow: 0 12px 20px rgba(31,42,68,.14);
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center; /* ← 縦方向も中央寄せ */
          gap: 10px;
          min-height: 110px;
        }
        .choice-btn:active{ transform: translateY(2px); }
        .choice-btn:disabled{ opacity:.55; cursor:not-allowed; transform:none; box-shadow:none; }

        .choice-img{
          width: 100%;
          max-height: 110px;
          object-fit: contain;
          border-radius: 14px;
          border: 2px solid rgba(31,42,68,.12);
          background: rgba(255,255,255,.95);
        }
        .choice-text{
          width: 100%;
          text-align:center;              /* ← 横中央 */
          font-weight: 1000;
          font-size: 14px;
          color: var(--text);
          word-break: break-word;
          display:flex;                   /* ← 縦中央 */
          align-items:center;
          justify-content:center;
          min-height: 24px;
        }

        /* 大きい〇× */
        .verdict{
          position: fixed;
          left: 50%;
          top: 46%;
          transform: translate(-50%, -50%);
          font-size: 96px;
          font-weight: 1000;
          line-height: 1;
          opacity: 0;
          pointer-events:none;
          text-shadow: 0 18px 32px rgba(31,42,68,.20);
          transition: opacity .12s ease;
          z-index: 1200;
        }
        .verdict.good{ opacity: 1; color: var(--good); }
        .verdict.bad{ opacity: 1; color: var(--bad); }

        /* 一時停止モーダル */
        .modal{
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,.35);
          backdrop-filter: blur(6px);
          display:flex;
          align-items:center;
          justify-content:center;
          z-index: 1100;
          padding: 14px;
        }
        .modal-sheet{
          width: 92%;
          max-width: 420px;
          border-radius: 22px;
          border: 2px solid rgba(31,42,68,.18);
          background: linear-gradient(180deg, #ffffff, #f8fafc);
          box-shadow: 0 22px 50px rgba(31,42,68,.22);
          padding: 14px;
          color: var(--text);
        }
        .modal-title{
          font-weight: 1000;
          font-size: 16px;
        }
        .modal-sub{
          margin-top: 6px;
          color: var(--muted);
          font-size: 12px;
          line-height: 1.5;
        }
      </style>
    </div>
  `;
}
