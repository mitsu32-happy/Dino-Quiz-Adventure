// js/screens/battleQuizScreen.js
import { playSe } from "../systems/audioManager.js";
import { getEquippedTitle } from "../systems/titleManager.js";

/*
  最終方針：
  - Online：server.js が正（採点・pt・進行）
  - CPU：ローカル完結
  - UI/CSS は一切触らない
*/

export function renderBattleQuiz({ state, goto }) {
  const run = state.currentRun;
  const masters = state.masters;
  const save = state.save;
  const bc = state.battleClient;

  const mode = String(run?.mode ?? "");
  const isCpu = mode === "battle_cpu";
  const isOnline = mode.startsWith("battle_online");

  if (!run || (!isCpu && !isOnline)) {
    return `<div class="card"><div class="card-inner">対戦が開始されていません</div></div>`;
  }

  // =========================
  // 初期化
  // =========================
  if (!Array.isArray(run.points)) run.points = [0, 0, 0, 0];
  if (typeof run.index !== "number") run.index = 0;

  const idx = run.index;
  const qid = run.questionIds[idx];
  const q = masters.questionById.get(qid);
  if (!q) return `<div>問題データが見つかりません</div>`;

  const activePis = [0, 1, 2, 3].filter((pi) => run.players?.[pi]);

  // =========================
  // オンライン同期
  // =========================
  if (isOnline && !run._onlineBound) {
    run._onlineBound = true;

    bc.on("game:event", (ev) => {
      if (ev.type === "game:answer") {
        // 他者回答SE
        playSe("assets/sounds/se/se_battle_other_answer.mp3", { volume: 0.85 });
      }

      if (ev.type === "game:questionEnd") {
        // サーバー正：ptと回答を丸ごと反映
        run.points = ev.scores;
      }

      if (ev.type === "game:next") {
        run.index = ev.index;
        goto(`#battleQuiz?i=${run.index}&t=${Date.now()}`);
      }

      if (ev.type === "game:finished") {
        run.points = ev.scores;
        goto("#battleResult");
      }
    });
  }

  // =========================
  // CPU戦ローカル処理
  // =========================
  const local = (run.local = run.local || {});
  const byPi = (local.answersByIndex = local.answersByIndex || {});
  const answers = (byPi[idx] = byPi[idx] || {});

  function scheduleCpu(pi) {
    if (!isCpu) return;
    if (answers[pi]) return;

    const t = 4 + Math.random() * 3;
    setTimeout(() => {
      if (answers[pi]) return;
      answers[pi] = { answered: true };

      if (pi !== 0) {
        playSe("assets/sounds/se/se_battle_other_answer.mp3", { volume: 0.85 });
      }

      tryAdvanceCpu();
    }, t * 1000);
  }

  function tryAdvanceCpu() {
    if (!isCpu) return;
    const all = activePis.every((pi) => answers[pi]);
    if (!all) return;

    if (local._advanced === idx) return;
    local._advanced = idx;

    run.index++;
    if (run.index >= run.questionIds.length) {
      goto("#battleResult");
    } else {
      goto(`#battleQuiz?i=${run.index}&t=${Date.now()}`);
    }
  }

  if (isCpu) {
    scheduleCpu(1);
    scheduleCpu(2);
    scheduleCpu(3);
  }

  // =========================
  // UI（そのまま）
  // =========================
  return `
    <div class="quiz-root">
      <div class="question">${q.question_text}</div>
      <div class="choices">
        ${q.choices
          .map(
            (c, i) => `
          <button class="choice-btn" data-i="${i}">
            ${typeof c === "string" ? c : c.text}
          </button>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}
