// js/systems/saveManager.js
// specs/save_spec.md の v1 構造に準拠（バックアップ/復元あり）
// - localStorage保存
// - JSON出力（lastBackupAt 更新）
// - JSON読み込み→上書き確認（画面側）
// 参照: specs/save_spec.md 

export const SAVE_STORAGE_KEY = "dino_quiz_save_v1";

function nowIso() {
  return new Date().toISOString();
}

export function createDefaultSave() {
  return {
    version: 1,
    meta: {
      createdAt: nowIso(),
      lastPlayedAt: nowIso(),
      lastBackupAt: "",
    },
    player: {
      id: crypto?.randomUUID?.() ?? String(Date.now()),
      name: "",
    },
    progress: {
      unlockedModes: [],
      stages: {},
    },
    economy: { coins: 0 },
    avatar: {
      equipped: { body: null, head: null, outfit: null, background: null },
      ownedItemIds: [],
    },
    gacha: { totalPulls: 0, lastPulledAt: null },
    titles: { equippedTitleId: null, unlockedTitleIds: [] },
    options: { bgmVolume: 0.8, seVolume: 0.9, vibration: true },
  };
}

export function validateSaveV1(obj) {
  // できるだけ「壊れたJSON」を弾くための最低限チェック
  if (!obj || typeof obj !== "object") return { ok: false, reason: "not_object" };
  if (obj.version !== 1) return { ok: false, reason: "unsupported_version" };

  const has = (k) => Object.prototype.hasOwnProperty.call(obj, k);

  if (!has("meta") || !has("player") || !has("progress") || !has("economy") || !has("avatar") || !has("gacha") || !has("titles") || !has("options")) {
    return { ok: false, reason: "missing_top_level_keys" };
  }

  // options
  const opt = obj.options;
  if (typeof opt !== "object" || opt == null) return { ok: false, reason: "options_invalid" };
  if (typeof opt.bgmVolume !== "number" || typeof opt.seVolume !== "number" || typeof opt.vibration !== "boolean") {
    return { ok: false, reason: "options_shape_invalid" };
  }

  // economy
  if (typeof obj.economy?.coins !== "number") return { ok: false, reason: "economy_invalid" };

  // progress.stages は object 想定
  if (typeof obj.progress?.stages !== "object" || obj.progress.stages == null) return { ok: false, reason: "progress_stages_invalid" };

  return { ok: true };
}

export function ensureSaveLoaded() {
  const raw = localStorage.getItem(SAVE_STORAGE_KEY);
  if (!raw) {
    const save = createDefaultSave();
    localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(save));
    return save;
  }

  try {
    const save = JSON.parse(raw);
    const v = validateSaveV1(save);
    if (!v.ok) throw new Error(`Invalid save: ${v.reason}`);
    return save;
  } catch {
    const save = createDefaultSave();
    localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(save));
    return save;
  }
}

export function saveNow(save) {
  save.meta.lastPlayedAt = nowIso();
  localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(save));
}

export function exportSaveJson(save) {
  // バックアップ時刻を更新して書き出し（仕様：lastBackupAt）
  save.meta.lastBackupAt = nowIso();
  // lastPlayedAt もついでに更新
  save.meta.lastPlayedAt = nowIso();

  const json = JSON.stringify(save, null, 2);
  localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(save));
  return json;
}

export function importSaveJson(jsonText) {
  // ここでは「検証して返す」まで。localStorage反映は呼び出し側でOK。
  let obj;
  try {
    obj = JSON.parse(jsonText);
  } catch (e) {
    return { ok: false, reason: "json_parse_error", error: e };
  }

  const v = validateSaveV1(obj);
  if (!v.ok) return { ok: false, reason: v.reason };

  return { ok: true, save: obj };
}

export function writeSaveToStorage(save) {
  // 上書き保存（復元確定時に使用）
  save.meta.lastPlayedAt = nowIso();
  localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(save));
}
