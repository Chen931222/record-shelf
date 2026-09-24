# record-shelf

A one-page record wall for the singles you actually own. Click a sleeve and
the record slides out, a 30-second preview plays, and the page takes on the
cover's own color. Liner notes open on the right, if you wrote them.

Static HTML. No framework, no build step. One data file.

Demo (my 30 singles): https://record-shelf-nine.vercel.app
— and a scroll-driven opening at [/intro.html](https://record-shelf-nine.vercel.app/intro.html).

繁體中文說明：[README.zh-TW.md](README.zh-TW.md)

## Make it yours

```
git clone https://github.com/Chen931222/record-shelf.git my-shelf
cd my-shelf
cp data.starter.js data.js        # start from an empty shelf
rm covers/*.jpg                   # those are my covers, fetch your own
npm install                       # one dependency, for cover-color extraction
node scripts/add-song.mjs "Ed Sheeran" "Shape of You"
node scripts/add-song.mjs "Queen" "Bohemian Rhapsody"
python -m http.server 8533        # or any static file server
```

Open http://localhost:8533, look at every cover once, then put your name on
it in `site.config.js`. Deploy anywhere static files go: GitHub Pages
(Settings → Pages → deploy from branch) or `vercel --prod`.

## Adding songs

`scripts/add-song.mjs` queries the iTunes Search API, downloads the 600px
artwork to `covers/<id>.jpg`, extracts a darkened dominant color for the
background, and inserts the entry into `data.js` in year order (newest
first).

```
node scripts/add-song.mjs "Artist" "Title" [--dry] [--country GB] [--pick N] [--force]
```

- `--dry` shows the candidate list and the computed color without writing.
- `--country` switches the store. Original studio recordings in the US store
  often only carry the album art, so two songs from one album collide on the
  same image; a artist's home store (e.g. `GB` for Ed Sheeran) often has the
  proper single art.
- `--pick N` selects from the candidate list, `--force` overwrites.

What the script cannot catch: remix and acoustic singles often have the
words printed on the artwork itself. Look at every cover once.

## Data

Everything lives in `data.js`. `ALBUMS` is the wall, newest → oldest.
`NOTES` holds optional liner notes keyed by song id; songs without notes
show a one-line placeholder instead. The script prints an empty NOTES
skeleton after each add.

## Rights

Code is MIT (see LICENSE). Cover images and preview audio come from the
iTunes Search API and belong to their owners. The liner-note texts in the
demo data are mine — replace them with yours.
