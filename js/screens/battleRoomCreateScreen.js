import { playBgm, playSe } from "../systems/audioManager.js";
import { createBattleClient } from "../systems/battleClient.js";

export function renderBattleRoomCreate({ state, goto }) {
  const html = `
    <div class="card"><div class="card-inner">
      <h2>ルーム作成</h2>
      <p class="notice">ルームを作成し、フレンドを招待します。</p>

      <div class="space"></div>
      <button class="btn" id="createBtn">ルームを作成</button>
      <button class="btn secondary" id="backBtn">戻る</button>
    </div></div>
  `;

  setTimeout(() => {
    playBgm("assets/sounds/bgm/bgm_main.mp3");

    document.getElementById("backBtn")?.addEventListener("click", () => {
      playSe("assets/sounds/se/se_decide.mp3");
      goto("#battle");
    });

document.getElementById("createBtn")?.addEventListener("click", async () => {
  playSe("assets/sounds/se/se_decide.mp3");

  const btn = document.getElementById("createBtn");
  const back = document.getElementById("backBtn");
  btn.disabled = true;
  back.disabled = true;

  const SERVER_URL = "https://dino-quiz-battle-server.onrender.com";

  // Renderの起床待ち（最大60秒）
  const startAt = Date.now();
  const timeoutMs = 60000;

  btn.textContent = "接続中…（サーバー起動待ち）";
  while (Date.now() - startAt < timeoutMs) {
    try {
      const res = await fetch(`${SERVER_URL}/health`, { cache: "no-store" });
      if (res.ok) break;
    } catch (_) {
      // 起床前は失敗してOK
    }
    await new Promise(r => setTimeout(r, 2500));
    btn.textContent = "接続中…（サーバー起動待ち）";
  }

  try {
    const bc = createBattleClient({
      transport: "online",          // ✅ 重要：local → online
      serverUrl: SERVER_URL,        // ✅ Render
      playerProfile: {
        name: state.save?.player?.name,
        titleId: state.save?.titles?.equippedTitleId,
        avatarEquipped: state.save?.avatar?.equipped,
        pvpWins: state.save?.battle?.pvp?.wins ?? 0,
        pvpLosses: state.save?.battle?.pvp?.losses ?? 0,
      },
    });

    btn.textContent = "ルーム作成中…";
    const roomId = await bc.createRoom();

    state.battleClient = bc;
    state.currentRoomId = roomId;

    goto("#battleRoomLobby");
  } catch (e) {
    console.error(e);
    alert("ルーム作成に失敗しました。サーバー起動直後は時間がかかることがあります。少し待って再度お試しください。");
    btn.disabled = false;
    back.disabled = false;
    btn.textContent = "ルームを作成";
  }
});

  }, 0);

  return html;
}
