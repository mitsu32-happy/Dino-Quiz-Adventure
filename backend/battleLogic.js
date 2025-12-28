// js/systems/battleLogic.js
// 対戦（CPU/オンライン共通）ルールの“純粋ロジック”
// - 10問固定 / 20秒 / 3-2-1pt / 1位のみ勝ち / タイブレークあり
// - UIや通信には依存しない

export const BATTLE_RULES = Object.freeze({
  QUESTIONS_PER_MATCH: 10,
  TIME_LIMIT_SEC: 20,
  AWARD_POINTS: [3, 2, 1], // 早い順に上位3名
  COIN_REWARD_BY_RANK: { 1: 30, 2: 20, 3: 10, 4: 0 }, // 案1
});

export function awardPointsBySpeed(correctAnswers /* [{pi, tSec}] */) {
  const sorted = [...correctAnswers].sort((a, b) => a.tSec - b.tSec);
  const pointsMap = new Map(); // pi -> gained
  for (let i = 0; i < Math.min(BATTLE_RULES.AWARD_POINTS.length, sorted.length); i++) {
    pointsMap.set(sorted[i].pi, BATTLE_RULES.AWARD_POINTS[i]);
  }
  return { sorted, pointsMap };
}

export function applyQuestionResult(run, questionResult) {
  // run: {
  //   players:[...], points:[...], correctCounts:[...], correctTimeSum:[...], answers:[...]
  // }
  // questionResult: {
  //   qid, correctIdx,
  //   entries: [{pi, answered, correct, tSec|null, choiceIndex|null}],
  //   endReason: "all_answered"|"timeout"
  // }
  if (!run.points) run.points = [];
  if (!run.correctCounts) run.correctCounts = [];
  if (!run.correctTimeSum) run.correctTimeSum = [];
  if (!run.answers) run.answers = [];

  const correctList = [];
  for (const e of questionResult.entries) {
    if (e.answered && e.correct && typeof e.tSec === "number") {
      correctList.push({ pi: e.pi, tSec: e.tSec });
    }
  }

  const { pointsMap } = awardPointsBySpeed(correctList);

  for (const e of questionResult.entries) {
    const pi = e.pi;
    const gained = Number(pointsMap.get(pi) ?? 0);
    run.points[pi] = Number(run.points[pi] ?? 0) + gained;

    if (e.answered && e.correct && typeof e.tSec === "number") {
      run.correctCounts[pi] = Number(run.correctCounts[pi] ?? 0) + 1;
      run.correctTimeSum[pi] = Number(run.correctTimeSum[pi] ?? 0) + e.tSec;
    }
  }

  run.answers.push({
    qid: questionResult.qid,
    correctIdx: questionResult.correctIdx,
    entries: questionResult.entries,
    endReason: questionResult.endReason,
    awarded: Array.from(pointsMap.entries()).map(([pi, pt]) => ({ pi, pt })),
  });

  return run;
}

export function calcFinalStandings(run) {
  const rows = (run.players || []).map((p, pi) => ({
    pi,
    name: p?.name ?? "",
    points: Number(run.points?.[pi] ?? 0),
    correct: Number(run.correctCounts?.[pi] ?? 0),
    timeSum: Number(run.correctTimeSum?.[pi] ?? 0),
  }));

  // タイブレーク：pt ↓ / 正解数 ↓ / 正解時間合計 ↑ / pi ↑
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.correct !== a.correct) return b.correct - a.correct;
    if (a.timeSum !== b.timeSum) return a.timeSum - b.timeSum;
    return a.pi - b.pi;
  });

  rows.forEach((r, i) => (r.rank = i + 1));

  const coinRewardMap = {};
  for (const r of rows) {
    coinRewardMap[r.pi] = BATTLE_RULES.COIN_REWARD_BY_RANK[r.rank] ?? 0;
  }

  return { standings: rows, coinRewardMap };
}

export function winLoseFromStandings(standings) {
  // 1位のみ勝ち
  const winLoseMap = {};
  for (const r of standings) {
    winLoseMap[r.pi] = r.rank === 1 ? "win" : "lose";
  }
  return winLoseMap;
}
