📄 data\_master\_spec.md — データマスタ仕様

■ 目的



全データを「マスタ管理」



あとから追加できる拡張性重視



■ 問題データ



text4択＋画像4択対応



id

question\_text

mode (text\_choice | image\_choice)

choices\[]

correct\_index

category

difficulty

image\_url (任意)

time\_limit



■ ステージデータ

id

name

description

question\_ids\[]

reward\_coin

unlock\_condition





“問題マスタを参照する方式”

＝後から問題追加OK。



■ アバターデータ

item\_id

type (head / outfit / body / background)

rarity

asset\_path



アバター画像ネーミング仕様（確定）



本仕様は、

恐竜クイズゲーム「目指せ！恐竜博士！」 における

アバター画像アセットの命名規則を定義する正本仕様である。



本ルールは、



ガチャ



着せ替え



セーブデータ



将来的な追加・差し替え



を安全かつ一貫性を保って運用することを目的とする。



1\. 基本方針



すべてのアバター画像は 英字・数字・アンダースコアのみ を使用する



ファイル名から 用途・所属・識別情報が一意に分かる こと



表示名・レア度・入手条件などの意味情報は

マスタデータ（JSON）側で管理 し、画像名には持たせない



2\. アバター画像の分類



アバター画像は、以下のスロット（type）に分類する。



type	内容

body	キャラクター本体

head	帽子・被り物

outfit	服装

background	背景



この type は、avatar\_items.json の type フィールドと完全一致させる。



3\. 初期選択可能アバター（デフォルト）

3-1. 命名ルール



初期状態で選択可能なアバター画像は、

以下の命名規則を使用する。



\[type]\_default\_\[index].png



3-2. 例

body\_default\_01.png

head\_default\_01.png

outfit\_default\_01.png

background\_default\_01.png





default は 初期解放・ガチャ非依存 を示す固定キーワード



index は 01 始まりの連番とする



初期アバターは、ガチャ排出対象に含めない



4\. ガチャ用パック画像（代表画像）

4-1. 用途



ガチャ画面・演出・一覧表示に使用する

パック単位の代表画像 として使用する。



※ 実際に装備されるアバター画像とは別管理とする。



4-2. 命名ルール

\[type]\_pack\[packNo]\_\[index].png



4-3. 例

body\_pack1\_01.png

head\_pack2\_01.png

outfit\_pack3\_02.png



要素	内容

type	対象スロット

packNo	ガチャパック番号（数値のみ）

index	パック内の連番

4-4. packNo の扱い



packNo は 意味を持たない連番 とする



レア度・テーマ・排出内容は

gacha\_packs.json 側で管理する



gacha\_id と packNo は一致させることを推奨する



5\. 実アバター画像（装備画像）

5-1. 基本命名ルール

\[type]\_\[category]\_\[name]\_\[variant].png



5-2. 例

head\_dino\_tyranno\_v1.png

outfit\_explorer\_jacket\_brown.png

background\_jungle\_day.png



5-3. 注意事項



日本語は使用しない



レア度・入手条件・表示名はファイル名に含めない



variant は色違い・差分管理用とする



6\. item\_id との対応ルール



avatar\_items.json の item\_id は

画像ファイル名（拡張子なし）と完全一致 させる



例

{

&nbsp; "item\_id": "body\_default\_01",

&nbsp; "type": "body",

&nbsp; "rarity": "common",

&nbsp; "asset\_path": "assets/avatars/body/body\_default\_01.png"

}





これにより、



セーブデータ



装備状態



ガチャ排出



すべてを ID ベースで安全に管理できる。



7\. 禁止事項



以下の命名は禁止とする。



日本語・全角文字を含む名前



意味が曖昧な名前（例：cool.png, avatar1.png）



レア度・入手条件を直接含む名前（例：rare, event）



8\. 将来拡張について



新規アバター追加時も本仕様を厳守する



季節限定・復刻・再販などは

packNo や variant の追加で対応 し、既存命名は変更しない



補足（運用上のおすすめ）



デフォルトアバターは default 固定で管理



ガチャ画像と装備画像は必ず分離



意味はすべて JSON マスタ側に寄せる



■ ガチャパック

gacha\_id

name

cost\_coin

pool\[] (item\_id)

rarity\_weight



■ 称号

title\_id

name

description

condition\_type

condition\_value

