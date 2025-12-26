// GitHub Pages (Project Pages) / ローカル両対応：このモジュール位置から assets を解決する
const ROOT = new URL("../../", import.meta.url);
const asset = (p) => new URL(String(p || "").replace(/^\/+/, ""), ROOT).toString();
const normalizeAsset = (p) => {
  if (!p) return "";
  const s = String(p);
  if (/^https?:\/\//.test(s) || /^data:/.test(s)) return s;
  return asset(s);
};

export function renderTop({ goto }) {
  const bg = asset("assets/images/top_bg.png");

  setTimeout(() => {
    document.getElementById("startBtn")?.addEventListener("click", () => goto("#home"));
  }, 0);

  return `
    <div class="top-screen" style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:18px;">
      <div class="top-bg" style="
        position:fixed; inset:0; z-index:-1;
        background-image:url('${bg}');
        background-size:cover; background-position:center;
        filter:saturate(1.05);
      "></div>

      <div class="card" style="width:min(520px,100%);">
        <div class="card-inner" style="text-align:center;">
          <h1 style="margin:0;font-size:22px;line-height:1.25;font-weight:1000;">
            Dino Quiz Adventure<br><span style="font-size:14px;color:var(--muted);">-目指せ！恐竜博士！-</span>
          </h1>

          <div class="space"></div>

          <button id="startBtn" class="btn" type="button">はじめる</button>

          <div style="margin-top:10px;font-size:12px;color:var(--muted);">
            ※初回はデータ読み込みに少し時間がかかる場合があります
          </div>
        </div>
      </div>
    </div>
  `;
}
