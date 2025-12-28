// js/screens/optionsScreen.js
import { saveNow, exportSaveJson, importSaveJson, writeSaveToStorage } from "../systems/saveManager.js";
import { applyAudioOptions, playSe } from "../systems/audioManager.js";

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
function toPercent(n01) {
  return Math.round(clamp01(n01) * 100);
}
function fromPercent(p) {
  const v = Number(p);
  if (!Number.isFinite(v)) return 0;
  return clamp01(v / 100);
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function renderOptions({ state, goto }) {
  const save = state.save;

  // options 欠損を埋める（安全）
  save.options = save.options || {};
  if (typeof save.options.bgmVolume !== "number") save.options.bgmVolume = 0.8;
  if (typeof save.options.seVolume !== "number") save.options.seVolume = 0.9;
  if (typeof save.options.vibration !== "boolean") save.options.vibration = true;

  // 画面を開いた時点で音量を反映（重要）
  applyAudioOptions(save.options);

  const bgm = toPercent(save.options.bgmVolume);
  const se = toPercent(save.options.seVolume);
  const vib = Boolean(save.options.vibration);

  const lastBackupAt = save.meta?.lastBackupAt || "（まだありません）";

  setTimeout(() => {
    const bgmRange = document.getElementById("bgmRange");
    const seRange = document.getElementById("seRange");
    const vibToggle = document.getElementById("vibToggle");
    const bgmVal = document.getElementById("bgmVal");
    const seVal = document.getElementById("seVal");

    const exportBtn = document.getElementById("exportBtn");
    const exportInfo = document.getElementById("exportInfo");

    const restoreText = document.getElementById("restoreText");
    const restoreBtn = document.getElementById("restorePasteBtn");
    const restoreStatus = document.getElementById("restoreStatus");

    const backHomeBtn = document.getElementById("backHomeBtn");

    if (!bgmRange || !seRange || !vibToggle || !bgmVal || !seVal) {
      console.error("[optionsScreen] missing dom");
      return;
    }

    function applyAndSave() {
      save.options.bgmVolume = fromPercent(bgmRange.value);
      save.options.seVolume = fromPercent(seRange.value);
      save.options.vibration = vibToggle.checked;

      // 即反映
      applyAudioOptions(save.options);
      saveNow(save);
    }

    // 初期値
    bgmRange.value = String(bgm);
    seRange.value = String(se);
    vibToggle.checked = vib;

    bgmVal.textContent = `${bgmRange.value}%`;
    seVal.textContent = `${seRange.value}%`;

    // 即時反映
    bgmRange.addEventListener("input", () => {
      bgmVal.textContent = `${bgmRange.value}%`;
      applyAndSave();
    });
    seRange.addEventListener("input", () => {
      seVal.textContent = `${seRange.value}%`;
      applyAndSave();
      // 動かした感が分かるように軽くSE（音量反映確認にもなる）
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.6 });
    });
    vibToggle.addEventListener("change", applyAndSave);

    // バックアップ出力（JSONダウンロード）
    exportBtn?.addEventListener("click", () => {
      const json = exportSaveJson(save);
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      downloadText(`dinoquiz_save_backup_${ts}.json`, json);
      exportInfo.textContent = "バックアップJSONをダウンロードしました。";
      exportInfo.className = "notice";
    });

    // 復元（貼り付けJSONを読み込み → 保存 → リロード誘導）
    restoreBtn?.addEventListener("click", () => {
      const text = (restoreText.value || "").trim();
      if (!text) {
        restoreStatus.textContent = "JSONが空です。貼り付けてから実行してください。";
        restoreStatus.className = "notice";
        return;
      }

      const r = importSaveJson(text);
      if (!r.ok) {
        restoreStatus.textContent = `復元に失敗：${r.reason}`;
        restoreStatus.className = "notice";
        return;
      }

      // ここで復元確定
      writeSaveToStorage(r.save);

      restoreStatus.textContent = "復元しました。ホームへ戻ると反映されます（必要なら再読み込みしてください）。";
      restoreStatus.className = "notice";

      // stateも差し替えて即時反映（画面遷移で読み直す）
      state.save = r.save;
      applyAudioOptions(state.save.options);

      playSe("assets/sounds/se/se_correct.mp3", { volume: 0.8 });
    });

    backHomeBtn?.addEventListener("click", () => goto("#home"));
  }, 0);

  return `
    <div class="card"><div class="card-inner">
      <h2 style="margin:0 0 12px;">オプション</h2>

      <div class="option-row">
        <label style="min-width:90px;">BGM 音量</label>
        <input id="bgmRange" type="range" min="0" max="100" step="1" value="${bgm}">
        <span id="bgmVal" style="min-width:46px; text-align:right; font-weight:1000;">${bgm}%</span>
      </div>

      <div class="option-row">
        <label style="min-width:90px;">SE 音量</label>
        <input id="seRange" type="range" min="0" max="100" step="1" value="${se}">
        <span id="seVal" style="min-width:46px; text-align:right; font-weight:1000;">${se}%</span>
      </div>

      <div class="option-row">
        <label style="min-width:90px;">振動</label>
        <input id="vibToggle" type="checkbox" ${vib ? "checked" : ""}>
      </div>

      <div class="divider" style="margin:14px 0;"></div>

      <div class="card" style="padding:12px;">
        <div style="font-weight:1000;">💾 バックアップ</div>
        <div class="space" style="height:6px;"></div>
        <div style="font-size:12px; color:var(--muted);">最終バックアップ：${lastBackupAt}</div>
        <div class="space" style="height:10px;"></div>
        <button id="exportBtn" class="btn">JSONをダウンロード</button>
        <div class="space" style="height:8px;"></div>
        <div id="exportInfo" class="notice"></div>
      </div>

      <div class="space"></div>

      <div class="card" style="padding:12px;">
        <div style="font-weight:1000;">📝 復元（貼り付け）</div>
        <div class="space" style="height:8px;"></div>
        <textarea id="restoreText" rows="7"
          style="width:100%; box-sizing:border-box; border-radius:12px; border:2px solid rgba(31,42,68,.16); padding:10px;"
          placeholder="ここにバックアップJSONを貼り付け"></textarea>
        <div class="space"></div>
        <button id="restorePasteBtn" class="btn secondary">貼り付け内容で復元</button>
        <div class="space" style="height:8px;"></div>
        <div id="restoreStatus" class="notice"></div>
      </div>

      <div class="space"></div>
      <button id="backHomeBtn" class="btn secondary">ホームへ</button>

      <style>
        .option-row{ display:flex; align-items:center; gap:10px; margin-bottom:12px; font-weight:900; }
        .option-row input[type="range"]{ flex:1; }
      </style>
    </div></div>
  `;
}
