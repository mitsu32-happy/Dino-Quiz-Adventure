// js/screens/topScreen.js
import { playSe } from "../systems/audioManager.js";

export function renderTop({ goto }) {
  // イベント登録
  setTimeout(() => {
    const startBtn = document.getElementById("startBtn");

    // クリック/タップで決定音 → ホームへ
    startBtn?.addEventListener("click", () => {
      playSe("assets/sounds/se/se_decide.mp3", { volume: 0.85 });
      goto("#home");
    });
  }, 0);

  return `
    <div class="top-screen">
      <img
        class="top-bg"
        src="/assets/images/top_bg.png"
        alt="Top Background"
        onerror="this.style.display='none'"
      />

      <div class="start-wrapper">
        <button id="startBtn" class="start-btn">
          START
        </button>
      </div>
    </div>

    <style>
      .top-screen {
        position: relative;
        width: 100%;
        height: 100vh;
        overflow: hidden;
      }

      .top-bg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .start-wrapper {
        position: absolute;
        left: 50%;
        bottom: 22%;
        transform: translateX(-50%);
        z-index: 2;
      }

      .start-btn {
        font-size: 26px;
        font-weight: 900;
        letter-spacing: 0.12em;
        padding: 16px 42px;
        border-radius: 999px;
        border: none;
        color: var(--bg);
        background: var(--accent);
        cursor: pointer;
        animation: startBlink 1.2s infinite ease-in-out;
        box-shadow: 0 0 24px rgba(110,231,255,.6);
      }

      @keyframes startBlink {
        0%   { opacity: 1; transform: scale(1); }
        50%  { opacity: 0.35; transform: scale(0.97); }
        100% { opacity: 1; transform: scale(1); }
      }
    </style>
  `;
}
