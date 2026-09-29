/* ===== 站台個人化（模板用戶只改這裡＋data.js） =====
   name  ：站名，logo 與分頁標題用
   latin ：logo 下的小字（會轉大寫顯示）
   aging ：牆會不會積灰（越久沒整理越舊，見 data.js 的 TENDED）；不要就改成 false
   url   ：你的網站網址（結尾不加斜線），分享預覽圖要用。這是我的，換成你的；還沒上線就留空 ''
   walls ：有接公開展示牆（Upstash）才設 true；沒接就改 false，「關於」不會叫人來做一面
   改完這個檔跑 node scripts/about.mjs，首頁給 AI 爬蟲讀的說明才會跟著換（加歌時會自動跑） */
const SITE = {
  name: '唱片架',
  latin: 'Record Shelf',
  aging: true,
  url: 'https://record-shelf-walls.vercel.app',
  walls: true,
};
