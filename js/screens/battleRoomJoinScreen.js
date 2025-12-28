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
  const input = document.getElementById("roomIdInput");
  const roomId = String(input?.value ?? "").trim().toUpperCase();
  if (!roomId) return alert("ルームIDを入力してください");

  playSe("assets/sounds/se/se_decide.mp3");

  const btn = document.getElementById("joinBtn");
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
    } catch (_) {}
    await new Promise(r => setTimeout(r, 2500));
    btn.textContent = "接続中…（サーバー起動待ち）";
  }

  try {
    const bc = createBattleClient({
      transport: "online",     // ✅ 重要
      serverUrl: SERVER_URL,
      playerProfile: {
        name: state.save?.player?.name,
        titleId: state.save?.titles?.equippedTitleId,
        avatarEquipped: state.save?.avatar?.equipped,
        pvpWins: state.save?.battle?.pvp?.wins ?? 0,
        pvpLosses: state.save?.battle?.pvp?.losses ?? 0,
      },
    });

    btn.textContent = "入室中…";
    await bc.joinRoom(roomId);

    state.battleClient = bc;
    state.currentRoomId = roomId;

    goto("#battleRoomLobby");
  } catch (e) {
    console.error(e);
    // ルーム不存在などはここに来る
    alert("入室できませんでした（ルームが存在しない／満員／サーバー未起動など）。");
    btn.disabled = false;
    back.disabled = false;
    btn.textContent = "入室";
  }
});
  }, 0);

  return html;
}
