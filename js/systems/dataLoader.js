// js/dataLoader.js

function assetUrl(path) {
  // GitHub Pages (Project Pages) / ローカル両対応：
  // "/data/xxx.json" のような絶対パスをやめ、document.baseURI 基準で解決する
  const clean = String(path).replace(/^\/+/, "");
  return new URL(clean, document.baseURI).toString();
}

async function fetchJson(path) {
  const url = assetUrl(path);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function loadAllMasters() {
  const [questions, stages, avatarItems, gachaPacks, titles] = await Promise.all([
    fetchJson("data/questions.json"),
    fetchJson("data/stages.json"),
    fetchJson("data/avatar_items.json").catch(() => []),
    fetchJson("data/gacha_packs.json").catch(() => []),
    fetchJson("data/titles.json").catch(() => []),
  ]);

  const questionById = new Map();
  for (const q of questions) questionById.set(q.id, q);

  const stageById = new Map();
  for (const s of stages) stageById.set(s.id, s);

  return {
    questions,
    stages,
    avatarItems,
    gachaPacks,
    titles,
    questionById,
    stageById,
  };
}
