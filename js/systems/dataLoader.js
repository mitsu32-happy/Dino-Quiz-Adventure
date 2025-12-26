// GitHub Pages (Project Pages) / ローカル両対応：このモジュール位置から data/ を解決する
const ROOT = new URL("../../", import.meta.url);
const asset = (p) => new URL(String(p || "").replace(/^\/+/, ""), ROOT).toString();

async function fetchJson(relPath) {
  const url = asset(relPath);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${relPath}: ${res.status} ${res.statusText}`);
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

  // Index
  const questionById = new Map();
  for (const q of questions || []) questionById.set(q.id, q);

  const stageById = new Map();
  for (const s of stages || []) stageById.set(s.id, s);

  return {
    // snake_case（マスタ仕様の名前）
    questions,
    stages,
    avatar_items: avatarItems,
    gacha_packs: gachaPacks,
    titles,

    // camelCase（互換）
    avatarItems,
    gachaPacks,

    // index
    questionById,
    stageById,
  };
}
