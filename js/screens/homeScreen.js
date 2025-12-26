import { saveNow } from "../systems/saveManager.js";
import { playSe } from "../systems/audioManager.js";

function isStageUnlocked(stage, save) {
  const cond = stage.unlock_condition?.type ?? "always";
  if (cond === "always") return true;
  if (cond === "stage_clear") {
    const need = stage.unlock_condition?.stage_id;
    return Boolean(save.progress?.stages?.[need]?.cleared);
  }
  return false;
}

function stageStatus(stageId, save) {
  return save.progress?.stages?.[stageId] ?? { cleared: false, bestScore: null };
}

function getItemById(items, id) {
  return (items || []).find((it) => it?.item_id === id) ?? null;
}

function safeMiniLayer(src, cls) {
  if (!src) return "";
  return `<img class="av-mini-layer ${cls}" src="${src}" alt="" onerror="this.style.opacity=0.25" />`;
}

export function renderHome({ state, goto, params }) {
  const { save, masters } = state;
  const section = params?.section ?? "modes"; // "modes" | "story"

  // 表示値
  const playerName = save.player?.name || "プレイヤー名未設定";

  const equippedTitleId = save.titles?.equippedTitleId ?? null;
  const unlockedTitleIds = save.titles?.unlockedTitleIds ?? [];

  // ✅ titles.json は title_id が正。旧サンプル互換で id も許容
  const equippedTitle =
    (masters.titles || []).find((t) => (t.title_id ?? t.id) === equippedTitleId) ?? null;
  const equippedTitleName = equippedTitle ? equippedTitle.name : "称号なし";

  const coins = save.economy?.coins ?? 0;

  // アバター合成ミニ用（装備）
  const avatarItems = masters?.avatar_items ?? masters?.avatarItems ?? [];
  const eq = save.avatar?.equipped ?? { body: null, head: null };
  const eqBody = getItemById(avatarItems, eq.body);
  const eqHead = getItemById(avatarItems, eq.head);

  // storyステージ一覧
  const storyStages = (masters.stages || []).filter((s) => s.mode === "story");

  // ボタン設定（旧レイアウトのまま）
  const btnsTop = [
    { key: "story",      label: "ステージ",       icon: "/assets/images/icon_story.png",       onClick: () => goto("#home?section=story"), disabled: false },
    { key: "timeAttack", label: "タイムアタック", icon: "/assets/images/icon_timeattack.png", onClick: () => goto("#timeAttack"), disabled: false },
    { key: "endless",    label: "エンドレス",     icon: "/assets/images/icon_endless.png",    onClick: () => goto("#endless"), disabled: false },
  ];

  // ✅ 対戦は準備中（グレーアウト＋押せない）
  const btnBattle = { key: "battle", label: "対戦（準備中）", icon: "/assets/images/icon_battle.png", onClick: () => goto("#battle"), disabled: true };

  const btnsBottom = [
    { key: "avatar",  label: "アバター",   icon: "/assets/images/icon_avatar.png",  onClick: () => goto("#avatar"),  disabled: false },
    { key: "gacha",   label: "ガチャ",     icon: "/assets/images/icon_gacha.png",   onClick: () => goto("#gacha"),   disabled: false },
    { key: "options", label: "オプション", icon: "/assets/images/icon_options.png", onClick: () => goto("#options"), disabled: false },
  ];

  // DOMイベント
  setTimeout(() => {
    // アバターミニアイコン → アバター画面へ
    document.getElementById("avatarMiniBtn")?.addEventListener("click", () => {
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.85 });
      goto("#avatar");
    });

    // プレイヤー名モーダル
    document.getElementById("playerNameBtn")?.addEventListener("click", () => {
      const modal = document.getElementById("playerModal");
      const input = document.getElementById("playerNameInput");
      if (!modal || !input) return;
      input.value = save.player?.name || "";
      modal.style.display = "flex";
      input.focus();
    });
    document.getElementById("playerCancelBtn")?.addEventListener("click", () => {
      const modal = document.getElementById("playerModal");
      if (modal) modal.style.display = "none";
    });
    document.getElementById("playerSaveBtn")?.addEventListener("click", () => {
      const input = document.getElementById("playerNameInput");
      save.player.name = (input?.value ?? "").trim();
      saveNow(save);
      goto("#home");
    });

    // 称号モーダル
    document.getElementById("titleBtn")?.addEventListener("click", () => {
      const modal = document.getElementById("titleModal");
      if (modal) modal.style.display = "flex";
    });
    document.getElementById("titleCloseBtn")?.addEventListener("click", () => {
      const modal = document.getElementById("titleModal");
      if (modal) modal.style.display = "none";
    });
    document.querySelectorAll(".titleItem")?.forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.dataset.id;
        if (!id) return;
        if (!unlockedTitleIds.includes(id)) return;
        save.titles.equippedTitleId = id;
        saveNow(save);
        goto("#home");
      });
    });

    // ホームのメニュー押下（決定SE）
    document.querySelectorAll("[data-home-btn]")?.forEach((el) => {
      el.addEventListener("click", () => {
        const k = el.getAttribute("data-home-btn");
        if (!k) return;

        const map = {
          story: btnsTop[0],
          timeAttack: btnsTop[1],
          endless: btnsTop[2],
          battle: btnBattle,
          avatar: btnsBottom[0],
          gacha: btnsBottom[1],
          options: btnsBottom[2],
        };
        const btn = map[k];
        if (!btn || btn.disabled) return;

        playSe("assets/sounds/se/se_decide.mp3", { volume: 0.85 });
        btn.onClick();
      });
    });

    // ステージ選択（決定SE）
    document.querySelectorAll(".stage[href^='#quiz']")?.forEach((el) => {
      el.addEventListener("click", (e) => {
        const disabled = el.getAttribute("aria-disabled") === "true";
        if (disabled) {
          e.preventDefault();
          return;
        }
        playSe("assets/sounds/se/se_decide.mp3", { volume: 0.85 });
      });
    });

    // ステージ一覧から戻る（決定SE）
    document.getElementById("backToModesBtn")?.addEventListener("click", () => {
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.85 });
      goto("#home");
    });

    // モーダル背景タップで閉じる
    document.querySelectorAll(".modal")?.forEach((m) => {
      m.addEventListener("click", (e) => {
        if (e.target === m) m.style.display = "none";
      });
    });
  }, 0);

  const iconButton = (b) => `
    <button class="icon-btn ${b.disabled ? "is-disabled" : ""}" data-home-btn="${b.key}" type="button">
      <img class="icon-img" src="${b.icon}" alt="" onerror="this.style.opacity=0.25" />
      <div class="icon-label">${b.label}</div>
    </button>
  `;

  const storyListHtml = storyStages.map((s) => {
    const unlocked = isStageUnlocked(s, save);
    const st = stageStatus(s.id, save);

    const pills = [
      `<span class="pill">問題数: ${Array.isArray(s.question_ids) ? s.question_ids.length : 0}</span>`,
      `<span class="pill">報酬: ${s.reward_coin ?? 0}コイン</span>`,
      st.cleared ? `<span class="pill" style="color:var(--good)">クリア済</span>` : `<span class="pill">未クリア</span>`,
      (st.bestScore != null) ? `<span class="pill">ベスト: ${st.bestScore}</span>` : "",
      unlocked ? "" : `<span class="pill" style="color:var(--bad)">ロック</span>`,
    ].filter(Boolean).join("");

    return `
      <a class="stage" href="#quiz?stageId=${encodeURIComponent(s.id)}" aria-disabled="${unlocked ? "false" : "true"}">
        <p class="name">${s.name}</p>
        <p class="desc">${s.description || ""}</p>
        <div class="meta">${pills}</div>
      </a>
    `;
  }).join("");

  // ===== HUD 2行（モード画面） =====
  const hud2Rows = `
    <div class="hud">
      <div class="hud-row1">
        <button id="avatarMiniBtn" class="avatar-mini-btn" type="button" title="アバター">
          <div class="avatar-mini">
            ${safeMiniLayer(eqBody?.asset_path, "mini-body")}
            ${safeMiniLayer(eqHead?.asset_path, "mini-head")}
          </div>
        </button>

        <button id="playerNameBtn" class="hud-pill hud-name" type="button" title="プレイヤー名を変更">
          👤 ${playerName}
        </button>

        <div class="hud-pill hud-coin" title="コイン">
          🪙 ${coins}
        </div>
      </div>

      <div class="hud-row2">
        <button id="titleBtn" class="hud-pill hud-title" type="button" title="称号を変更">
          🏷 ${equippedTitleName}
        </button>
      </div>
    </div>
  `;

  const modesHtml = `
    ${hud2Rows}

    <!-- メニュー領域：縦中央寄せ -->
    <div class="menu-area">
      <div class="home-grid3">
        ${btnsTop.map(iconButton).join("")}
      </div>

      <div class="space"></div>

      <div class="home-center">
        ${iconButton(btnBattle)}
      </div>

      <div class="space"></div>

      <div class="home-grid3">
        ${btnsBottom.map(iconButton).join("")}
      </div>
    </div>
  `;

  const storyHtml = `
    <div class="hud-row hud-row-story">
      <div class="hud-pill hud-static">📗 ステージ一覧</div>
      <div class="hud-pill hud-coin">🪙 ${coins}</div>
      <button id="backToModesBtn" class="hud-pill" type="button">← 戻る</button>
    </div>

    <div class="space"></div>

    <div class="list">
      ${storyListHtml || `<div class="notice">story ステージがありません（data/stages.json を確認してください）</div>`}
    </div>
  `;

  return `
    <div class="home-screen" style="background-image:url('/assets/images/home_bg.png');">
      <div class="home-overlay">
        <div class="card home-card">
          <div class="card-inner home-inner">
            ${section === "story" ? storyHtml : modesHtml}
          </div>
        </div>
      </div>
    </div>

    <!-- プレイヤー名モーダル -->
    <div id="playerModal" class="modal">
      <div class="modal-sheet">
        <div class="modal-title">プレイヤー名の変更</div>
        <div class="modal-sub">12文字まで。未入力でもOKです。</div>

        <div class="space"></div>

        <input id="playerNameInput" class="modal-input" type="text" maxlength="12" placeholder="例：みっつー" />

        <div class="space"></div>

        <div class="row">
          <button id="playerCancelBtn" class="btn secondary" type="button">キャンセル</button>
          <button id="playerSaveBtn" class="btn" type="button">保存</button>
        </div>
      </div>
    </div>

    <!-- 称号モーダル -->
    <div id="titleModal" class="modal">
      <div class="modal-sheet" style="max-height:80vh; overflow:auto;">
        <div class="modal-title">称号を選択</div>
        <div class="modal-sub">解放済みの称号のみ選べます。</div>

        <div class="space"></div>

        <div class="list">
          ${(masters.titles || []).map((t) => {
            const tid = t.title_id ?? t.id;

            const unlocked = unlockedTitleIds.includes(tid);
            const equipped = tid === equippedTitleId;

            return `
              <div class="stage titleItem" data-id="${tid}"
                style="
                  opacity:${unlocked ? "1" : "0.45"};
                  border-color:${equipped ? "rgba(37,99,235,.55)" : "rgba(31,42,68,.16)"};
                  cursor:${unlocked ? "pointer" : "default"};
                  pointer-events:${unlocked ? "auto" : "none"};
                ">
                <div class="row" style="justify-content:space-between;">
                  <div style="font-weight:1000;">${t.name}</div>
                  ${equipped ? `<span class="pill">装備中</span>` : ""}
                </div>
                <div class="desc">${t.description || ""}</div>
              </div>
            `;
          }).join("")}
        </div>

        <div class="space"></div>
        <button id="titleCloseBtn" class="btn secondary" type="button">閉じる</button>
      </div>
    </div>

    <style>
      .home-screen{
        min-height: 100vh;
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        padding: 0;
        position: relative;
      }

      .home-screen::before{
        content:"";
        position:absolute;
        inset:0;
        background: linear-gradient(to bottom, rgba(255,255,255,.10), rgba(255,255,255,.22));
        backdrop-filter: blur(1px);
        pointer-events:none;
      }

      .home-overlay{
        position: relative;
        z-index: 1;
        width:100%;
        min-height: 100vh;
        padding: 18px 14px;
        max-width: 520px;
        margin: 0 auto;
        display:flex;
        align-items:stretch;
        justify-content:center;
      }

      .home-card{
        width:100%;
        background: linear-gradient(180deg, rgba(255,255,255,.94), rgba(255,255,255,.88));
        border: 2px solid rgba(31,42,68,.16);
        box-shadow: 0 16px 34px rgba(31,42,68,.18);
      }

      .home-inner{
        display:flex;
        flex-direction:column;
        min-height: calc(100vh - 18px*2 - 14px*2 - 2px);
      }

      /* ===== HUD（2行） ===== */
      .hud{
        display:flex;
        flex-direction:column;
        gap: 8px;
        padding: 10px 10px;
        border-radius: 18px;
        border: 2px solid rgba(31,42,68,.18);
        background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(255,255,255,.86));
      }

      .hud-row1{
        display:grid;
        grid-template-columns: 56px 1fr auto;
        gap: 8px;
        align-items:center;
      }
      .hud-row2{ display:flex; }

      .avatar-mini-btn{
        appearance:none;
        border: 2px solid rgba(31,42,68,.18);
        background: rgba(255,255,255,.92);
        border-radius: 16px;
        padding: 6px;
        cursor:pointer;
        box-shadow: 0 10px 18px rgba(31,42,68,.10);
      }
      .avatar-mini-btn:active{ transform: translateY(2px); }

      .avatar-mini{
        width: 40px;
        aspect-ratio: 1/1;
        position: relative;
        border-radius: 14px;
        border: 2px solid rgba(31,42,68,.12);
        background: rgba(255,255,255,.98);
        overflow:hidden;
      }
      .av-mini-layer{
        position:absolute;
        inset:0;
        width:100%;
        height:100%;
        object-fit: contain;
      }
      .mini-body{ z-index:1; }
      .mini-head{ z-index:2; }

      .hud-pill{
        appearance:none;
        border: 2px solid rgba(31,42,68,.18);
        background: rgba(255,255,255,.92);
        color: var(--text);
        border-radius: 999px;
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 1000;
        cursor:pointer;
        overflow:hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-shadow: none;
        text-align:left;
      }
      .hud-name{ min-width: 0; }
      .hud-title{ width: 100%; }
      .hud-pill.hud-coin{ cursor: default; text-align:center; }

      /* story表示時は既存の3列HUD */
      .hud-row.hud-row-story{
        display:grid;
        grid-template-columns: 1fr auto auto;
        gap: 8px;
        align-items:center;
        padding: 10px 10px;
        border-radius: 18px;
        border: 2px solid rgba(31,42,68,.18);
        background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(255,255,255,.86));
      }
      .hud-pill.hud-static{ cursor: default; }

      /* ===== メニュー（縦中央寄せ） ===== */
      .menu-area{
        flex:1;
        display:flex;
        flex-direction:column;
        align-items:stretch;
        justify-content:center;
        padding-top: 12px;
      }

      .home-grid3{
        display:grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }

      .home-center{
        display:flex;
        justify-content:center;
      }
      .home-center .icon-btn{
        width: min(170px, 48vw);
      }

      .icon-btn{
        appearance:none;
        border: 2px solid rgba(31,42,68,.18);
        background: rgba(255,255,255,.96);
        border-radius: 20px;
        padding: 12px 12px 12px;
        cursor:pointer;
        display:flex;
        flex-direction:column;
        align-items:center;
        gap: 10px;
        box-shadow:
          0 10px 18px rgba(31,42,68,.18),
          0 3px 0 rgba(31,42,68,.14);
        transform: translateY(0);
      }
      .icon-btn:active{
        transform: translateY(2px);
        box-shadow:
          0 7px 14px rgba(31,42,68,.14),
          0 1px 0 rgba(31,42,68,.12);
      }
      .icon-btn.is-disabled{
        opacity: .55;
        cursor: not-allowed;
        transform:none;
        box-shadow: none;
      }

      .icon-img{
        width: 100%;
        aspect-ratio: 1 / 1;
        object-fit: contain;
        border-radius: 16px;
        border: 2px solid rgba(31,42,68,.14);
        background: rgba(255,255,255,.92);
      }

      .icon-label{
        width: 100%;
        font-weight: 1000;
        font-size: 12px;
        color: var(--text);
        text-align:center;
        letter-spacing: .02em;
        padding: 6px 8px;
        border-radius: 14px;
        border: 2px solid rgba(31,42,68,.18);
        background: rgba(255,255,255,.96);
        text-shadow: none;
      }

      /* ===== モーダル：白カード ===== */
      .modal{
        display:none;
        position:fixed;
        inset:0;
        background: rgba(0,0,0,.35);
        backdrop-filter: blur(6px);
        z-index: 1000;
        align-items:center;
        justify-content:center;
        padding: 14px;
      }

      .modal-sheet{
        width: 92%;
        max-width: 420px;
        border-radius: 22px;
        border: 2px solid rgba(31,42,68,.18);
        background: linear-gradient(180deg, #ffffff, #f8fafc);
        box-shadow: 0 22px 50px rgba(31,42,68,.22);
        padding: 14px;
        color: var(--text);
      }

      .modal-title{
        font-weight: 1000;
        font-size: 16px;
        margin: 0;
        color: var(--text);
      }

      .modal-sub{
        margin-top: 6px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
      }

      .modal-input{
        width:100%;
        padding: 12px 12px;
        border-radius: 16px;
        border: 2px solid rgba(31,42,68,.18);
        background: rgba(255,255,255,.98);
        color: var(--text);
        outline: none;
        font-weight: 900;
      }
      .modal-input:focus{
        border-color: rgba(37,99,235,.55);
        box-shadow: 0 0 0 3px rgba(37,99,235,.12);
      }
    </style>
  `;
}
