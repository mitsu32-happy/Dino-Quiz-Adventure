import { saveNow } from "../systems/saveManager.js";

function pickWeighted(pool) {
  const list = Array.isArray(pool) ? pool : [];
  const total = list.reduce((s, p) => s + Math.max(0, Number(p.weight ?? 0)), 0);
  if (total <= 0) return null;

  let r = Math.random() * total;
  for (const p of list) {
    const w = Math.max(0, Number(p.weight ?? 0));
    r -= w;
    if (r <= 0) return p;
  }
  return list[list.length - 1] ?? null;
}

function getMasters(state) {
  const m = state.masters ?? {};
  return {
    items: m.avatar_items ?? m.avatarItems ?? [],
    packs: m.gacha_packs ?? m.gachaPacks ?? [],
  };
}

export function renderGachaDraw({ state, goto, params }) {
  const { save } = state;
  const { items, packs } = getMasters(state);

  const gachaId = params?.gachaId ?? null;
  const pack = (packs || []).find((p) => p.gacha_id === gachaId) ?? packs?.[0];

  if (!pack) {
    return `
      <div class="card"><div class="card-inner">
        <h2>ガチャ</h2>
        <div class="notice">パックが見つかりません。gachaId を確認してください。</div>
        <div class="space"></div>
        <button class="btn secondary" onclick="location.hash='#gacha'">バナー選択へ</button>
      </div></div>
    `;
  }

  const cost = Number(pack.cost_coin ?? 100);
  const coins = Number(save.economy?.coins ?? 0);

  // 今回の指定（pack1）
  const bannerPath = "/assets/images/gacha/banners/gacha_pack1.png";
  const moviePath = "/assets/images/gacha/movies/gacha_pack1.mp4";

  setTimeout(() => {
    const pullBtn = document.getElementById("pullBtn");
    const backBtn = document.getElementById("backBtn");
    const toHomeBtn = document.getElementById("toHomeBtn");
    const toAvatarBtn = document.getElementById("toAvatarBtn");

    const modal = document.getElementById("movieModal");
    const video = document.getElementById("movieVideo");
    const skipBtn = document.getElementById("skipBtn");

    const resultArea = document.getElementById("resultArea");
    const coinsEl = document.getElementById("coinsText");

    function openMovie() {
      if (!modal) return;
      modal.style.display = "flex";
      try {
        video.currentTime = 0;
        const p = video.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {}
    }

    function closeMovie() {
      if (!modal) return;
      try { video.pause(); } catch {}
      modal.style.display = "none";
    }

    function showResult(item, already) {
      resultArea.innerHTML = `
        <div class="result-card">
          <div class="result-title">獲得！</div>
          <div class="result-box">
            <img class="result-img" src="${item.asset_path}" alt="" onerror="this.style.opacity=0.25" />
            <div class="result-name">${item.name ?? item.item_id}</div>
            <div class="result-sub">
              ${already ? `<span class="pill">すでに所持</span>` : `<span class="pill" style="color:var(--good)">NEW!</span>`}
              <span class="pill">${item.type}</span>
            </div>
          </div>

          <div class="space"></div>

          <div class="row" style="gap:10px;flex-wrap:wrap;">
            <button class="btn" type="button" id="againBtn" style="flex:1;min-width:160px;">もう1回引く</button>
            <button class="btn secondary" type="button" id="backToBannersBtn" style="flex:1;min-width:160px;">バナー選択へ</button>
          </div>

          <div class="space"></div>

          <button class="btn secondary" type="button" id="toAvatarFromResultBtn">アバターで確認</button>
        </div>
      `;

      document.getElementById("againBtn")?.addEventListener("click", () => {
        // 同じ画面で続ける
        goto(`#gachaDraw?gachaId=${encodeURIComponent(pack.gacha_id)}`);
      });
      document.getElementById("backToBannersBtn")?.addEventListener("click", () => goto("#gacha"));
      document.getElementById("toAvatarFromResultBtn")?.addEventListener("click", () => goto("#avatar"));
    }

    backBtn?.addEventListener("click", () => goto("#gacha"));
    toHomeBtn?.addEventListener("click", () => goto("#home"));
    toAvatarBtn?.addEventListener("click", () => goto("#avatar"));

    // 動画終了で閉じる→結果表示（後で差し込む）
    let pendingResult = null;
    video?.addEventListener("ended", () => {
      closeMovie();
      if (pendingResult) {
        showResult(pendingResult.item, pendingResult.already);
        pendingResult = null;
      }
    });
    skipBtn?.addEventListener("click", () => {
      closeMovie();
      if (pendingResult) {
        showResult(pendingResult.item, pendingResult.already);
        pendingResult = null;
      }
    });

    pullBtn?.addEventListener("click", () => {
      // コイン不足
      if (Number(save.economy?.coins ?? 0) < cost) return;

      // 抽選
      const picked = pickWeighted(pack.pool);
      if (!picked?.item_id) return;

      const item = (items || []).find((it) => it.item_id === picked.item_id);
      if (!item) return;

      // コイン消費
      save.economy.coins -= cost;

      // 所持追加（重複は追加しない）
      const owned = Array.isArray(save.avatar?.ownedItemIds) ? save.avatar.ownedItemIds : [];
      if (!save.avatar) save.avatar = { equipped: { body: null, head: null, outfit: null, background: null }, ownedItemIds: [] };
      if (!Array.isArray(save.avatar.ownedItemIds)) save.avatar.ownedItemIds = owned;

      const already = save.avatar.ownedItemIds.includes(item.item_id);
      if (!already) save.avatar.ownedItemIds.push(item.item_id);

      // 統計
      if (!save.gacha) save.gacha = { totalPulls: 0, lastPulledAt: null };
      save.gacha.totalPulls = Number(save.gacha.totalPulls ?? 0) + 1;
      save.gacha.lastPulledAt = new Date().toISOString();

      saveNow(save);

      // 画面表示更新（所持コイン）
      if (coinsEl) coinsEl.textContent = `🪙 ${Number(save.economy?.coins ?? 0)}`;

      // 演出開始 → 終了後に結果を表示
      pendingResult = { item, already };
      openMovie();
    });
  }, 0);

  return `
    <div class="card"><div class="card-inner">
      <div class="row" style="justify-content:space-between;align-items:flex-start;">
        <div>
          <h2 style="margin:0;">${pack.name ?? "ガチャ"}</h2>
          <div style="color:var(--muted);font-size:12px;">引く → 演出 → 獲得</div>
        </div>
        <div class="row" style="gap:8px;">
          <button id="toAvatarBtn" class="btn" type="button" style="width:auto;padding:10px 12px;">アバター</button>
          <button id="toHomeBtn" class="btn secondary" type="button" style="width:auto;padding:10px 12px;">ホーム</button>
        </div>
      </div>

      <div class="space"></div>

      <div class="draw-pack">
        <img class="draw-banner" src="${bannerPath}" alt="" onerror="this.style.opacity=0.25" />
        <div class="space"></div>

        <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span class="pill">所持コイン: <b id="coinsText">🪙 ${coins}</b></span>
          <span class="pill">1回: 🪙 ${cost}</span>
        </div>

        <div class="space"></div>

        <button id="pullBtn" class="btn" type="button" ${coins < cost ? "disabled" : ""}>
          ガチャを引く（🪙 ${cost}）
        </button>

        ${coins < cost ? `<div class="notice" style="margin-top:10px;">コインが足りません。</div>` : ``}

        <div class="space"></div>
        <button id="backBtn" class="btn secondary" type="button">バナー選択へ戻る</button>
      </div>

      <div class="space"></div>

      <div id="resultArea"></div>
    </div></div>

    <!-- mp4 演出モーダル -->
    <div id="movieModal" class="movie-modal" style="display:none;">
      <div class="movie-sheet">
        <video id="movieVideo" class="movie-video" src="${moviePath}" playsinline webkit-playsinline></video>
        <button id="skipBtn" class="movie-skip" type="button">スキップ</button>
      </div>
    </div>

    <style>
      .draw-pack{
        border: 2px solid rgba(31,42,68,.16);
        background: rgba(255,255,255,.88);
        border-radius: 18px;
        padding: 12px;
        box-shadow: 0 10px 18px rgba(31,42,68,.10);
      }
      .draw-banner{
        width:100%;
        border-radius: 16px;
        border: 2px solid rgba(31,42,68,.12);
        background: rgba(255,255,255,.98);
        object-fit: cover;
        aspect-ratio: 16/9;
      }

      .result-card{
        border: 2px solid rgba(31,42,68,.16);
        background: rgba(255,255,255,.88);
        border-radius: 18px;
        padding: 12px;
        box-shadow: 0 10px 18px rgba(31,42,68,.10);
      }
      .result-title{ font-weight:1000; margin-bottom:8px; }
      .result-box{
        border: 2px solid rgba(31,42,68,.12);
        border-radius: 16px;
        background: rgba(255,255,255,.95);
        padding: 10px;
        text-align:center;
      }
      .result-img{
        width: 100%;
        max-width: 220px;
        aspect-ratio: 1/1;
        object-fit: contain;
        border-radius: 14px;
        border: 2px solid rgba(31,42,68,.12);
        background: rgba(255,255,255,.98);
      }
      .result-name{ margin-top: 8px; font-weight: 1000; }
      .result-sub{
        margin-top: 6px;
        display:flex;
        justify-content:center;
        gap: 8px;
        flex-wrap:wrap;
      }

      /* ===== 演出モーダル（スマホ縦でも見やすく） ===== */
      .movie-modal{
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,.55);
        backdrop-filter: blur(8px);
        display:flex;
        align-items:center;
        justify-content:center;
        z-index: 2000;
        padding: 14px;
      }
      .movie-sheet{
        width: min(720px, 100%);
        border-radius: 20px;
        border: 2px solid rgba(255,255,255,.18);
        background: rgba(10,10,12,.65);
        box-shadow: 0 30px 80px rgba(0,0,0,.4);
        overflow: hidden;
        position: relative;
      }
      .movie-video{
        width: 100%;
        height: auto;
        display:block;
        background: #000;
        /* ワイド動画を縦画面でも “収める” */
        aspect-ratio: 16 / 9;
        object-fit: contain;
      }
      .movie-skip{
        position: absolute;
        right: 10px;
        top: 10px;
        appearance:none;
        border: 2px solid rgba(255,255,255,.25);
        background: rgba(255,255,255,.12);
        color: #fff;
        border-radius: 999px;
        padding: 8px 12px;
        font-weight: 1000;
        cursor:pointer;
      }
      .movie-skip:active{ transform: translateY(2px); }
    </style>
  `;
}
