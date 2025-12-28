import { playBgm, playSe } from "../systems/audioManager.js";

export function renderBattleMenu({ state, goto }) {
  const html = `
    <div class="card">
      <div class="card-inner battle-menu">
        <h2 class="battle-title">対戦モード</h2>
        <p class="battle-desc">
          CPU対戦（4人）や、オンライン対戦（ルーム作成／入室）が楽しめます。
        </p>

        <div class="battle-list">

          <!-- CPU対戦 -->
          <button class="battle-item" id="cpuBtn" type="button">
            <img
              class="battle-icon"
              src="assets/images/battle/icon_cpu.png"
              alt="CPU対戦"
            />
            <div class="battle-text">
              <div class="battle-item-title">CPU対戦</div>
              <div class="battle-item-desc">
                CPU3人と早押しクイズで対戦！
              </div>
            </div>
          </button>

          <!-- ルーム作成（ローカル擬似オンライン確認用に有効化） -->
          <button class="battle-item" id="createBtn" type="button">
            <img
              class="battle-icon"
              src="assets/images/battle/icon_room_create.png"
              alt="ルーム作成"
            />
            <div class="battle-text">
              <div class="battle-item-title">ルーム作成</div>
              <div class="battle-item-desc">
                ルームIDを作ってフレンドを招待
              </div>
            </div>
          </button>

          <!-- ルーム入室（ローカル擬似オンライン確認用に有効化） -->
          <button class="battle-item" id="joinBtn" type="button">
            <img
              class="battle-icon"
              src="assets/images/battle/icon_room_join.png"
              alt="ルーム入室"
            />
            <div class="battle-text">
              <div class="battle-item-title">ルーム入室</div>
              <div class="battle-item-desc">
                ルームIDを入力して参加
              </div>
            </div>
          </button>

        </div>

        <div class="space"></div>
        <button class="btn secondary" id="backBtn" type="button">ホームへ</button>
      </div>
    </div>

    <style>
      .battle-menu {
        text-align: left;
      }

      .battle-title {
        margin: 0 0 6px;
      }

      .battle-desc {
        font-size: 14px;
        opacity: 0.85;
        margin-bottom: 14px;
      }

      .battle-list {
        display: grid;
        gap: 12px;
      }

      .battle-item {
        position: relative;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border-radius: 14px;
        background: #fff;
        border: 2px solid rgba(0,0,0,0.08);
        box-shadow: 0 6px 14px rgba(0,0,0,0.12);
        cursor: pointer;
        transition: transform .08s ease, box-shadow .08s ease;
      }

      .battle-item:active {
        transform: translateY(2px);
        box-shadow: 0 3px 8px rgba(0,0,0,0.12);
      }

      .battle-icon {
        width: 64px;
        height: 64px;
        object-fit: contain;
        flex-shrink: 0;
      }

      .battle-text {
        flex: 1;
      }

      .battle-item-title {
        font-size: 16px;
        font-weight: 900;
      }

      .battle-item-desc {
        font-size: 13px;
        opacity: 0.8;
        margin-top: 2px;
      }
    </style>
  `;

  setTimeout(() => {
    // 他画面と同様のBGM（audioManager 側で重複制御される想定）
    playBgm("assets/sounds/bgm/bgm_main.mp3");

    // ✅ 多重バインド対策：
    // 既存のイベントが残っていても確実に「1個だけ」にするため、
    // 対象要素を clone -> replace してから addEventListener する。
    const bindSafe = (id, onClick) => {
      const el = document.getElementById(id);
      if (!el || !el.parentNode) return;

      const newEl = el.cloneNode(true); // 既存リスナーを全消し
      el.parentNode.replaceChild(newEl, el);

      newEl.addEventListener("click", () => {
        // ✅ 連打・二重発火ガード
        if (newEl.dataset.busy === "1") return;
        newEl.dataset.busy = "1";
        newEl.disabled = true;

        try {
          onClick();
        } finally {
          // 画面遷移に失敗した場合でも戻せるように短時間で解除
          setTimeout(() => {
            if (!newEl.isConnected) return;
            newEl.disabled = false;
            newEl.dataset.busy = "0";
          }, 400);
        }
      });
    };

    bindSafe("cpuBtn", () => {
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.9 });
      goto("#battleCpuSetup");
    });

    bindSafe("createBtn", () => {
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.9 });
      goto("#battleRoomCreate");
    });

    bindSafe("joinBtn", () => {
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.9 });
      goto("#battleRoomJoin");
    });

    bindSafe("backBtn", () => {
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.9 });
      goto("#home");
    });
  }, 0);

  return html;
}
