📄 save\_spec.md — セーブデータ仕様

■ 保存方法



localStorage



必要に応じて IndexedDB に拡張可能



■ 保存対象



プレイヤー名



進行状況



各モードのステータス



アバター（所持・装備）



称号



コイン



オプション



■ バックアップ



JSON出力



JSON読み込み→セーブ復元



バージョン管理あり



復元時は上書き確認



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

&nbsp; }

}

