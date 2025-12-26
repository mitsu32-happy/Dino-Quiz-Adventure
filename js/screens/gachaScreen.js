function getMasters(state) {
  const m = state.masters ?? {};
  return {
    packs: m.gacha_packs ?? m.gachaPacks ?? [],
  };
}

export function renderGacha({ state, goto }) {
  const { save } = state;
  const { packs } = getMasters(state);

  if (!Array.isArray(packs) || packs.length === 0) {
    return `
      <div class="card"><div class="card-inner">
        <h2>ガチャ</h2>
        <div class="notice">gacha_packs.json が読み込めませんでした。</div>
        <div class="space"></div>
        <button class="btn secondary" onclick="location.hash='#home'">ホームへ</button>
      </div></div>
    `;
  }

  // 今回は pack1（先頭）を想定
  const pack = packs[0];
  const gachaId = pack.gacha_id;

  // ユーザー指定のバナー
  const bannerPath = "/assets/images/gacha/banners/gacha_pack1.png";

  const coins = Number(save.economy?.coins ?? 0);
  const cost = Number(pack.cost_coin ?? 100);

  setTimeout(() => {
    document.getElementById("toHomeBtn")?.addEventListener("click", () => goto("#home"));
    document.getElementById("toAvatarBtn")?.addEventListener("click", () => goto("#avatar"));

    document.getElementById("bannerBtn")?.addEventListener("click", () => {
      goto(`#gachaDraw?gachaId=${encodeURIComponent(gachaId)}`);
    });
  }, 0);

  return `
    <div class="card"><div class="card-inner">
      <div class="row" style="justify-content:space-between;align-items:flex-start;">
        <div>
          <h2 style="margin:0;">ガチャ</h2>
          <div style="color:var(--muted);font-size:12px;">バナーを選んでください</div>
        </div>
        <div class="row" style="gap:8px;">
          <button id="toAvatarBtn" class="btn" type="button" style="width:auto;padding:10px 12px;">アバター</button>
          <button id="toHomeBtn" class="btn secondary" type="button" style="width:auto;padding:10px 12px;">ホーム</button>
        </div>
      </div>

      <div class="space"></div>

      <div class="banner-grid">
        <button id="bannerBtn" class="banner-card" type="button">
          <img class="banner-img" src="${bannerPath}" alt="" onerror="this.style.opacity=0.25" />
          <div class="banner-meta">
            <div class="banner-title">${pack.name ?? "ガチャパック"}</div>
            <div class="banner-sub">${pack.description ?? ""}</div>
            <div class="banner-row">
              <span class="pill">所持コイン: 🪙 ${coins}</span>
              <span class="pill">1回: 🪙 ${cost}</span>
            </div>
          </div>
          <div class="banner-cta">タップして引く</div>
        </button>
      </div>
    </div></div>

    <style>
      .banner-grid{
        display:grid;
        grid-template-columns: 1fr;
        gap: 12px;
      }
      .banner-card{
        appearance:none;
        border: 2px solid rgba(31,42,68,.16);
        background: rgba(255,255,255,.90);
        border-radius: 20px;
        padding: 12px;
        cursor:pointer;
        box-shadow: 0 12px 22px rgba(31,42,68,.12);
        text-align:left;
        position: relative;
        overflow:hidden;
      }
      .banner-card:active{ transform: translateY(2px); }
      .banner-img{
        width: 100%;
        border-radius: 16px;
        border: 2px solid rgba(31,42,68,.12);
        background: rgba(255,255,255,.98);
        object-fit: cover;
        aspect-ratio: 16/9;
      }
      .banner-meta{ margin-top: 10px; }
      .banner-title{ font-weight: 1000; font-size: 16px; }
      .banner-sub{ color: var(--muted); font-size: 12px; margin-top: 4px; line-height: 1.4; }
      .banner-row{ margin-top: 8px; display:flex; gap: 8px; flex-wrap:wrap; }
      .banner-cta{
        margin-top: 10px;
        font-weight: 1000;
        text-align:center;
        padding: 10px 12px;
        border-radius: 16px;
        border: 2px solid rgba(31,42,68,.12);
        background: rgba(255,255,255,.96);
      }
    </style>
  `;
}
