// js/systems/titleManager.js
// 称号の解放判定・付与を集約

function toSet(arr) {
  return new Set(Array.isArray(arr) ? arr : []);
}

function getTitlesFromMasters(masters) {
  if (Array.isArray(masters?.titles)) return masters.titles;
  if (Array.isArray(masters?.title_master)) return masters.title_master;
  return [];
}

function getTitleById(masters, id) {
  if (!id) return null;
  if (masters?.titleById?.get) return masters.titleById.get(id) ?? null;

  const list = getTitlesFromMasters(masters);
  return list.find((t) => (t?.title_id ?? t?.id) === id) ?? null;
}

function parseModeScoreValue(v) {
  const s = String(v ?? "");
  const [mode, scoreStr] = s.split(":");
  const score = Number(scoreStr);
  if (!mode || !Number.isFinite(score)) return null;
  return { mode, score };
}

function countClearedStages(save) {
  const stages = save?.progress?.stages ?? {};
  let n = 0;
  for (const key of Object.keys(stages)) {
    if (stages[key]?.cleared) n += 1;
  }
  return n;
}

function isAllStagesCleared(masters, save) {
  const stageList = Array.isArray(masters?.stages) ? masters.stages : [];
  if (stageList.length === 0) return false;

  const stages = save?.progress?.stages ?? {};
  return stageList.every((st) => stages?.[st.id]?.cleared === true);
}

function getBestScoreForStage(save, stageId) {
  const st = save?.progress?.stages?.[stageId];
  const v = Number(st?.bestScore);
  return Number.isFinite(v) ? v : 0;
}

function checkCondition(masters, save, condType, condValue) {
  switch (condType) {
    case "any_stage_cleared":
      return countClearedStages(save) >= 1;

    case "stage_cleared_count_at_least": {
      const n = Number(condValue);
      return Number.isFinite(n) ? countClearedStages(save) >= n : false;
    }

    case "all_stages_cleared":
      return isAllStagesCleared(masters, save);

    case "total_gacha_pulls_at_least": {
      const n = Number(condValue);
      const pulls = Number(save?.gacha?.totalPulls ?? 0);
      return Number.isFinite(n) ? pulls >= n : false;
    }

    case "coins_at_least": {
      const n = Number(condValue);
      const coins = Number(save?.economy?.coins ?? 0);
      return Number.isFinite(n) ? coins >= n : false;
    }

    case "owned_avatar_items_at_least": {
      const n = Number(condValue);
      const owned = Array.isArray(save?.avatar?.ownedItemIds) ? save.avatar.ownedItemIds.length : 0;
      return Number.isFinite(n) ? owned >= n : false;
    }

    case "best_score_mode_at_least": {
      const parsed = parseModeScoreValue(condValue);
      if (!parsed) return false;

      const stageId = parsed.mode; // "endless" / "time_attack"
      const best = getBestScoreForStage(save, stageId);
      return best >= parsed.score;
    }

    default:
      return false;
  }
}

export function unlockTitlesIfAny(masters, save) {
  const titles = getTitlesFromMasters(masters);

  if (!save.titles) save.titles = { equippedTitleId: null, unlockedTitleIds: [] };
  if (!Array.isArray(save.titles.unlockedTitleIds)) save.titles.unlockedTitleIds = [];

  const unlocked = toSet(save.titles.unlockedTitleIds);
  const newlyUnlocked = [];

  for (const t of titles) {
    const id = t?.title_id ?? t?.id;
    if (!id) continue;
    if (unlocked.has(id)) continue;

    const ok = checkCondition(masters, save, t?.condition_type, t?.condition_value);
    if (ok) {
      unlocked.add(id);
      newlyUnlocked.push(id);
    }
  }

  if (newlyUnlocked.length > 0) {
    save.titles.unlockedTitleIds = Array.from(unlocked);

    // 未装備なら最初の解放を自動装備
    if (!save.titles.equippedTitleId) {
      save.titles.equippedTitleId = newlyUnlocked[0];
    }
  }

  return newlyUnlocked;
}

export function getEquippedTitle(masters, save) {
  const id = save?.titles?.equippedTitleId ?? null;
  return getTitleById(masters, id);
}

export function getUnlockedTitles(masters, save) {
  const ids = Array.isArray(save?.titles?.unlockedTitleIds) ? save.titles.unlockedTitleIds : [];
  return ids.map((id) => getTitleById(masters, id)).filter(Boolean);
}
