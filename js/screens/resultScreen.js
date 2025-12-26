import { saveNow } from "../systems/saveManager.js";
import { unlockTitlesIfAny, getEquippedTitle, getUnlockedTitles } from "../systems/titleManager.js";

function unlockNextStagesIfAny(masters, save) {
  // 既存の思想を維持（参照側unlock_conditionで判定）
}

function safeText(s) {
  return String(s ?? "");
}

function calcRewardByRun(run, stage) {
  // モード別に一元化
  if (run?.mode === "endless") {
    const correct = Number(run.correctCount ?? 0);
    const reward = correct * 2 + Math.floor(correct / 10) * 10;
    return Math.max(0, reward);
  }
  if (run?.mode === "time_attack") {
    // 仕様：正解数×5
    const correct = Number(run.correctCount ?? 0);
    return Math.max(0, correct * 5);
  }
  // 通常ステージ
  return Number(stage?.reward_coin ?? 0) || 0;
}

function ensureStageProgress(save, stageId) {
  if (!save.progress) save.progress = { unlockedModes: [], stages: {} };
  if (!save.progress.stages) save.progress.stages = {};

  const cur = save.progress.stages[stageId];
  if (cur && typeof cur === "object") return cur;

  const st = { cleared: false, bestScore: null, lastPlayedAt: null };
  save.progress.stages[stageId] = st;
  return st;
}

