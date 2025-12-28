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

      const bc = createBattleClient({
        transport: "local",
        playerProfile: {
          name: state.save?.player?.name,
          titleId: state.save?.titles?.equippedTitleId,
          avatarEquipped: state.save?.avatar?.equipped,
          pvpWins: state.save?.battle?.pvp?.wins ?? 0,
          pvpLosses: state.save?.battle?.pvp?.losses ?? 0,
        },
      });

      const roomId = await bc.createRoom();
      state.battleClient = bc;
      state.currentRoomId = roomId;

      goto("#battleRoomLobby");
    });
  }, 0);

  return html;
}
