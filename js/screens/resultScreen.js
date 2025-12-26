import { saveNow } from "../systems/saveManager.js";

function unlockNextStagesIfAny(masters, save) {
  // 次ステージ自動解放は「参照側（unlock_condition）」で判定するだけなので、
  // ここでは stage clear のフラグを立てることが目的。
  // 追加処理は不要。
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

  const total = run.questionIds.length;
  const score = run.correctCount;

  const stageId = run.stageId;
  const stage = masters.stageById.get(stageId);

  // 進行反映（クリア・ベスト）
  const st = save.progress.stages[stageId] || { cleared: false, bestScore: null, lastPlayedAt: null };
  st.cleared = true;
  st.bestScore = (st.bestScore == null) ? score : Math.max(st.bestScore, score);
  save.progress.stages[stageId] = st;

  // コイン（ステージ報酬）
  const reward = stage?.reward_coin ?? 0;
  save.economy.coins = (save.economy.coins ?? 0) + reward;

  // 反映保存
  unlockNextStagesIfAny(masters, save);
  saveNow(save);

  const detailsHtml = run.answers.map((a, idx) => {
    const q = masters.questionById.get(a.qid);
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
        <div style="font-weight:900; line-height:1.5;">${q.question_text}</div>
        <div class="space" style="height:6px;"></div>
        <div class="notice">
          あなた：${chosen}<br/>
          正解：${correct}
        </div>
      </div>
    `;
  }).join("");

  // イベント
  setTimeout(() => {
    document.getElementById("retryBtn")?.addEventListener("click", () => {
      // 同ステージを最初から
      state.currentRun = null;
      goto(`#quiz?stageId=${encodeURIComponent(stageId)}`);
    });

    document.getElementById("homeBtn")?.addEventListener("click", () => {
      state.currentRun = null;
      goto("#home");
    });
  }, 0);

  return `
    <div class="card">
      <div class="card-inner">
        <div class="row">
          <span class="pill">ステージクリア</span>
          <span class="pill">報酬 +${reward}コイン</span>
        </div>

        <div class="space"></div>

        <div style="font-weight:900;">${run.stageName}</div>
        <div class="result-big">${score} / ${total}</div>
        <p class="result-sub">ベスト：${save.progress.stages[stageId]?.bestScore ?? score}</p>

        <div class="space"></div>

        <div class="row">
          <button id="retryBtn" class="btn">もう一回</button>
          <button id="homeBtn" class="btn secondary">ホームへ</button>
        </div>

        <div class="space"></div>

        <h3 style="margin:0 0 10px;">ふりかえり</h3>
        <div class="list">
          ${detailsHtml}
        </div>
      </div>
    </div>
  `;
}