export function renderResult({ state, goto }) {
  const { masters, save } = state;
  const run = state.currentRun;

  if (!run) {
    return `
      <div class="card"><div class="card-inner">
        <h2 style="margin:0 0 8px;">結果がありません</h2>
        <div class="notice">ホームからステージを開始してください。</div>
        <div class="space"></div>
        <button class="btn" onclick="location.hash='#home'">ホームへ</button>
      </div></div>
    `;
  }

  // 表示・集計値
  const total = Number(run.totalCount ?? run.questionIds?.length ?? 0);
  const score = Number(run.correctCount ?? 0);
  const miss = Number(run.missCount ?? 0);

  const stageId = run.stageId;
  const stage = masters?.stageById?.get?.(stageId) ?? null;

  // 進行反映（ベストスコア）
  const st = ensureStageProgress(save, stageId);

  // 通常ステージだけは cleared=true（TA/Endlessは疑似ステージとしてベストだけ更新でもOK）
  if (run.mode === "stage") st.cleared = true;

  st.bestScore = (st.bestScore == null) ? score : Math.max(st.bestScore, score);
  save.progress.stages[stageId] = st;

  // 報酬（1回だけ）
  let reward = 0;
  if (!run._rewardApplied) {
    reward = calcRewardByRun(run, stage);
    save.economy.coins = Number(save.economy.coins ?? 0) + reward;
    run._rewardApplied = true;
  } else {
    reward = 0; // 二重付与防止（表示は別枠で出す）
  }

  // 反映保存（ステージ解放）
  unlockNextStagesIfAny(masters, save);

  // 称号：解放判定
  const newlyUnlockedIds = unlockTitlesIfAny(masters, save);

  // 保存
  saveNow(save);

  const best = save.progress.stages[stageId]?.bestScore ?? score;

  // 詳細（通常ステージのみ）
  const showDetails = run.mode === "stage" && Array.isArray(run.answers) && run.answers.length > 0;
  const detailsHtml = showDetails
    ? run.answers.map((a, idx) => {
        const q = masters?.questionById?.get?.(a.qid);
        if (!q) return "";
        const chosen = (a.chosenIndex == null) ? "（未回答）" : (q.choices?.[a.chosenIndex]?.label ?? "（不明）");
        const correct = (q.choices?.[a.correctIndex]?.label ?? "（不明）");
        const ok = a.isCorrect;

        return `
          <div class="stage" style="pointer-events:none;">
            <div class="row" style="justify-content:space-between;">
              <div style="font-weight:900;">Q${idx + 1}</div>
              <div class="pill" style="color:${ok ? "var(--good)" : "var(--bad)"}">${ok ? "正解" : "不正解"}</div>
            </div>
            <div class="space" style="height:6px;"></div>
            <div style="font-weight:900; line-height:1.5;">${safeText(q.question_text)}</div>
            <div class="space" style="height:6px;"></div>
            <div class="notice">
              あなた：${safeText(chosen)}<br/>
              正解：${safeText(correct)}
            </div>
          </div>
        `;
      }).join("")
    : "";

  // 称号UI用
  const equipped = getEquippedTitle(masters, save);
  const unlockedTitles = getUnlockedTitles(masters, save);

  const newlyHtml = newlyUnlockedIds.length > 0
    ? `
      <div class="space"></div>
      <div class="notice">
        <b>🎉 新しく解放した称号</b><br/>
        ${newlyUnlockedIds
          .map((id) => {
            const t = unlockedTitles.find((x) => x?.title_id === id) ?? masters?.titleById?.get?.(id);
            return `・${safeText(t?.name ?? id)}`;
          })
          .join("<br/>")}
      </div>
    `
    : "";

  const titleSelectHtml = unlockedTitles.length > 0
    ? `
      <div class="space"></div>
      <div class="notice">
        <b>称号</b><br/>
        現在：<b>${safeText(equipped?.name ?? "（未装備）")}</b>
      </div>
      <div class="space" style="height:8px;"></div>
      <div class="row" style="gap:8px; flex-wrap:wrap;">
        <select id="titleSelect" class="btn secondary" style="padding:10px 12px; border-radius:14px; min-width:220px;">
          ${unlockedTitles
            .map((t) => {
              const sel = (save.titles.equippedTitleId === t.title_id) ? "selected" : "";
              return `<option value="${t.title_id}" ${sel}>${safeText(t.name)}</option>`;
            })
            .join("")}
        </select>
        <button id="titleEquipBtn" class="btn" type="button">装備する</button>
      </div>
    `
    : `
      <div class="space"></div>
      <div class="notice"><b>称号</b><br/>まだ解放されていません。</div>
    `;

  const headerBadges = (() => {
    if (run.mode === "endless") {
      return `<span class="pill">エンドレス結果</span><span class="pill">ミス ${miss} / 3</span>`;
    }
    if (run.mode === "time_attack") {
      return `<span class="pill">タイムアタック結果</span>`;
    }
    return `<span class="pill">ステージクリア</span>`;
  })();

  const rewardBadge = (() => {
    // 既に適用済みでも、見た目には「今回の計算値」を出したい場合は run._lastReward を使うなどもあり
    const computed = calcRewardByRun(run, stage);
    return `<span class="pill">報酬 +${computed}コイン</span>`;
  })();

  // イベント
  setTimeout(() => {
    document.getElementById("retryBtn")?.addEventListener("click", () => {
      state.currentRun = null;

      if (run.mode === "endless") {
        goto("#endless");
        return;
      }
      if (run.mode === "time_attack") {
        goto("#timeAttack");
        return;
      }
      goto(`#quiz?stageId=${encodeURIComponent(stageId)}`);
    });

    document.getElementById("homeBtn")?.addEventListener("click", () => {
      state.currentRun = null;
      goto("#home");
    });

    document.getElementById("titleEquipBtn")?.addEventListener("click", () => {
      const sel = document.getElementById("titleSelect");
      const id = sel?.value ?? null;
      save.titles.equippedTitleId = id;
      saveNow(save);
      goto("#result"); // 画面更新
    });
  }, 0);

  return `
    <div class="card">
      <div class="card-inner">
        <div class="row">
          ${headerBadges}
          ${rewardBadge}
        </div>

        <div class="space"></div>

        <div style="font-weight:900;">${safeText(run.stageName)}</div>
        <div class="result-big">${score} / ${total}</div>
        <p class="result-sub">ベスト：${best}</p>

        ${newlyHtml}
        ${titleSelectHtml}

        <div class="space"></div>

        <div class="row">
          <button id="retryBtn" class="btn">もう一回</button>
          <button id="homeBtn" class="btn secondary">ホームへ</button>
        </div>

        ${showDetails ? `
          <div class="space"></div>
          <h3 style="margin:0 0 10px;">ふりかえり</h3>
          <div class="list">
            ${detailsHtml}
          </div>
        ` : ``}
      </div>
    </div>
  `;
}
