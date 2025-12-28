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
  btn.disabled = true;
  btn.textContent = "接続中…（初回は数十秒かかることがあります）";

  const bc = createBattleClient({
    transport: "online", // ✅ 重要
    serverUrl: "https://dino-quiz-battle-server.onrender.com",
    playerProfile: {
      name: state.save?.player?.name,
      titleId: state.save?.titles?.equippedTitleId,
      avatarEquipped: state.save?.avatar?.equipped,
      pvpWins: state.save?.battle?.pvp?.wins ?? 0,
      pvpLosses: state.save?.battle?.pvp?.losses ?? 0,
    },
  });

  try {
    const roomId = await bc.createRoom();
    state.battleClient = bc;
    state.currentRoomId = roomId;
    goto("#battleRoomLobby");
  } catch (e) {
    alert("サーバーに接続できませんでした。少し待って再度お試しください。");
    btn.disabled = false;
    btn.textContent = "ルームを作成";
  }
});

  }, 0);

  return html;
}
