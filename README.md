# record-shelf — 唱片架

實體收藏的網站版：30 首單曲，點封套抽出唱片、播 30 秒試聽，
背景色跟著封面走。試聽、封面與中繼資料來自 iTunes Search API。

線上版：https://record-shelf-nine.vercel.app

單檔 `index.html`：歌曲清單（`ALBUMS`，新 → 舊）、內頁文案（`NOTES`）
與試聽連結都寫在裡面；封面在 `covers/<id>.jpg`。
部署用 `vercel --prod`（CLI 直傳工作區，非 git 自動部署）。

根目錄的 `singles*.json` / `previews*.json` / `itunes-raw*.json` 是當初
抓資料的暫存，已被 `.vercelignore` 排除，改它們對線上沒有作用。
