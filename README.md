# 上場飲食50社 四半期決算PDFポータル

日本の上場飲食企業50社について、最新の四半期決算短信PDFを一覧で見られるポータルです。

公開サイト: https://maespiceroad-sys.github.io/restaurant-quarterly-portal/

GitHub ActionsでPDFを取得し、GitHub Pages内に保存して表示します。PCが停止していても定期収集とメール通知が動きます。

## できること

- 50社の最新決算短信PDFを一覧表示
- 企業ごとに直近4件の決算短信を表示
- 検索ボックスで企業名、証券コード、ブランド名から絞り込み
- スパイスロードに近い業態・運営の5社を絞り込み
- 更新時にメール通知
- GitHub Actions で定期更新
- GitHub Pages でクラウド公開

## 対象企業

- ゼンショーホールディングス
- すかいらーくホールディングス
- コロワイド
- トリドールホールディングス
- サイゼリヤ
- 吉野家ホールディングス
- コメダホールディングス
- 物語コーポレーション
- くら寿司
- 王将フードサービス
- 力の源ホールディングス
- ハイデイ日高
- SRSホールディングス
- ワタミ
- 壱番屋
- アトム
- カッパ・クリエイト
- 木曽路
- ホットランドホールディングス
- 幸楽苑
- グローバルダイニング
- アークランズ
- クリエイト・レストランツ・ホールディングス
- WDI
- グルメ杵屋
- 日本マクドナルドホールディングス
- ロイヤルホールディングス
- FOOD & LIFE COMPANIES
- テンアライド
- エー・ピーホールディングス
- 大庄
- エターナルホスピタリティグループ
- チムニー
- ユナイテッド＆コレクティブ
- ヨシックスホールディングス
- 銚子丸
- Genki Global Dining Concepts
- 銀座ルノアール
- フジオフードグループ本社
- イートアンドホールディングス
- カルラ
- 東京一番フーズ
- 丸千代山岡家
- NATTY SWANKYホールディングス
- 浜木綿
- ギフトホールディングス
- フライングガーデン
- ペッパーフードサービス
- リンガーハット
- ハブ

証券コードと市場区分は、[JPXの上場銘柄一覧](https://www.jpx.co.jp/markets/statistics-equities/misc/01.html)（2026年9月末）で照合。上場廃止となったDDグループやSFPホールディングスは含めません。

比較分類は分析のための判断です。グローバルダイニング、アークランズ、クリエイト・レストランツは業態比較、WDIは海外料理ブランドの運営比較、グルメ杵屋はティーヌン運営業態の参考比較です。アークランズの連結決算にはホームセンター事業なども含まれます。マンゴツリーはアークランズ側の比較ブランドで、WDIのブランドではありません。

## ローカル起動

```powershell
cd "C:\Users\user\OneDrive\画像\ドキュメント\New project\restaurant-quarterly-portal"
npm.cmd install
Copy-Item .env.example .env
```

`.env` に SMTP 情報などを入れます。

### 1回更新する

```powershell
npm.cmd run update
```

更新後に主に変わるファイル:

- `site/data.js`
- `data/manifest.json`
- `logs/latest-run.json`

### ローカルプレビュー

```powershell
npm.cmd run serve
```

`http://localhost:4180/` で確認できます。

## GitHub Pages でクラウド公開

このリポジトリには GitHub Actions ワークフローが入っています。

- push 時に Pages 用のサイトを再公開
- 手動実行も可能
- 毎日UTC 00:00（日本時間09:00）に起動し、前回の全社取得成功日から5日経過した日に収集します。月末・年末でも間隔は変わりません。GitHubの実行遅延により開始時刻は前後します
- 手動実行・pushでは5日の待機を省略して収集します

### GitHub Secrets

GitHub リポジトリ側に以下を設定します。

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_FROM`
- `MAIL_TO`
- `MAX_REPORTS_PER_COMPANY`
- `REPORT_NOTIFY_ALWAYS`

Pages URL は workflow 内で自動設定されます。

### GitHub Actions の動き

1. Yahoo!ファイナンスのTDnet開示一覧を複数ページ確認（株探を予備取得先として使用）
2. `site/data.js` と `data/manifest.json` を更新
3. 変更があれば GitHub に自動コミット
4. `site/` を GitHub Pages に公開
5. 新着があればメール通知（送信先: maespiceroad@gmail.com）

メール送信に失敗した場合は未送信一覧をmanifestに保持し、次の実行で再試行します。収集失敗時は前回の企業データを保持し、全社失敗・未取得企業・メール失敗をActionsの失敗として検出します。

PDFはActions Cacheに保持し、公開用artifactに含めます。PDF本体と`.env`はGitにコミットしません。キャッシュがなくても再取得します。ローカルのWindows定期タスクはクラウド確認後に無効化し、二重通知を避けます。

## 検証

`npm test`で、50社の重複、取得先切替時の識別子、決算資料の選別、取得失敗時のデータ保持、月末・年末の実行間隔を確認します。

## 補足

- ローカルでは `DOWNLOAD_PDFS=true` で PDF を保存して表示できます
- GitHub Actionsでは`DOWNLOAD_PDFS=true`で動かし、サイト内でPDFを表示します
- 売上高・利益の自動抽出や評価は行いません。メールには開示日・企業名・決算タイトル・PDFリンクをまとめます
