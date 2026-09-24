# record-shelf — 唱片架

實體收藏的網站版：30 首單曲，點封套抽出唱片、播 30 秒試聽，
背景色跟著封面走。試聽、封面與中繼資料來自 iTunes Search API。

線上版：https://record-shelf-nine.vercel.app

資料在 `data.js`（2026-09-24 起）：歌曲清單（`ALBUMS`，新 → 舊）＋
內頁文案（`NOTES`，key 對 id），`index.html` 主站與 `intro.html` 開場共用
同一份；封面在 `covers/<id>.jpg`。頁面本身不含資料。
部署用 `vercel --prod`（CLI 直傳工作區，非 git 自動部署）。

根目錄的 `singles*.json` / `previews*.json` / `itunes-raw*.json` 是當初
抓資料的暫存，已被 `.vercelignore` 排除，改它們對線上沒有作用。

加一首歌：
    npm install                                  # 第一次
    node scripts/add-song.mjs "歌手" "歌名"       # --dry 先看候選；--country GB 換商店；--pick N 選候選
自動抓 30 秒試聽＋600px 封面＋取主色壓暗，依年份插進 `data.js`。
remix／acoustic 封面常印字、腳本測不出來——加完開站親眼看一次。
