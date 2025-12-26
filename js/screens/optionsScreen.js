// js/screens/optionsScreen.js
import { saveNow } from "../systems/saveManager.js";
import { applyAudioOptions } from "../systems/audioManager.js";

function toPercent(v) {
  return Math.round((Number(v) || 0) * 100);
}
function fromPercent(p) {
  return Math.max(0, Math.min(1, Number(p) / 100));
}

export function renderOptions({ state, goto }) {
  const save = state.save;

  // ✅ 初期化（ここ重要）
  save.options = save.options || {};
  if (typeof save.options.bgmVolume !== "number") save.options.bgmVolume = 1.0;
  if (typeof save.options.seVolume !== "number") save.options.seVolume = 1.0;
  if (typeof save.options.vibration !== "boolean") save.options.vibration = true;

  function applyAndSave() {
    save.options.bgmVolume = fromPercent(bgmRange.value);
    save.options.seVolume = fromPercent(seRange.value);
    save.options.vibration = vibToggle.checked;

    applyAudioOptions(save.options);
    saveNow(save);
  }

  // DOMイベント
  setTimeout(() => {
    bgmRange.value = toPercent(save.options.bgmVolume);
    seRange.value = toPercent(save.options.seVolume);
    vibToggle.checked = save.options.vibration;

    bgmVal.textContent = `${bgmRange.value}%`;
    seVal.textContent = `${seRange.value}%`;

    // ✅ input で即時反映
    bgmRange.addEventListener("input", () => {
      bgmVal.textContent = `${bgmRange.value}%`;
      applyAndSave();
    });

    seRange.addEventListener("input", () => {
      seVal.textContent = `${seRange.value}%`;
      applyAndSave();
    });

    vibToggle.addEventListener("change", applyAndSave);

    backBtn.addEventListener("click", () => goto("#home"));
  }, 0);

  return `
    <div class="card">
      <div class="card-inner">
        <h2>オプション</h2>

        <div class="space"></div>

        <div class="option-row">
          <label>BGM 音量</label>
          <input id="bgmRange" type="range" min="0" max="100" step="1">
          <span id="bgmVal">100%</span>
        </div>

        <div class="option-row">
          <label>SE 音量</label>
          <input id="seRange" type="range" min="0" max="100" step="1">
          <span id="seVal">100%</span>
        </div>

        <div class="option-row">
          <label>
            <input id="vibToggle" type="checkbox">
            バイブレーション
          </label>
        </div>

        <div class="space"></div>

        <button id="backBtn" class="btn secondary">戻る</button>
      </div>

      <style>
        .option-row{
          display:flex;
          align-items:center;
          gap:10px;
          margin-bottom:14px;
          font-weight:900;
        }
        .option-row label{
          min-width:90px;
        }
        .option-row input[type="range"]{
          flex:1;
        }
      </style>
    </div>
  `;
}
