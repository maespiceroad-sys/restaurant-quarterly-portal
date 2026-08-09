# 上場飲食20社 四半期決算PDFポータル

日本の主要な上場飲食企業20社について、最新の四半期決算短信PDFを一覧で見られるポータルです。

ローカルでは PDF を保存して表示できます。GitHub Pages へ公開した場合は、各社の元PDFリンクをそのまま表示に使うため、クラウド上でもそのまま閲覧できます。

## できること

- 20社の最新決算短信PDFを一覧表示
- 企業ごとに直近4件の決算短信を表示
- 検索ボックスで企業名、証券コード、ブランド名から絞り込み
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
- `0 0 */5 * *` のスケジュールで定期更新

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

1. 株探と TDNET PDF から最新データを取得
2. `site/data.js` と `data/manifest.json` を更新
3. 変更があれば GitHub に自動コミット
4. `site/` を GitHub Pages に公開
5. 新着があればメール通知

## 補足

- ローカルでは `DOWNLOAD_PDFS=true` で PDF を保存して表示できます
- GitHub Actions では `DOWNLOAD_PDFS=false` で動かし、クラウドでは元PDF URL をそのまま表示します
- データ取得元は `kabutan.jp` と `tdnet-pdf.kabutan.jp` です
