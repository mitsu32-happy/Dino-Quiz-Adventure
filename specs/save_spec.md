📄 save\_spec.md — セーブデータ仕様（正本）



■ 保存方法

\- localStorage

\- 必要に応じて IndexedDB に拡張可能（※現時点では未使用）



■ 保存対象

\- プレイヤー名

\- 進行状況

\- 各モードのステータス

\- アバター（所持・装備）

\- 称号

\- コイン

\- オプション

\- 対戦戦績（CPU戦 / 対人戦） ※今回追加



■ バックアップ

\- JSON出力

\- JSON読み込み → セーブ復元

\- バージョン管理あり

\- 復元時は上書き確認（画面側）

\- 復元時は「既存データを壊さない」ことを最優先（欠けているキーは既定値で補完）



■ 重要：後方互換（リリース済み対応）

\- 既存キーの改名・削除は禁止（例：economy → wallet のような変更は不可）

\- v1 の構造を維持し、「新しいキーを追加する」形で拡張する

\- 既存セーブに存在しない新キーは、ロード時に既定値で補完する



■ JSONデータ構造（v1）

（確定版。実装側でこれを基準に作成）



{

&nbsp; "version": 1,

&nbsp; "meta": {

&nbsp;   "createdAt": "",

&nbsp;   "lastPlayedAt": "",

&nbsp;   "lastBackupAt": ""

&nbsp; },

&nbsp; "player": {

&nbsp;   "id": "",

&nbsp;   "name": ""

&nbsp; },

&nbsp; "progress": {

&nbsp;   "unlockedModes": \[],

&nbsp;   "stages": {}

&nbsp; },

&nbsp; "economy": {

&nbsp;   "coins": 0

&nbsp; },

&nbsp; "avatar": {

&nbsp;   "equipped": {

&nbsp;     "body": null,

&nbsp;     "head": null,

&nbsp;     "outfit": null,

&nbsp;     "background": null

&nbsp;   },

&nbsp;   "ownedItemIds": \[]

&nbsp; },

&nbsp; "gacha": {

&nbsp;   "totalPulls": 0,

&nbsp;   "lastPulledAt": null

&nbsp; },

&nbsp; "titles": {

&nbsp;   "equippedTitleId": null,

&nbsp;   "unlockedTitleIds": \[]

&nbsp; },

&nbsp; "options": {

&nbsp;   "bgmVolume": 0.8,

&nbsp;   "seVolume": 0.9,

&nbsp;   "vibration": true

&nbsp; },



&nbsp; "battle": {

&nbsp;   "cpu": { "wins": 0, "losses": 0 },

&nbsp;   "pvp": { "wins": 0, "losses": 0 }

&nbsp; }

}



■ battle（対戦戦績）※v1拡張（追加キー）

\- CPU戦と対人戦の勝敗数は分けて保持する

\- 勝敗判定ルール

&nbsp; - 1位のみ勝ち（win）

&nbsp; - 2〜4位は負け（loss）

\- 既存セーブには battle が存在しない場合があるため、ロード時に補完してから保存してよい



■ economy（コイン）

\- 通貨は economy.coins を正とする（既存互換のため改名禁止）

\- 付与・消費は SaveManager 経由で保存する



■ 注意事項

\- localStorage への直接アクセスは禁止（SaveManager に集約）

\- 仕様書にない独断実装は禁止



