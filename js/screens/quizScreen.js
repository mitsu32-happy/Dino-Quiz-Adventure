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
  const qid = run.questionIds?.[run.cursor] ?? null;
  const q = masters?.questionById?.get(qid);

  if (!q) {
    // 事故回避：リザルトへ
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

  // 選択肢（2x2）
  const choices = Array.isArray(q.choices) ? q.choices : [];
  const choicesHtml = choices.map((c, idx) => {
    const isImage = c?.type === "image" && c?.image_url;
    const label = (c?.label ?? "").trim();

    return `
      <button class="choice-btn" data-idx="${idx}" type="button">
        ${isImage ? `<img class="choice-img" src="${normalizeAsset(c.image_url)}" alt="" onerror="this.style.display='none'">` : ``}
        <div class="choice-text">${label}</div>
      </button>
    `;
  }).join("");

  // DOMイベント/タイマー
  setTimeout(() => {
    const timerEl = document.getElementById("timerText");
    const typeEl = document.getElementById("typewriter");
    const verdictEl = document.getElementById("verdict");

    const pauseBtn = document.getElementById("pauseBtn");
    const modal = document.getElementById("pauseModal");
    const resumeBtn = document.getElementById("resumeBtn");
    const retireBtn = document.getElementById("retireBtn");

    const choiceButtons = Array.from(document.querySelectorAll(".choice-btn"));

    let answered = false;
    let paused = false;

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
        clearInterval(tick);
        // 時間切れ＝不正解
        answered = true;
        verdictEl.textContent = "×";
        verdictEl.className = "verdict bad";
        playSe("assets/sounds/se/se_wrong.mp3", { volume: 0.95 });

        run.answers.push({ qid, selectedIndex: null, correct: false, timedOut: true });
        run.cursor += 1;

        setTimeout(() => goto("#quiz?stageId=" + encodeURIComponent(stage.id)), 600);
      }
    }, 1000);

    // 一時停止
    function openPause() {
      paused = true;
      if (modal) modal.style.display = "flex";
    }
    function closePause() {
      paused = false;
      if (modal) modal.style.display = "none";
    }

    pauseBtn?.addEventListener("click", () => {
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.8 });
      openPause();
    });
    resumeBtn?.addEventListener("click", () => {
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.8 });
      closePause();
    });
    retireBtn?.addEventListener("click", () => {
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.8 });
      clearInterval(tick);
      // リタイア→ホーム
      state.currentRun = null;
      goto("#home");
    });
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) {
        playSe("assets/sounds/se/se_decide.mp3", { volume: 0.8 });
        closePause();
      }
    });

    // タイプライター
    const fullText = String(q.question_text ?? "");
    let i = 0;
    if (typeEl) typeEl.textContent = "";
    const speedMs = 38;
    const t = setInterval(() => {
      if (answered) { clearInterval(t); return; }
      if (paused) return;
      if (!typeEl) { clearInterval(t); return; }
      if (i >= fullText.length) { clearInterval(t); return; }
      typeEl.textContent += fullText[i];
      i += 1;
    }, speedMs);

    // 回答
    function setChoicesEnabled(enabled) {
      choiceButtons.forEach((b) => (b.disabled = !enabled));
    }

    choiceButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (answered) return;
        if (paused) return;
        answered = true;

        clearInterval(tick);

        const idx = Number(btn.dataset.idx);
        const correctIdx = getCorrectIndex(q);
        const ok = correctIdx != null ? idx === correctIdx : false;

        playSe("assets/sounds/se/se_decide.mp3", { volume: 0.8 });
        playSe(ok ? "assets/sounds/se/se_correct.mp3" : "assets/sounds/se/se_wrong.mp3", { volume: 0.95 });

        if (ok) run.correctCount += 1;

        run.answers.push({ qid, selectedIndex: idx, correct: ok });
        run.cursor += 1;

        setChoicesEnabled(false);
        verdictEl.textContent = ok ? "〇" : "×";
        verdictEl.className = `verdict ${ok ? "good" : "bad"}`;

        // 全問終わり → result
        if (run.cursor >= run.questionIds.length) {
          setTimeout(() => goto("#result"), 650);
          return;
        }

        setTimeout(() => goto("#quiz?stageId=" + encodeURIComponent(stage.id)), 650);
      });
    });
  }, 0);

  return `
    <div class="quiz-root">
      <div class="top-bar">
        <button id="pauseBtn" class="pause-btn" type="button">⏸ 一時停止</button>
      </div>

      <div class="stage-row">
        <div class="stage-name">${stage.name ?? stage.id}</div>
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
    </div>
  `;
}
