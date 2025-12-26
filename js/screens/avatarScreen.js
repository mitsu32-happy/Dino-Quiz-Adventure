import { saveNow } from "../systems/saveManager.js";

function ensureDefaultAvatarOwned(state) {
  const { masters, save } = state;
  const items = masters?.avatar_items ?? masters?.avatarItems ?? [];
  if (!Array.isArray(items) || items.length === 0) return;

  const owned = new Set(save.avatar?.ownedItemIds ?? []);
  const bodies = items.filter((it) => it.type === "body");

  for (const b of bodies) {
    if (b?.item_id) owned.add(b.item_id);
  }

  save.avatar.ownedItemIds = Array.from(owned);

  if (!save.avatar?.equipped) save.avatar.equipped = { body: null, head: null, outfit: null, background: null };
  if (!save.avatar.equipped.body && bodies[0]?.item_id) {
    save.avatar.equipped.body = bodies[0].item_id;
  }
}

function groupItemsByType(items) {
  const map = { body: [], head: [], outfit: [], background: [] };
  for (const it of items) {
    if (!it || !it.type) continue;
    if (!map[it.type]) map[it.type] = [];
    map[it.type].push(it);
  }
  return map;
}

function getItemById(items, id) {
  return items.find((it) => it.item_id === id) ?? null;
}

function safeImg(src) {
  if (!src) return "";
  return `<img class="av-img" src="${src}" alt="" onerror="this.style.opacity=0.25" />`;
}

function safeLayer(src, cls) {
  if (!src) return "";
  return `<img class="av-layer ${cls}" src="${src}" alt="" onerror="this.style.opacity=0.25" />`;
}

