import { applyAudioOptions } from "../systems/audioManager.js";


// js/screens/optionsScreen.js
import {
  exportSaveJson,
  importSaveJson,
  saveNow,
  writeSaveToStorage,
} from "../systems/saveManager.js";

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function toPercent(n01) {
  return Math.round(clamp01(n01) * 100);
}

function fromPercent(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return 0;
  return clamp01(n / 100);
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

  const bgm = toPercent(save.options?.bgmVolume ?? 0.8);
  const se = toPercent(save.options?.seVolume ?? 0.9);
  const vib = Boolean(save.options?.vibration ?? true);

  const lastBackupAt = save.meta?.lastBackupAt || "（まだありません）";

  setTimeout(() => {
    const bgmRange = document.getElementById("bgmRange");
    const seRange = document.getElementById("seRange");
    const vibToggle = document.getElementById("vibToggle");

    const bgmVal = document.getElementById("bgmVal");
    const seVal = document.getElementById("seVal");

    function applyAndSave() {
      save.options.bgmVolume = fromPercent(bgmRange.value);
      save.options.seVolume = fromPercent(seRange.value);
      save.options.vibration = vibToggle.checked;
      saveNow(save);

      applyAudioOptions(save.options);


    }

    bgmRange?.addEventListener("input", () => {
      bgmVal.textContent = `${bgmRange.value}%`;
    });
    bgmRange?.addEventListener("change", applyAndSave);

    seRange?.addEventListener("input", () => {
      seVal.textContent = `${seRange.value}%`;
    });
    seRange?.addEventListener("change", applyAndSave);

    vibToggle?.addEventListener("change", applyAndSave);

    // バックアップ（ダウンロード）
    document.getElementById("backupBtn")?.addEventListener("click", () => {
      const json = exportSaveJson(save);
      const ts = new Date().toISOString().replaceAll(":", "-");
      downloadText(`dinoquiz_save_v1_${ts}.json`, json);
      // 画面更新
      goto("#options");
    });

    // 復元（ファイル）
    document.getElementById("restoreFile")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const text = await file.text();
      doRestore(text);
      // inputをリセット（同ファイルを連続で選べるように）
      e.target.value = "";
    });

    // 復元（貼り付け）
    document.getElementById("restorePasteBtn")?.addEventListener("click", () => {
      const text = document.getElementById("restoreText").value;
      doRestore(text);
    });

    // 戻る
    document.getElementById("backHomeBtn")?.addEventListener("click", () => {
      goto("#home");
    });

    function doRestore(jsonText) {
      const status = document.getElementById("restoreStatus");
      status.textContent = "";

      const result = importSaveJson(jsonText);
      if (!result.ok) {
        status.textContent = `復元失敗：${result.reason}`;
        return;
      }

      if (!confirm("バックアップデータでセーブを上書き復元します。よろしいですか？")) {
        status.textContent = "キャンセルしました。";
        return;
      }

      // localStorageへ反映 & stateに差し替え
      writeSaveToStorage(result.save);
      state.save = result.save;

      status.textContent = "復元しました。ホームに戻って確認してください。";
    }
  }, 0);

  return `
    <div class="card"><div class="card-inner">
      <h2 style="margin:0 0 10px;">オプション</h2>

      <div class="notice">
        バックアップはJSONをダウンロードします。復元はJSONを読み込んで上書きします。<br/>
        最終バックアップ：${lastBackupAt}
      </div>

      <div class="space"></div>

      <div class="stage">
        <div style="font-weight:900;">🔊 音量</div>
        <div class="space" style="height:8px;"></div>

        <div style="font-weight:800; margin-bottom:6px;">BGM <span id="bgmVal" class="pill" style="margin-left:8px;">${bgm}%</span></div>
        <input id="bgmRange" type="range" min="0" max="100" value="${bgm}" style="width:100%;" />

        <div class="space" style="height:10px;"></div>

        <div style="font-weight:800; margin-bottom:6px;">SE <span id="seVal" class="pill" style="margin-left:8px;">${se}%</span></div>
        <input id="seRange" type="range" min="0" max="100" value="${se}" style="width:100%;" />
      </div>

      <div class="space"></div>

      <div class="stage">
        <div style="font-weight:900;">📳 振動</div>
        <div class="space" style="height:8px;"></div>
        <label class="notice" style="display:flex; align-items:center; gap:10px;">
          <input id="vibToggle" type="checkbox" ${vib ? "checked" : ""} />
          振動を有効にする
        </label>
      </div>

      <div class="space"></div>

      <h3 style="margin:0 0 10px;">セーブのバックアップ / 復元</h3>

      <button id="backupBtn" class="btn">📦 バックアップJSONをダウンロード</button>

      <div class="space"></div>

      <div class="stage">
        <div style="font-weight:900;">♻ 復元（ファイル）</div>
        <div class="space" style="height:8px;"></div>
        <input id="restoreFile" type="file" accept=".json,application/json" />
        <div class="space" style="height:8px;"></div>
        <div class="notice">※ JSONを選ぶと、内容チェック → 上書き確認 → 復元します。</div>
      </div>

      <div class="space"></div>

      <div class="stage">
        <div style="font-weight:900;">📝 復元（貼り付け）</div>
        <div class="space" style="height:8px;"></div>
        <textarea id="restoreText" rows="6" style="width:100%; border-radius:14px; border:1px solid var(--line); background:rgba(0,0,0,.12); color:var(--text); padding:10px;" placeholder="ここにバックアップJSONを貼り付け"></textarea>
        <div class="space"></div>
        <button id="restorePasteBtn" class="btn secondary">貼り付け内容で復元</button>
        <div class="space" style="height:8px;"></div>
        <div id="restoreStatus" class="notice"></div>
      </div>

      <div class="space"></div>
      <button id="backHomeBtn" class="btn secondary">ホームへ</button>
    </div></div>
  `;
}
