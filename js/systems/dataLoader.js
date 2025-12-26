// js/dataLoader.js
// GitHub Pages（Project Pages）対応：import.meta.url 基準で data/ を解決する

function urlFromHere(rel) {
  // dataLoader.js は /js/ 配下に置かれている想定
  return new URL(rel, import.meta.url).toString();
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function loadAllMasters() {
  // ✅ 先頭スラッシュ（/data/...）は Project Pages だと 404 になりがちなので、
  //    dataLoader.js の場所から相対で解決します。
  const [questions, stages, avatarItems, gachaPacks, titles] = await Promise.all([
    fetchJson(urlFromHere("../data/questions.json")),
    fetchJson(urlFromHere("../data/stages.json")),
    fetchJson(urlFromHere("../data/avatar_items.json")).catch(() => []),
    fetchJson(urlFromHere("../data/gacha_packs.json")).catch(() => []),
    fetchJson(urlFromHere("../data/titles.json")).catch(() => []),
  ]);

  const questionById = new Map();
  for (const q of questions) questionById.set(q.id, q);

  const stageById = new Map();
  for (const s of stages) stageById.set(s.id, s);

  const titleById = new Map();
  for (const t of titles) titleById.set(t.title_id ?? t.id, t);

  // 既存コードのキーゆれを吸収するため、両方の名前で載せる
  return {
    questions,
    stages,
    titles,

    avatarItems,
    gachaPacks,

    // 互換キー
    avatar_items: avatarItems,
    gacha_packs: gachaPacks,

    questionById,
    stageById,
    titleById,
  };
}
