// js/systems/audioManager.js

let bgmAudio = null;

// デフォルト音量
let bgmVolume = 1.0;
let seVolume = 1.0;

function clamp(v, min = 0, max = 1) {
  return Math.max(min, Math.min(max, v));
}

// オプション適用
export function applyAudioOptions(options = {}) {
  if (typeof options.bgmVolume === "number") {
    bgmVolume = clamp(options.bgmVolume);
    if (bgmAudio) bgmAudio.volume = bgmVolume;
  }
  if (typeof options.seVolume === "number") {
    seVolume = clamp(options.seVolume);
  }
}

// BGM再生
export function playBgm(src, { loop = true } = {}) {
  stopBgm();
  bgmAudio = new Audio(src);
  bgmAudio.loop = loop;
  bgmAudio.volume = bgmVolume;
  bgmAudio.play().catch(() => {});
  return bgmAudio;
}

// BGM停止
export function stopBgm() {
  if (bgmAudio) {
    try {
      bgmAudio.pause();
      bgmAudio.currentTime = 0;
    } catch (_) {}
    bgmAudio = null;
  }
}

// SE再生
export function playSe(src, { loop = false, volume } = {}) {
  // volume は「基準音量」扱い。必ず seVolume を掛ける
  const base = (typeof volume === "number") ? volume : 1.0;

  // 完全ミュート時は再生自体しない
  const finalVolume = clamp(base * seVolume);
  if (finalVolume <= 0) return null;

  const se = new Audio(src);
  se.loop = loop;
  se.volume = finalVolume;
  se.play().catch(() => {});
  return se;
}
