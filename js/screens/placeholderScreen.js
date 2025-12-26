export function renderPlaceholder({ title, message, goto }) {
  // イベント登録
  setTimeout(() => {
    document.getElementById("backHomeBtn")?.addEventListener("click", () => {
      goto("#home");
    });
  }, 0);

  return `
    <div class="card"><div class="card-inner">
      <div class="row">
        <span class="pill">準備中</span>
      </div>

      <div class="space"></div>

      <h2 style="margin:0 0 8px;">${title}</h2>
      <div class="notice">${message}</div>

      <div class="space"></div>
      <button id="backHomeBtn" class="btn">ホームへ</button>
    </div></div>
  `;
}
