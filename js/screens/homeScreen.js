// GitHub Pages (Project Pages) / ローカル両対応：このモジュール位置から assets を解決する
const ROOT = new URL("../../", import.meta.url);
const asset = (p) => new URL(String(p || "").replace(/^\/+/, ""), ROOT).toString();
const normalizeAsset = (p) => {
  if (!p) return "";
  const s = String(p);
  if (/^https?:\/\//.test(s) || /^data:/.test(s)) return s;
  return asset(s);
};

export function renderHome({ state, goto }) {
  const bg = asset("assets/images/home_bg.png");

  const tiles = [
    { id: "story", label: "ステージ", hash: "#home", img: asset("assets/images/icon_story.png") },
    { id: "time", label: "タイムアタック", hash: "#timeAttack", img: asset("assets/images/icon_timeattack.png") },
    { id: "endless", label: "エンドレス", hash: "#endless", img: asset("assets/images/icon_endless.png") },
    { id: "battle", label: "対戦モード", hash: "#battle", img: asset("assets/images/icon_battle.png") },
    { id: "avatar", label: "アバター", hash: "#avatar", img: asset("assets/images/icon_avatar.png") },
    { id: "gacha", label: "ガチャ", hash: "#gacha", img: asset("assets/images/icon_gacha.png") },
    { id: "options", label: "オプション", hash: "#options", img: asset("assets/images/icon_options.png") },
  ];

  setTimeout(() => {
    for (const t of tiles) {
      document.getElementById(`go_${t.id}`)?.addEventListener("click", () => goto(t.hash));
    }
  }, 0);

  return `
    <div class="home" style="min-height:100vh;padding:18px;">
      <div class="home-bg" style="
        position:fixed; inset:0; z-index:-1;
        background-image:url('${bg}');
        background-size:cover; background-position:center;
      "></div>

      <div class="card">
        <div class="card-inner">
          <div class="row" style="justify-content:space-between;align-items:flex-end;">
            <div>
              <h2 style="margin:0;">ホーム</h2>
              <div style="color:var(--muted);font-size:12px;">遊ぶモードを選んでください</div>
            </div>
          </div>

          <div class="space"></div>

          <div class="menu-grid">
            ${tiles
              .map(
                (t) => `
              <button id="go_${t.id}" class="menu-tile" type="button">
                <img class="menu-icon" src="${t.img}" alt="" onerror="this.style.opacity=0.25" />
                <div class="menu-label">${t.label}</div>
              </button>
            `
              )
              .join("")}
          </div>
        </div>
      </div>

      <style>
        .menu-grid{
          display:grid;
          grid-template-columns: repeat(2, minmax(0,1fr));
          gap: 12px;
        }
        @media (min-width: 520px){
          .menu-grid{ grid-template-columns: repeat(3, minmax(0,1fr)); }
        }
        .menu-tile{
          appearance:none;
          border: 2px solid rgba(31,42,68,.16);
          background: rgba(255,255,255,.90);
          border-radius: 20px;
          padding: 14px 12px;
          cursor:pointer;
          box-shadow: 0 12px 22px rgba(31,42,68,.12);
          display:flex;
          flex-direction:column;
          align-items:center;
          gap: 10px;
        }
        .menu-tile:active{ transform: translateY(2px); }
        .menu-icon{
          width: 52px; height: 52px;
          object-fit: contain;
        }
        .menu-label{
          font-weight: 1000;
          font-size: 13px;
        }
      </style>
    </div>
  `;
}
