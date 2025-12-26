import { saveNow } from "../systems/saveManager.js";
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

/**
 * タイムアタック
 * - ✅ バグ修正：問題回答ごとに timer tick が増殖して加速する問題を解消
 *   -> requestAnimationFrame / interval / ループSE を「画面世代(session)」で管理し、再描画時に必ず停止
 */

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
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getCorrectIndex(q) {
  const v = q?.correct_index ?? q?.correct_choice_index ?? q?.answer_index ?? null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

// ✅ 画面ライフサイクル用：以前のタイマー/interval/SEを止める
function stopTimeAttackRuntime(run) {
  try {
    if (run?._rafId) cancelAnimationFrame(run._rafId);
  } catch (_) {}
  run._rafId = null;

  try {
    if (run?._typeIntervalId) clearInterval(run._typeIntervalId);
  } catch (_) {}
  run._typeIntervalId = null;

  try {
    run?._warnSe?.pause?.();
    run?._urgentSe?.pause?.();
  } catch (_) {}
  run._warnSe = null;
  run._urgentSe = null;

  run._lastNow = null;
}

export function renderTimeAttack({ state, goto }) {
  // ✅ CSSを1回だけ読み込む（崩れ対策）
  ensureCssLoadedOnce(asset("assets/css/timeAttack.css"), "time-attack-css");

  const { save, masters } = state;
  const TOTAL_SEC = 60;

  const questionById = masters?.questionById;
  const allQuestions = questionById
    ? Array.from(questionById.values())
    : Array.isArray(masters?.questions)
      ? masters.questions
      : [];

  if (!allQuestions.length) {
    return `
      <div class="card"><div class="card-inner">
        <h2>タイムアタック</h2>
        <div class="notice">問題がありません</div>
        <a class="btn secondary" href="#home">ホームへ</a>
      </div></div>
    `;
  }

  // run初期化
  if (!state.timeAttackRun) {
    state.timeAttackRun = {
      order: shuffle(allQuestions.map((q) => q.id)),
      cursor: 0,
      correct: 0,
      answered: 0,
      remainMs: TOTAL_SEC * 1000,
      paused: false,
      finished: false,

      // ✅ runtime
      _sessionId: 0,
      _rafId: null,
      _typeIntervalId: null,
      _lastNow: null,
      _warnSe: null,
      _urgentSe: null,
    };
  }

  const run = state.timeAttackRun;

  // ✅ ここが肝：再描画のたびに、古いランタイムを必ず停止
  // （これをしないと tick が積み上がって「加速」する）
  stopTimeAttackRuntime(run);

  // ✅ 今回描画の“世代”ID
  run._sessionId = (run._sessionId || 0) + 1;
  const mySessionId = run._sessionId;

  const qid = run.order[run.cursor % run.order.length];
  const q = questionById ? questionById.get(qid) : allQuestions.find((x) => x.id === qid);

  if (!q) {
    state.timeAttackRun = null;
    goto("#home");
    return "";
  }

  // アバターゾーン
  const avatarItems = masters?.avatar_items ?? masters?.avatarItems ?? [];
  const eq = save.avatar?.equipped ?? { body: null, head: null };
  const eqBody = getItemById(avatarItems, eq.body);
  const eqHead = getItemById(avatarItems, eq.head);

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

  const choices = Array.isArray(q.choices) ? q.choices : [];
  const choicesHtml = choices.map((c, idx) => {
    const isImage = c?.type === "image" && c?.image_url;
    return `
      <button class="choice-btn" data-idx="${idx}" type="button">
        ${isImage ? `<img class="choice-img" src="${normalizeAsset(c.image_url)}" alt="" onerror="this.style.display='none'">` : ``}
        <div class="choice-text">${c?.label ?? ""}</div>
      </button>
    `;
  }).join("");

  setTimeout(() => {
    // ✅ 画面がすでに次世代に切り替わってたら何もしない
    if (state.timeAttackRun !== run) return;
    if (run._sessionId !== mySessionId) return;

    const timerEl = document.getElementById("taTimerText");
    const scoreEl = document.getElementById("taScoreText");
    const verdictEl = document.getElementById("taVerdict");
    const typeEl = document.getElementById("taTypewriter");

    const pauseBtn = document.getElementById("taPauseBtn");
    const modal = document.getElementById("taPauseModal");
    const resumeBtn = document.getElementById("taResumeBtn");
    const retireBtn = document.getElementById("taRetireBtn");

    const choiceButtons = Array.from(document.querySelectorAll(".choice-btn"));
    let answeredThisQ = false;

    playSe("assets/sounds/se/se_question.mp3", { volume: 0.9 });

    function stopTimerSe() {
      try { run._warnSe?.pause?.(); } catch (_) {}
      try { run._urgentSe?.pause?.(); } catch (_) {}
      run._warnSe = null;
      run._urgentSe = null;
    }

    function setTimerText() {
      const sec = Math.ceil(run.remainMs / 1000);
      if (timerEl) timerEl.textContent = `⏱ ${clamp(sec, 0, 999)}`;

      if (sec <= 5) {
        if (!run._urgentSe) {
          stopTimerSe();
          run._urgentSe = playSe("assets/sounds/se/se_timer_urgent.mp3", { loop: true, volume: 0.9 });
        }
      } else if (sec <= 10) {
        if (!run._warnSe) {
          run._warnSe = playSe("assets/sounds/se/se_timer_warn.mp3", { loop: true, volume: 0.8 });
        }
      }
    }

    function setScoreText() {
      if (scoreEl) scoreEl.textContent = `正解 ${run.correct} / 回答 ${run.answered}`;
    }

    function setChoicesEnabled(enabled) {
      choiceButtons.forEach((b) => (b.disabled = !enabled));
    }

    function openPause() {
      run.paused = true;
      stopTimerSe();
      if (modal) modal.style.display = "flex";
    }

    function closePause() {
      run.paused = false;
      if (modal) modal.style.display = "none";
    }

    function finishToResult() {
      if (run.finished) return;
      run.finished = true;
      stopTimerSe();

      state.currentRun = {
        mode: "time_attack",
        stageId: "time_attack",
        stageName: "タイムアタック",
        correctCount: run.correct,
        totalCount: run.answered,
      };

      save.stats = save.stats || {};
      save.stats.timeAttackBest = Math.max(save.stats.timeAttackBest || 0, run.correct);
      saveNow(save);

      stopTimeAttackRuntime(run);
      state.timeAttackRun = null;
      goto("#result");
    }

    function nextQuestion() {
      answeredThisQ = false;
      run.cursor += 1;
      // ✅ 次へ行く前に今世代のランタイムを停止（念のため）
      stopTimeAttackRuntime(run);
      goto("#timeAttack");
    }

    setTimerText();
    setScoreText();

    // ✅ RAF tick：世代IDが変わったら自動停止
    run._lastNow = performance.now();
    const tick = (now) => {
      if (state.timeAttackRun !== run) return;
      if (run._sessionId !== mySessionId) return; // 古い世代なら停止
      if (run.finished) return;

      const dt = now - (run._lastNow ?? now);
      run._lastNow = now;

      if (!run.paused) {
        run.remainMs -= dt;
        if (run.remainMs <= 0) {
          run.remainMs = 0;
          setTimerText();
          finishToResult();
          return;
        }
        setTimerText();
      }

      run._rafId = requestAnimationFrame(tick);
    };
    run._rafId = requestAnimationFrame(tick);

    pauseBtn?.addEventListener("click", () => {
      if (run.finished) return;
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.8 });
      openPause();
    });
    resumeBtn?.addEventListener("click", () => {
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.8 });
      closePause();
    });
    retireBtn?.addEventListener("click", () => {
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.8 });
      stopTimerSe();
      stopTimeAttackRuntime(run);
      state.timeAttackRun = null;
      goto("#home");
    });
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) {
        playSe("assets/sounds/se/se_decide.mp3", { volume: 0.8 });
        closePause();
      }
    });

    choiceButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (run.finished || run.paused) return;
        if (answeredThisQ) return;
        answeredThisQ = true;

        const idx = Number(btn.dataset.idx);
        const correctIdx = getCorrectIndex(q);
        const isCorrect = correctIdx != null ? idx === correctIdx : false;

        run.answered += 1;
        if (isCorrect) run.correct += 1;

        playSe("assets/sounds/se/se_decide.mp3", { volume: 0.8 });
        playSe(isCorrect ? "assets/sounds/se/se_correct.mp3" : "assets/sounds/se/se_wrong.mp3", { volume: 0.95 });

        setScoreText();
        setChoicesEnabled(false);

        verdictEl.textContent = isCorrect ? "〇" : "×";
        verdictEl.className = `verdict ${isCorrect ? "good" : "bad"}`;

        setTimeout(() => {
          verdictEl.className = "verdict";
          setChoicesEnabled(true);
          nextQuestion();
        }, 420);
      });
    });

    // タイプライター（これも世代ごとに1本）
    const fullText = String(q.question_text ?? "");
    let i = 0;
    const speedMs = 32;
    if (typeEl) typeEl.textContent = "";

    run._typeIntervalId = setInterval(() => {
      if (state.timeAttackRun !== run) { clearInterval(run._typeIntervalId); return; }
      if (run._sessionId !== mySessionId) { clearInterval(run._typeIntervalId); return; }
      if (run.finished) { clearInterval(run._typeIntervalId); return; }
      if (run.paused) return;
      if (!typeEl) { clearInterval(run._typeIntervalId); return; }
      if (i >= fullText.length) { clearInterval(run._typeIntervalId); return; }
      typeEl.textContent += fullText[i];
      i += 1;
    }, speedMs);
  }, 0);

  return `
    <div class="quiz-root">
      <div class="top-bar">
        <button id="taPauseBtn" class="pause-btn" type="button">⏸ 一時停止</button>
      </div>

      <div class="stage-row">
        <div class="stage-name">タイムアタック</div>
        <div id="taTimerText" class="timer-pill">⏱ 60</div>
      </div>

      <div id="taScoreText" style="margin:-4px 2px 6px;color:var(--muted);font-size:12px;font-weight:900;"></div>

      <div class="divider"></div>

      <div class="question-box">
        <div id="taTypewriter" class="question-text"></div>
      </div>

      <div class="divider"></div>

      ${avatarZoneHtml}

      <div class="divider"></div>

      <div class="choices-grid">
        ${choicesHtml}
      </div>

      <div id="taVerdict" class="verdict"></div>

      <div id="taPauseModal" class="modal" style="display:none;">
        <div class="modal-sheet">
          <div class="modal-title">一時中断</div>
          <div class="modal-sub">再開するか、リタイアするか選んでください。</div>
          <div class="space"></div>
          <div class="row">
            <button id="taResumeBtn" class="btn" type="button">再開</button>
            <button id="taRetireBtn" class="btn secondary" type="button">リタイア</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
