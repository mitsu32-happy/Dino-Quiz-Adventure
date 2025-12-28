// js/systems/audioManager.js

let currentBgm = null;
let currentBgmName = null;

let unlocked = false;
let pendingBgmName = null;

/** =========================
 * 音量状態（options 連動）
 * ========================= */
let bgmVolume = 0.6; // 0.0 - 1.0
let seVolume = 0.8;  // 0.0 - 1.0

function clamp(v, min = 0, max = 1) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

// BGM の名前 -> ファイル
const bgmMap = {
  top: "assets/sounds/bgm/bgm_top.mp3",
  home: "assets/sounds/bgm/bgm_home.mp3",
  quiz: "assets/sounds/bgm/bgm_quiz_stage.mp3",
  timeAttack: "assets/sounds/bgm/bgm_time_attack.mp3",
  endless: "assets/sounds/bgm/bgm_endless.mp3",
  gacha: "assets/sounds/bgm/bgm_gacha.mp3",
  avatar: "assets/sounds/bgm/bgm_avatar.mp3",
  options: "assets/sounds/bgm/bgm_options.mp3",
};

function fadeOut(audio, durationMs = 250) {
  if (!audio) return;
  const start = performance.now();
  const from = Number.isFinite(audio.volume) ? audio.volume : 1;

  const timer = setInterval(() => {
    const t = (performance.now() - start) / durationMs;
    if (t >= 1) {
      audio.volume = 0;
      audio.pause();
      clearInterval(timer);
      return;
    }
    audio.volume = clamp(from * (1 - t), 0, 1);
  }, 16);
}

function doPlayBgm(name) {
  const src = bgmMap[name] || bgmMap.home;

  // 同じBGMなら何もしない
  if (currentBgmName === src) return;

  // いま鳴ってるBGMをフェードアウト
  if (currentBgm) fadeOut(currentBgm);

  const audio = new Audio(src);
  audio.loop = true;
  audio.volume = clamp(bgmVolume, 0, 1);

  currentBgm = audio;
  currentBgmName = src;

  audio.play().catch(() => {
    // autoplay ブロック → unlock 後に再試行
    pendingBgmName = name;
  });
}

/**
 * ✅ ブラウザの自動再生制限を解除するための初期化
 * main.js が initAudio() を起動時に呼ぶ想定
 */
export function initAudio() {
  if (unlocked) return;

  const unlock = () => {
    unlocked = true;

    // 無音を一瞬鳴らして解禁（環境によって必要）
    try {
      const a = new Audio();
      a.src =
        "data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA" +
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
      a.volume = 0;
      a.play().catch(() => {});
    } catch (_) {}

    // 保留していたBGMがあれば再生
    if (pendingBgmName) {
      const n = pendingBgmName;
      pendingBgmName = null;
      doPlayBgm(n);
    }

    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };

  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
  window.addEventListener("touchstart", unlock, { once: true });
}

/** オプション適用（BGM/SE 共通） */
export function applyAudioOptions(options = {}) {
  if (typeof options.bgmVolume === "number") {
    bgmVolume = clamp(options.bgmVolume, 0, 1);
    if (currentBgm) currentBgm.volume = bgmVolume;
  }
  if (typeof options.seVolume === "number") {
    seVolume = clamp(options.seVolume, 0, 1);
  }
}

/** BGM 再生（name: "home" など） */
export function playBgm(name) {
  if (!unlocked) {
    pendingBgmName = name;
    return;
  }
  doPlayBgm(name);
}

/** BGM 停止 */
export function stopBgm() {
  if (!currentBgm) return;
  try {
    currentBgm.pause();
    currentBgm.currentTime = 0;
  } catch (_) {}
  currentBgm = null;
  currentBgmName = null;
}

/**
 * SE 再生
 * ✅ 追加：同一SEの短時間多重再生を抑止（2回/3回鳴る対策）
 */
const _lastSeAt = new Map(); // key: src, value: ms
const _SE_THROTTLE_MS = 90;

export function playSe(src, { loop = false, volume } = {}) {
  const base = (typeof volume === "number") ? volume : 1.0;
  const finalVolume = clamp(base * seVolume, 0, 1);

  if (finalVolume <= 0) return null;

  // ✅ 同一srcを超短時間で連打したら無視
  const now = performance.now();
  const last = _lastSeAt.get(src) ?? -Infinity;
  if (!loop && (now - last) < _SE_THROTTLE_MS) return null;
  _lastSeAt.set(src, now);

  const se = new Audio(src);
  se.loop = loop;
  se.volume = finalVolume;

  se.play().catch(() => {
    // autoplay ブロック等は握りつぶしでOK
  });

  return se;
}
