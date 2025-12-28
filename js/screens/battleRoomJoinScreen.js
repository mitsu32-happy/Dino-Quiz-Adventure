import { playBgm, playSe } from "../systems/audioManager.js";
import { createBattleClient } from "../systems/battleClient.js";

export function renderBattleRoomJoin({ state, goto }) {
  const html = `
    <div class="card"><div class="card-inner">
      <h2>ルーム入室</h2>
      <p class="notice">ルームIDを入力してください。</p>

      <input class="input" id="roomIdInput" placeholder="例：AB3D9Q" />

      <div class="space"></div>
      <button class="btn" id="joinBtn">入室</button>
      <button class="btn secondary" id="backBtn">戻る</button>
    </div></div>
  `;

  setTimeout(() => {
    playBgm("assets/sounds/bgm/bgm_main.mp3");

    document.getElementById("backBtn")?.addEventListener("click", () => {
      playSe("assets/sounds/se/se_decide.mp3");
      goto("#battle");
    });

    document.getElementById("joinBtn")?.addEventListener("click", async () => {
      const roomId = document.getElementById("roomIdInput").value.trim().toUpperCase();
      if (!roomId) return alert("ルームIDを入力してください");

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

      await bc.joinRoom(roomId);
      state.battleClient = bc;
      state.currentRoomId = roomId;

      goto("#battleRoomLobby");
    });
  }, 0);

  return html;
}
