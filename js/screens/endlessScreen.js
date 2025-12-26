import { saveNow } from "../systems/saveManager.js";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function getCorrectIndex(q) {
  const v = q?.correct_index ?? q?.correct_choice_index ?? q?.answer_index ?? null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getItemById(items, id) {
  return (items || []).find((it) => it?.item_id === id) ?? null;
}

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

export function renderEndless({ state, goto }) {
  const { save, masters } = state;

  const questionById = masters?.questionById;
  const allQuestions = questionById ? Array.from(questionById.values()) : [];
  if (allQuestions.length === 0) {
    return `
      <div class="card"><div class="card-inner">
        <h2>エンドレス</h2>
        <div class="notice">問題がありません（questions.json を確認してください）</div>
        <div class="space"></div>
        <button class="btn secondary" onclick="location.hash='#home'">ホームへ</button>
      </div></div>
    `;
  }

  const MAX_MISS = 3;

  // run 初期化（stateに保持）
  if (!state.endlessRun) {
    state.endlessRun = {
      order: shuffle(allQuestions.map((q) => q.id)),
      cursor: 0,
      correct: 0,
      answered: 0,
      miss: 0,
      paused: false,
      finished: false,
    };
  }
  const run = state.endlessRun;

  // 現在問題
  const qid = run.order[run.cursor % run.order.length];
  const q = questionById.get(qid);

  // アバター表示ゾーン（ステージと同じ）
  const avatarItems = masters?.avatar_items ?? masters?.avatarItems ?? [];
  const eq = save.avatar?.equipped ?? { body: null, head: null };
  const eqBody = getItemById(avatarItems, eq.body);
  const eqHead = getItemById(avatarItems, eq.head);

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

  const choices = Array.isArray(q?.choices) ? q.choices : [];
  const choicesHtml = choices
    .map((c, idx) => {
      const isImage = c?.type === "image" && c?.image_url;
      const label = (c?.label ?? "").trim();
      return `
        <button class="choice-btn" data-idx="${idx}" type="button">
          ${isImage ? `<img class="choice-img" src="${c.image_url}" alt="" onerror="this.style.display='none'">` : ``}
          <div class="choice-text">${label}</div>
        </button>
      `;
    })
    .join("");

  setTimeout(() => {
    const pauseBtn = document.getElementById("enPauseBtn");
    const modal = document.getElementById("enPauseModal");
    const resumeBtn = document.getElementById("enResumeBtn");
    const retireBtn = document.getElementById("enRetireBtn");

    const verdictEl = document.getElementById("enVerdict");
    const typeEl = document.getElementById("enTypewriter");

    const hudEl = document.getElementById("enHudText");

    const resultModal = document.getElementById("enResultModal");
    const resultText = document.getElementById("enResultText");
    const resultOkBtn = document.getElementById("enResultOkBtn");

    const choiceButtons = Array.from(document.querySelectorAll(".choice-btn"));

    function setHud() {
      hudEl.textContent = `正解 ${run.correct} / 回答 ${run.answered}　ミス ${run.miss}/${MAX_MISS}`;
    }

    function setChoicesEnabled(enabled) {
      choiceButtons.forEach((b) => (b.disabled = !enabled));
    }

    function openPause() {
      if (run.finished) return;
      run.paused = true;
      modal.style.display = "flex";
    }

    function closePause() {
      run.paused = false;
      modal.style.display = "none";
    }

    function finish() {
      run.finished = true;
      setChoicesEnabled(false);

      // 報酬は仕様が未確定なので、今回はコイン付与なし（後で1行で変更可能）
      // もし付与する場合はここで save.economy.coins += ...; saveNow(save);

      saveNow(save);

      resultText.textContent = `結果\n正解 ${run.correct}\n回答 ${run.answered}\nミス ${run.miss}/${MAX_MISS}`;
      resultModal.style.display = "flex";
    }

    function nextQuestion() {
      run.cursor += 1;
      goto("#endless");
    }

    // HUD
    setHud();

    // 一時停止
    pauseBtn.addEventListener("click", () => openPause());
    resumeBtn.addEventListener("click", () => closePause());
    retireBtn.addEventListener("click", () => {
      state.endlessRun = null;
      goto("#home");
    });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closePause();
    });

    // 結果OK
    resultOkBtn.addEventListener("click", () => {
      state.endlessRun = null;
      goto("#home");
    });

    // タイプライター（クイズと同程度）
    const fullText = String(q?.question_text ?? "");
    typeEl.textContent = "";
    let i = 0;
    const speedMs = 38;

    const typeTimer = setInterval(() => {
      if (run.finished) {
        clearInterval(typeTimer);
        return;
      }
      if (run.paused) return;
      if (i >= fullText.length) {
        clearInterval(typeTimer);
        return;
      }
      typeEl.textContent += fullText[i];
      i += 1;
    }, speedMs);

    // 選択肢
    choiceButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (run.finished) return;
        if (run.paused) return;

        const idx = Number(btn.dataset.idx);
        const correctIdx = getCorrectIndex(q);

        run.answered += 1;
        const isCorrect = correctIdx != null ? idx === correctIdx : false;

        if (isCorrect) run.correct += 1;
        else run.miss += 1;

        setHud();

        verdictEl.textContent = isCorrect ? "〇" : "×";
        verdictEl.className = `verdict ${isCorrect ? "good" : "bad"}`;

        setTimeout(() => {
          verdictEl.className = "verdict";
          if (run.miss >= MAX_MISS) finish();
          else nextQuestion();
        }, 420);
      });
    });
  }, 0);

  return `
    <div class="quiz-root">
      <div class="top-bar">
        <button id="enPauseBtn" class="pause-btn" type="button">⏸ 一時停止</button>
      </div>

      <div class="stage-row">
        <div class="stage-name">エンドレス</div>
        <div class="timer-pill" style="min-width:auto;padding:8px 12px;">3ミスで終了</div>
      </div>

      <div id="enHudText" style="margin:-4px 2px 6px;color:var(--muted);font-size:12px;font-weight:900;"></div>

      <div class="divider"></div>

      <div class="question-box">
        <div id="enTypewriter" class="question-text"></div>
      </div>

      <div class="divider"></div>

      ${avatarZoneHtml}

      <div class="divider"></div>

      <div class="choices-grid">
        ${choicesHtml}
      </div>

      <div id="enVerdict" class="verdict"></div>

      <!-- 一時停止モーダル -->
      <div id="enPauseModal" class="modal" style="display:none;">
        <div class="modal-sheet">
          <div class="modal-title">一時中断</div>
          <div class="modal-sub">再開するか、リタイアするか選んでください。</div>
          <div class="space"></div>
          <div class="row">
            <button id="enResumeBtn" class="btn" type="button">再開</button>
            <button id="enRetireBtn" class="btn secondary" type="button">リタイア</button>
          </div>
        </div>
      </div>

      <!-- 結果モーダル -->
      <div id="enResultModal" class="modal" style="display:none;">
        <div class="modal-sheet">
          <div class="modal-title">結果</div>
          <pre id="enResultText" class="notice" style="white-space:pre-wrap;margin:10px 0 0;"></pre>
          <div class="space"></div>
          <button id="enResultOkBtn" class="btn" type="button">ホームへ</button>
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
        .stage-name{ font-weight:1000; font-size:16px; color:var(--text); }
        .timer-pill{
          border:2px solid rgba(31,42,68,.18); background:rgba(255,255,255,.96);
          border-radius:999px; padding:8px 10px; font-weight:1000; text-align:center;
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

        /* アバター表示ゾーン */
        .avatar-zone{ margin: 0; }
        .avatar-stage{
          width:100%; max-width:420px; margin:0 auto; aspect-ratio:16/9;
          position:relative; border-radius:18px; border:2px solid rgba(31,42,68,.18);
          background:rgba(255,255,255,.92); box-shadow:0 12px 22px rgba(31,42,68,.14);
          overflow:hidden;
        }
        .az-bg{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; pointer-events:none; }
        .az-actor{
          position:absolute; left:50%; top:58%; transform:translate(-50%,-50%);
          width:64%; aspect-ratio:1/1; pointer-events:none;
        }
        .az-layer{ position:absolute; inset:0; width:100%; height:100%; object-fit:contain; }
        .az-body{ z-index:1; } .az-head{ z-index:2; } .az-stand{ z-index:3; }

        /* 選択肢 */
        .choices-grid{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .choice-btn{
          appearance:none; border:2px solid rgba(31,42,68,.18); background:rgba(255,255,255,.96);
          border-radius:18px; padding:12px; cursor:pointer; box-shadow:0 12px 20px rgba(31,42,68,.14);
          display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px;
          min-height:110px;
        }
        .choice-btn:active{ transform: translateY(2px); }
        .choice-img{
          width:100%; max-height:110px; object-fit:contain; border-radius:14px;
          border:2px solid rgba(31,42,68,.12); background:rgba(255,255,255,.95);
        }
        .choice-text{
          width:100%; text-align:center; font-weight:1000; font-size:14px; color:var(--text);
          display:flex; align-items:center; justify-content:center; min-height:24px;
        }

        .verdict{
          position: fixed; left:50%; top:46%; transform:translate(-50%,-50%);
          font-size:96px; font-weight:1000; line-height:1; opacity:0; pointer-events:none;
          text-shadow:0 18px 32px rgba(31,42,68,.20); transition: opacity .12s ease; z-index:1200;
        }
        .verdict.good{ opacity:1; color:var(--good); }
        .verdict.bad{ opacity:1; color:var(--bad); }

        .modal{
          position:fixed; inset:0; background:rgba(0,0,0,.35); backdrop-filter:blur(6px);
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
