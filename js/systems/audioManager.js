let currentBgm = null;
let currentBgmName = null;

let unlocked = false;
let pendingBgmName = null;

/** =========================
 * 音量状態（options 連動）
 * ========================= */
let bgmVolume = 0.6; // 0.0 - 1.0
let seVolume = 0.8;  // 0.0 - 1.0

const bgmMap = {
  top: "assets/sounds/bgm/bgm_top.mp3",
  home: "assets/sounds/bgm/bgm_home.mp3",
  quiz: "assets/sounds/bgm/bgm_quiz_stage.mp3",
  timeAttack: "assets/sounds/bgm/bgm_timeattack.mp3",
  endless: "assets/sounds/bgm/bgm_endless.mp3",
  battle: "assets/sounds/bgm/bgm_battle.mp3",
};

/** =========================
 * 内部ユーティリティ
 * ========================= */
function fadeOut(audio, duration = 500) {
  if (!audio) return;
  const step = 50;
  const startVol = audio.volume ?? 0;
  const delta = startVol / (duration / step);

  const timer = setInterval(() => {
    audio.volume = Math.max(0, audio.volume - delta);
    if (audio.volume <= 0) {
      audio.pause();
      clearInterval(timer);
    }
  }, step);
}

function doPlayBgm(name) {
  const src = bgmMap[name] || bgmMap.home;
  if (currentBgmName === src) return;

  if (currentBgm) fadeOut(currentBgm);

  const audio = new Audio(src);
  audio.loop = true;
  audio.volume = bgmVolume;

  audio.play().catch(() => {
    // autoplay 制限中
    pendingBgmName = name;
  });

  currentBgm = audio;
  currentBgmName = src;
}

/** =========================
 * 初回ユーザー操作で解禁
 * ========================= */
export function initAudio() {
  if (unlocked) return;

  const unlock = () => {
    unlocked = true;

    // 無音を一瞬鳴らして解禁
    const a = new Audio();
    a.src =
      "data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA" +
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    a.volume = 0;
    a.play().catch(() => {});

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

/** =========================
 * BGM 制御
 * ========================= */
export function playBgm(name) {
  if (!unlocked) {
    pendingBgmName = name;
    return;
  }
  doPlayBgm(name);
}

export function stopBgm() {
  if (currentBgm) {
    currentBgm.pause();
    currentBgm = null;
    currentBgmName = null;
  }
}

/** =========================
 * SE 再生
 * ========================= */
export function playSe(src, { loop = false, volume } = {}) {
  const se = new Audio(src);
  se.loop = loop;
  se.volume = volume ?? seVolume;
  se.play().catch(() => {});
  return se;
}

/** =========================
 * options 連動（★ここが本体）
 * ========================= */
export function applyAudioOptions(options = {}) {
  if (typeof options.bgmVolume === "number") {
    bgmVolume = clamp(options.bgmVolume, 0, 1);
    if (currentBgm) {
      currentBgm.volume = bgmVolume;
    }
  }

  if (typeof options.seVolume === "number") {
    seVolume = clamp(options.seVolume, 0, 1);
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
