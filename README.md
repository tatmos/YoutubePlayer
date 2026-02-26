# YouTube リスト再生

YouTubeのURLを登録し、リストの順に連続再生するWebアプリです。

## 機能

- **URLの登録** … `youtube.com/watch?v=...` や `youtu.be/...` 形式のURLを追加
- **リスト再生** … 登録した順に自動で次の動画を再生
- **永続化** … リストはブラウザのローカルストレージに保存（タブを閉じても残る）
- **削除・クリア** … 個別削除やリスト全体のクリア

## 使い方

### 起動方法

1. **そのまま開く**  
   `index.html` をブラウザで開く（ダブルクリックまたはドラッグ＆ドロップ）。

2. **簡易サーバーで開く（推奨）**  
   同じフォルダで以下を実行し、表示されたURLを開く。

   ```bash
   # Python 3
   python -m http.server 8080

   # Node.js (npx)
   npx serve -p 8080
   ```

   → ブラウザで `http://localhost:8080` を開く。

### 操作

1. 入力欄にYouTubeのURLを貼り付けて「追加」をクリック（Enterでも追加可）
2. リストに動画が並ぶので、「最初から再生」または一覧の行をクリックして再生
3. 再生中の動画が終わると、次の動画が自動で再生される

## 対応URL形式

- `https://www.youtube.com/watch?v=動画ID`
- `https://youtu.be/動画ID`
- `https://www.youtube.com/embed/動画ID`
- 動画IDのみ（11文字）

## ファイル構成

```
YoutubePlayer/
├── index.html   # メインHTML
├── styles.css   # スタイル
├── app.js       # リスト管理・再生ロジック
└── README.md    # このファイル
```

## 注意

- YouTubeの埋め込みプレイヤー（IFrame API）を使用しています。YouTubeの仕様変更の影響を受ける可能性があります。
- リストはこのアプリを使う端末・ブラウザのローカルストレージにのみ保存されます。別の端末やシークレットモードでは共有されません。
