// GitHub Pages (Project Pages) / ローカル両対応：このモジュール位置から assets を解決する
const ROOT = new URL("../../", import.meta.url);
const asset = (p) => new URL(String(p || "").replace(/^\/+/, ""), ROOT).toString();

export function renderTop({ goto }) {
  const bg = asset("assets/images/top_bg.png");

  setTimeout(() => {
    const start = document.getElementById("startBtn");
    if (!start) return;

    // クリック / タップでホームへ
    start.addEventListener("click", () => goto("#home"));
    start.addEventListener("touchstart", () => goto("#home"), { passive: true });
  }, 0);

  return `
    <div class="top-screen">
      <!-- 背景 -->
      <div class="top-bg"></div>

      <!-- START 表示 -->
      <button id="startBtn" class="start-text" type="button">
        START
      </button>
    </div>

    <style>
      .top-screen{
        position: relative;
        min-height: 100vh;
        overflow: hidden;
      }

      .top-bg{
        position: fixed;
        inset: 0;
        z-index: -1;
        background-image: url('${bg}');
        background-size: cover;
        background-position: center;
      }

      /* START 表示 */
      .start-text{
        position: absolute;
        left: 50%;
        top: 62%; /* 中央よりやや下 */
        transform: translateX(-50%);
        appearance: none;
        background: none;
        border: none;
        padding: 0;
        margin: 0;

        font-size: 28px;
        font-weight: 1000;
        letter-spacing: 0.2em;
        color: #ffffff;
        text-shadow:
          0 2px 6px rgba(0,0,0,.45),
          0 0 12px rgba(255,255,255,.35);

        cursor: pointer;
        animation: blink 1.4s ease-in-out infinite;
      }

      .start-text:active{
        transform: translateX(-50%) scale(0.96);
      }

      @keyframes blink{
        0%   { opacity: 0.15; }
        50%  { opacity: 1; }
        100% { opacity: 0.15; }
      }
    </style>
  `;
}
