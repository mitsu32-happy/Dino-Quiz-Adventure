import { saveNow } from "../systems/saveManager.js";
import { playSe } from "../systems/audioManager.js";

// GitHub Pages / ローカル両対応
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

function getCorrectIndex(q) {
  const v = q?.correct_choice_index ?? q?.correct_index ?? q?.answer_index ?? q?.correct;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
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

function buildAvatarZoneHtml(state) {
  const { save, masters } = state;

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

  return `
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
}

function ensureEndlessRun(state) {
  const { masters } = state;
  const allQuestions = masters.questions ?? [];

  if (!Array.isArray(allQuestions) || allQuestions.length === 0) {
    return { ok: false, reason: "no_questions" };
  }

  if (!state.endlessRun) {
    state.endlessRun = {
      order: shuffle(allQuestions.map((q) => q.id)),
      cursor: 0,
      correct: 0,
      answered: 0,
      miss: 0,
      startedAt: new Date().toISOString(),
    };
  }
  return { ok: true };
}

function sanitizeQuestionText(text) {
  // ✅ 先頭/末尾のダブルクォート混入を除去（表示崩れ対策）
  return String(text ?? "")
    .replace(/^\s*"+\s*/g, "")
    .replace(/\s*"+\s*$/g, "");
}

export function renderEndless({ state, goto }) {
  ensureCssLoadedOnce(asset("assets/css/endless.css"), "endless-css");

  // ✅ このレンダーの世代トークン（前回のタイマーを止める）
  state._endlessRenderToken = (state._endlessRenderToken || 0) + 1;
  const token = state._endlessRenderToken;

  const { save, masters } = state;

  if (!save.progress) save.progress = {};
  if (!save.progress.modes) save.progress.modes = {};
  save.progress.modes.endlessLastPlayedAt = new Date().toISOString();
  saveNow(save);

  const init = ensureEndlessRun(state);
  if (!init.ok) {
    return `
      <div class="card"><div class="card-inner">
        <h2 style="margin:0 0 8px;">エンドレス</h2>
        <div class="notice">問題データが見つかりません。</div>
        <div class="space"></div>
        <button class="btn" onclick="location.hash='#home'">ホームへ</button>
      </div></div>
    `;
  }

  const run = state.endlessRun;
  const MAX_MISS = 3;

  const qid = run.order[run.cursor % run.order.length];
  const q = masters?.questionById?.get(qid);

  if (!q) {
    run.cursor += 1;
    goto("#endless");
    return `<div class="card"><div class="card-inner">読み込み中...</div></div>`;
  }

  const avatarZoneHtml = buildAvatarZoneHtml(state);

  const choices = Array.isArray(q.choices) ? q.choices : [];
  const order = shuffle(choices.map((_, i) => i));

  const choicesHtml = order
    .map((origIdx) => {
      const c = choices[origIdx];
      const isImage = c?.type === "image" && c?.image_url;
      const label = (c?.label ?? "").trim();

      return `
        <button class="choice-btn" data-idx="${origIdx}" type="button">
          ${isImage ? `<img class="choice-img" src="${normalizeAsset(c.image_url)}" alt="" onerror="this.style.display='none'">` : ``}
          ${isImage ? `` : `<div class="choice-text">${label}</div>`}
        </button>
      `;
    })
    .join("");

  setTimeout(() => {
    // ✅ 古いレンダーのタイマーは即終了
    if (state._endlessRenderToken !== token) return;

    let answered = false;
    let paused = false;

    const pauseBtn = document.getElementById("pauseBtn");
    const modal = document.getElementById("pauseModal");
    const resumeBtn = document.getElementById("resumeBtn");
    const retireBtn = document.getElementById("retireBtn");
    const verdictEl = document.getElementById("verdict");
    const typeEl = document.getElementById("typewriter");
    const hudEl = document.getElementById("endlessHud");

    const choiceButtons = Array.from(document.querySelectorAll(".choice-btn"));

    // ✅ 出題SE（短時間連打は audioManager 側で抑制）
    playSe("assets/sounds/se/se_question.mp3", { volume: 0.9 });

    function setHud() {
      if (!hudEl) return;
      hudEl.textContent = `正解 ${run.correct} / 回答 ${run.answered} / ミス ${run.miss}/${MAX_MISS}`;
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

    function finish(reason) {
      if (answered) return;
      answered = true;
      closePause();
      setChoicesEnabled(false);

      state.currentRun = {
        mode: "endless",
        stageId: "endless",
        stageName: "エンドレス",
        correctCount: run.correct,
        totalCount: run.answered,
        missCount: run.miss,
        endedReason: reason,
        questionIds: Array.isArray(run.order) ? run.order.slice() : [],
        answers: [],
        _rewardApplied: false,
      };

      state.endlessRun = null;
      goto("#result");
    }

    function goNext() {
      // ✅ 次へ行く前に、残タイマーが走らないように止める
      answered = true;
      run.cursor += 1;
      goto("#endless");
    }

    function showVerdict(ok) {
      verdictEl.textContent = ok ? "〇" : "×";
      verdictEl.className = `verdict ${ok ? "good" : "bad"}`;
    }

    setHud();

    pauseBtn?.addEventListener("click", () => {
      if (state._endlessRenderToken !== token) return;
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.8 });
      openPause();
    });
    resumeBtn?.addEventListener("click", () => {
      if (state._endlessRenderToken !== token) return;
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.8 });
      closePause();
    });
    retireBtn?.addEventListener("click", () => {
      if (state._endlessRenderToken !== token) return;
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.8 });
      closePause();
      finish("retire");
    });
    modal?.addEventListener("click", (e) => {
      if (state._endlessRenderToken !== token) return;
      if (e.target === modal) {
        playSe("assets/sounds/se/se_decide.mp3", { volume: 0.8 });
        closePause();
      }
    });

    choiceButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (state._endlessRenderToken !== token) return;
        if (answered) return;
        if (paused) return;

        const idx = Number(btn.dataset.idx);
        run.answered += 1;

        const correctIdx = getCorrectIndex(q);
        const isCorrect = correctIdx != null ? idx === correctIdx : false;

        playSe("assets/sounds/se/se_decide.mp3", { volume: 0.8 });
        playSe(isCorrect ? "assets/sounds/se/se_correct.mp3" : "assets/sounds/se/se_wrong.mp3", { volume: 0.95 });

        if (isCorrect) run.correct += 1;
        else run.miss += 1;

        setHud();
        setChoicesEnabled(false);
        showVerdict(isCorrect);

        if (run.miss >= MAX_MISS) {
          setTimeout(() => finish("miss"), 600);
          return;
        }

        setTimeout(() => {
          goNext();
        }, 600);
      });
    });

    // ===== typewriter =====
    const fullText = sanitizeQuestionText(q.question_text ?? "");
    let i = 0;
    const speedMs = 38;
    if (typeEl) typeEl.textContent = "";

    const t = setInterval(() => {
      // ✅ 世代が変わったら停止
      if (state._endlessRenderToken !== token) {
        clearInterval(t);
        return;
      }
      if (answered) {
        clearInterval(t);
        return;
      }
      if (paused) return;
      if (i >= fullText.length) {
        clearInterval(t);
        return;
      }
      if (typeEl) typeEl.textContent += fullText[i];
      i += 1;
    }, speedMs);
  }, 0);

  return `
    <div class="quiz-root">
      <div class="top-bar">
        <button id="pauseBtn" class="pause-btn" type="button">⏸ 一時停止</button>
      </div>

      <div class="stage-row">
        <div class="stage-name">エンドレス</div>
        <div id="endlessHud" class="timer-pill">正解 ${run.correct} / 回答 ${run.answered} / ミス ${run.miss}/3</div>
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
    </div>
  `;
}