export function renderAvatar({ state, goto }) {
  const { masters, save } = state;

  const items = masters?.avatar_items ?? masters?.avatarItems ?? [];
  if (!Array.isArray(items) || items.length === 0) {
    return `
      <div class="card"><div class="card-inner">
        <h2>アバター</h2>
        <div class="notice">avatar_items が読み込めませんでした。dataLoader.js で avatar_items を masters に載せているか確認してください。</div>
        <div class="space"></div>
        <button class="btn secondary" onclick="location.hash='#home'">ホームへ</button>
      </div></div>
    `;
  }

  // 初期所持の補完（ボディ16体は所持扱い）
  ensureDefaultAvatarOwned(state);
  saveNow(save);

  const ownedSet = new Set(save.avatar?.ownedItemIds ?? []);
  const eq = save.avatar?.equipped ?? { body: null, head: null, outfit: null, background: null };

  const grouped = groupItemsByType(items);
  const bodies = grouped.body ?? [];
  const heads = grouped.head ?? [];

  const eqBody = getItemById(items, eq.body);
  const eqHead = getItemById(items, eq.head);

  const bodyCards = bodies.map((b) => {
    const owned = ownedSet.has(b.item_id);
    const equipped = eq.body === b.item_id;
    return `
      <button class="item ${equipped ? "is-eq" : ""}" ${owned ? "" : "disabled"} data-eq-type="body" data-item-id="${b.item_id}" type="button">
        ${safeImg(b.asset_path)}
        <div class="item-name">${b.name ?? b.item_id}</div>
        <div class="item-sub">
          ${equipped ? `<span class="pill">装備中</span>` : owned ? `<span class="pill">所持</span>` : `<span class="pill">未所持</span>`}
        </div>
      </button>
    `;
  }).join("");

  const headCards = heads.map((h) => {
    const owned = ownedSet.has(h.item_id);
    const equipped = eq.head === h.item_id;
    return `
      <button class="item ${equipped ? "is-eq" : ""}" ${owned ? "" : "disabled"} data-eq-type="head" data-item-id="${h.item_id}" type="button">
        ${safeImg(h.asset_path)}
        <div class="item-name">${h.name ?? h.item_id}</div>
        <div class="item-sub">
          ${equipped ? `<span class="pill">装備中</span>` : owned ? `<span class="pill">所持</span>` : `<span class="pill">未所持</span>`}
        </div>
      </button>
    `;
  }).join("");

  // DOM
  setTimeout(() => {
    document.querySelectorAll("[data-eq-type]")?.forEach((el) => {
      el.addEventListener("click", () => {
        const type = el.getAttribute("data-eq-type");
        const id = el.getAttribute("data-item-id");
        if (!type || !id) return;

        const owned = (save.avatar?.ownedItemIds ?? []).includes(id);
        if (!owned) return;

        save.avatar.equipped[type] = id;
        saveNow(save);
        goto("#avatar");
      });
    });

    document.getElementById("toHomeBtn")?.addEventListener("click", () => goto("#home"));
    document.getElementById("toGachaBtn")?.addEventListener("click", () => goto("#gacha"));
    document.getElementById("clearHeadBtn")?.addEventListener("click", () => {
      save.avatar.equipped.head = null;
      saveNow(save);
      goto("#avatar");
    });
  }, 0);

  return `
    <div class="card"><div class="card-inner">
      <div class="row" style="justify-content:space-between;align-items:flex-start;">
        <div>
          <h2 style="margin:0;">アバター</h2>
          <div style="color:var(--muted);font-size:12px;">タップで装備（未所持は選べません）</div>
        </div>
        <div class="row" style="gap:8px;">
          <button id="toGachaBtn" class="btn" type="button" style="width:auto;padding:10px 12px;">ガチャへ</button>
          <button id="toHomeBtn" class="btn secondary" type="button" style="width:auto;padding:10px 12px;">ホーム</button>
        </div>
      </div>

      <div class="space"></div>

      <!-- 合成プレビュー -->
      <div class="preview">
        <div class="preview-box">
          <div class="preview-title">いまの装備（合成表示）</div>

          <div class="preview-row">
            <div class="composite">
              ${safeLayer(eqBody?.asset_path, "layer-body")}
              ${safeLayer(eqHead?.asset_path, "layer-head")}
              ${!eqBody ? `<div class="composite-empty">未装備</div>` : ``}
            </div>

            <div class="preview-info">
              <div class="info-line"><span class="info-label">Body:</span> <span class="info-value">${eqBody?.name ?? "未装備"}</span></div>
              <div class="info-line"><span class="info-label">Head:</span> <span class="info-value">${eqHead?.name ?? "未装備"}</span></div>

              <div class="space"></div>

              <button id="clearHeadBtn" class="btn secondary" type="button" style="padding:10px 12px;">
                ヘッドを外す
              </button>

              <div class="preview-note">※画像は同サイズ前提で上に重ねています</div>
            </div>
          </div>

          <div class="space"></div>

          <!-- デバッグ用：個別プレビュー（必要なければ後で消します） -->
          <details class="debug">
            <summary>個別表示（確認用）</summary>
            <div class="debug-grid">
              <div class="debug-slot">
                <div class="slot-label">Body</div>
                ${eqBody ? safeImg(eqBody.asset_path) : `<div class="notice">未装備</div>`}
              </div>
              <div class="debug-slot">
                <div class="slot-label">Head</div>
                ${eqHead ? safeImg(eqHead.asset_path) : `<div class="notice">未装備</div>`}
              </div>
            </div>
          </details>
        </div>
      </div>

      <div class="space"></div>

      <h3 style="margin:0 0 8px;">ボディ（初期16）</h3>
      <div class="grid">${bodyCards}</div>

      <div class="space"></div>

      <h3 style="margin:0 0 8px;">ヘッド（ガチャ）</h3>
      <div class="grid">${headCards}</div>
    </div></div>

    <style>
      .preview{ margin-top: 4px; }
      .preview-box{
        border: 2px solid rgba(31,42,68,.16);
        background: rgba(255,255,255,.85);
        border-radius: 18px;
        padding: 12px;
        box-shadow: 0 10px 18px rgba(31,42,68,.10);
      }
      .preview-title{ font-weight:1000; margin-bottom:10px; }

      .preview-row{
        display:grid;
        grid-template-columns: 160px 1fr;
        gap: 12px;
        align-items:start;
      }
      @media (max-width: 420px){
        .preview-row{ grid-template-columns: 140px 1fr; }
      }

      /* ===== 合成表示 ===== */
      .composite{
        width: 160px;
        aspect-ratio: 1/1;
        position: relative;
        border-radius: 18px;
        border: 2px solid rgba(31,42,68,.14);
        background: rgba(255,255,255,.96);
        box-shadow: 0 10px 18px rgba(31,42,68,.10);
        overflow:hidden;
      }
      .av-layer{
        position:absolute;
        inset: 0;
        width:100%;
        height:100%;
        object-fit: contain;
        image-rendering: auto;
      }
      .layer-body{ z-index: 1; }
      .layer-head{ z-index: 2; }

      .composite-empty{
        position:absolute;
        inset: 0;
        display:flex;
        align-items:center;
        justify-content:center;
        color: var(--muted);
        font-weight: 1000;
        font-size: 12px;
      }

      .preview-info{
        border: 2px solid rgba(31,42,68,.12);
        border-radius: 18px;
        background: rgba(255,255,255,.92);
        padding: 10px;
      }
      .info-line{ display:flex; gap:8px; align-items:baseline; }
      .info-label{ color: var(--muted); font-size: 12px; font-weight: 1000; width: 52px; }
      .info-value{ font-weight: 1000; font-size: 13px; }
      .preview-note{ color:var(--muted); font-size:12px; margin-top:10px; }

      /* 確認用（後で消せる） */
      .debug{ margin-top: 6px; }
      .debug summary{
        cursor:pointer;
        font-weight:1000;
        color: var(--muted);
      }
      .debug-grid{
        margin-top: 10px;
        display:grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .debug-slot{
        border: 2px solid rgba(31,42,68,.12);
        border-radius: 16px;
        background: rgba(255,255,255,.95);
        padding: 10px;
        text-align:center;
      }
      .slot-label{
        font-size:12px;
        font-weight:1000;
        color: var(--muted);
        margin-bottom: 6px;
      }

      /* ===== 一覧 ===== */
      .grid{
        display:grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      @media (max-width: 420px){
        .grid{ grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }

      .item{
        appearance:none;
        border: 2px solid rgba(31,42,68,.16);
        background: rgba(255,255,255,.92);
        border-radius: 18px;
        padding: 10px;
        cursor: pointer;
        box-shadow: 0 10px 18px rgba(31,42,68,.10);
        display:flex;
        flex-direction:column;
        align-items:center;
        gap: 8px;
      }
      .item:active{ transform: translateY(2px); }
      .item:disabled{ opacity:.45; cursor:not-allowed; transform:none; }

      .item.is-eq{
        border-color: rgba(37,99,235,.55);
        box-shadow: 0 12px 20px rgba(37,99,235,.15);
      }

      .av-img{
        width: 100%;
        aspect-ratio: 1/1;
        object-fit: contain;
        border-radius: 14px;
        border: 2px solid rgba(31,42,68,.12);
        background: rgba(255,255,255,.96);
      }
      .item-name{
        font-weight:1000;
        font-size: 12px;
        text-align:center;
      }
      .item-sub{ display:flex; gap:6px; }
    </style>
  `;
}
