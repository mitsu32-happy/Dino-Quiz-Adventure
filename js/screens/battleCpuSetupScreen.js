import { playBgm, playSe } from "../systems/audioManager.js";

function pickRandom(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(a) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getAllQuestionIds(masters) {
  const m = masters?.questionById;
  if (!m || typeof m.keys !== "function") return [];
  return Array.from(m.keys());
}

function pickBattleQuestions(masters, count = 10) {
  const ids = getAllQuestionIds(masters);
  const shuffled = shuffle(ids);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function buildRandomCpuAvatar(masters) {
  const items = masters?.avatar_items ?? masters?.avatarItems ?? [];
  const body = pickRandom(items.filter((x) => String(x?.item_id || "").startsWith("body_")));
  const head = pickRandom(items.filter((x) => String(x?.item_id || "").startsWith("head_")));

  return {
    equipped: {
      body: body?.item_id ?? null,
      head: head?.item_id ?? null,
      outfit: null,
      background: null,
    },
  };
}

function getItemById(items, id) {
  return (items || []).find((it) => it?.item_id === id) ?? null;
}

// GitHub Pages / ローカル 両対応のパス解決
const ROOT = new URL("../../", import.meta.url);
const asset = (p) => new URL(String(p || "").replace(/^\/+/, ""), ROOT).toString();
const normalizeAsset = (p) => {
  if (!p) return "";
  const s = String(p);
  if (/^https?:\/\//.test(s) || /^data:/.test(s)) return s;
  return asset(s);
};

function layerImg(src, cls) {
  if (!src) return "";
  return `<img class="cpu-av-layer ${cls}" src="${normalizeAsset(src)}" alt="" onerror="this.style.opacity=0.25" />`;
}

export function renderBattleCpuSetup({ state, goto }) {
  const save = state.save;

  // 表示用CPUアバターは、画面表示時に固定で抽選して保持（開始時も同じものを使う）
  const cpuAvatars = [buildRandomCpuAvatar(state.masters), buildRandomCpuAvatar(state.masters), buildRandomCpuAvatar(state.masters)];

  const avatarItems = state.masters?.avatar_items ?? state.masters?.avatarItems ?? [];
  const standSrc = normalizeAsset("assets/images/quiz/quiz_stand.png");

  function renderCpuAvatarBox(cpuIndex) {
    const eq = cpuAvatars[cpuIndex]?.equipped ?? {};
    const body = getItemById(avatarItems, eq.body);
    const head = getItemById(avatarItems, eq.head);

    return `
      <div class="cpu-box">
        <div class="cpu-name">CPU${cpuIndex + 1}</div>

        <div class="cpu-avatar">
          ${layerImg(body?.asset_path, "cpu-body")}
          ${layerImg(head?.asset_path, "cpu-head")}
          <img class="cpu-stand" src="${standSrc}" alt="" onerror="this.style.opacity=0.25" />
        </div>

        <div class="cpu-strength">
          <select id="cpu${cpuIndex + 1}" class="input">
            <option value="weak">弱い</option>
            <option value="normal" selected>普通</option>
            <option value="strong">強い</option>
          </select>
        </div>
      </div>
    `;
  }

  const html = `
    <div class="card"><div class="card-inner">
      <h2 style="margin:0 0 8px;">CPU対戦 設定</h2>
      <div class="notice" style="margin-bottom:12px;">
        自分＋CPU3人で <b>10問勝負</b>します。強さは「正答率＋回答速度」に反映されます。
      </div>

      <div class="cpu-grid">
        ${renderCpuAvatarBox(0)}
        ${renderCpuAvatarBox(1)}
        ${renderCpuAvatarBox(2)}
      </div>

      <div class="space"></div>

      <div class="row-btn">
        <button class="btn secondary" id="backBtn" style="flex:1;">戻る</button>
        <button class="btn" id="startBtn" style="flex:1;">開始</button>
      </div>
    </div></div>

    <style>
      .cpu-grid{
        display:grid;
        grid-template-columns:repeat(3, 1fr);
        gap:10px;
      }
      @media (max-width:520px){
        /* スマホでも3つ横並びを優先（小さくなるが要望優先） */
        .cpu-grid{ grid-template-columns:repeat(3, 1fr); }
      }

      .cpu-box{
        border:2px solid rgba(31,42,68,.14);
        background:rgba(255,255,255,.96);
        border-radius:16px;
        padding:10px;
        box-shadow:0 10px 18px rgba(31,42,68,.10);
        text-align:center;
      }
      .cpu-name{
        font-weight:1000;
        font-size:12px;
        margin-bottom:6px;
      }

      .cpu-avatar{
        position:relative;
        width:100%;
        aspect-ratio:1/1;
        border-radius:16px;
        border:2px solid rgba(31,42,68,.12);
        background:rgba(255,255,255,.98);
        overflow:hidden;
      }
      .cpu-av-layer{
        position:absolute;
        inset:0;
        width:100%;
        height:100%;
        object-fit:contain;
      }
      .cpu-body{ z-index:1; }
      .cpu-head{ z-index:2; }
      .cpu-stand{
        position:absolute;
        inset:0;
        width:100%;
        height:100%;
        object-fit:contain;
        z-index:3;
        pointer-events:none;
      }

      .cpu-strength{
        margin-top:8px;
      }
      .cpu-strength .input{
        width:100%;
      }

      .row-btn{
        display:flex;
        gap:10px;
      }
    </style>
  `;

  setTimeout(() => {
    // BGM（他画面と同様）
    playBgm("assets/sounds/bgm/bgm_main.mp3");

    document.getElementById("backBtn")?.addEventListener("click", () => {
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.9 });
      goto("#battle");
    });

    document.getElementById("startBtn")?.addEventListener("click", () => {
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.9 });

      const cpu1 = document.getElementById("cpu1")?.value ?? "normal";
      const cpu2 = document.getElementById("cpu2")?.value ?? "normal";
      const cpu3 = document.getElementById("cpu3")?.value ?? "normal";
      const strengths = [cpu1, cpu2, cpu3];

      const qids = pickBattleQuestions(state.masters, 10);
      if (!qids.length) {
        alert("問題が見つかりませんでした。questions.json の読み込みを確認してください。");
        return;
      }

      const human = {
        type: "human",
        name: save?.player?.name || "PLAYER",
        titleId: save?.titles?.equippedTitleId ?? null,
        avatar: { equipped: save?.avatar?.equipped ?? { body: null, head: null, outfit: null, background: null } },
      };

      const cpuPlayers = strengths.map((s, idx) => ({
        type: "cpu",
        name: `CPU${idx + 1}`,
        titleId: null,
        strength: s,
        // 画面で表示していたアバターをそのまま使う
        avatar: cpuAvatars[idx],
      }));

      state.currentRun = {
        mode: "battle_cpu",
        startedAt: new Date().toISOString(),
        questionIds: qids,
        index: 0,
        players: [human, ...cpuPlayers],
        points: [0, 0, 0, 0],
        correctCounts: [0, 0, 0, 0],
        correctTimeSum: [0, 0, 0, 0],
        answers: [],
        _questionStartMs: 0,
      };

      goto("#battleQuiz");
    });
  }, 0);

  return html;
}
