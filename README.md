# Kharidaar · खरीदार

**Every rupee has a story.** Kharidaar is a walkable bazaar built from a real price diary — 89 grocery notes, 53 things tracked, 6 places, from April 2025 to November 2026.

It is not a shop. There is no checkout, no delivery, no database. Just a spreadsheet someone kept honestly, turned into a small place you can walk through.

> Live site: **https://ajeet-iitk.github.io/kharidaar/**

---

## What's inside

- **A living bazaar** — a canvas bazaar that moves from dawn to noon to a lamp-lit night: coloured sky, drifting clouds, birds, stars, fireflies, lit stalls, shoppers with their own opinions. Drag the sun or let a whole day play in 30 seconds.
- **The price board** — every card is a real ledger line. Deltas compare like with like (per kg, per litre, per piece) even when the note was written for 250 g or a dozen. Sparklines, search, place/category filters, seven sort orders, and a progressive “show more stalls”.
- **The ledger** — the diary exactly as written: bundles, typos, “leads to loose motion” and all. Filter by place, turn a few more pages.
- **A basket that isn't commerce** — add things, change quantities, watch the basket's “inflation since first note”, then forge a receipt and download it as a `.txt`. It is a museum basket.
- **Price duel** — two random stalls enter, the fair-price lens decides. Normalised prices, not raw numbers.
- **Three tongues** — English, हिन्दी, and Hinglish (EH), switchable at any time and remembered.
- **Day / night themes** — a proper theme change, not an inverted filter: the scene itself glides to 08:40 or 21:20.
- **Bazaar radio** — procedural Web Audio music and sound effects. No audio files, no autoplay until you touch the page.
- **Sound effects everywhere** — cart clacks, tiny clicks, whooshes, gossip, a little melody.
- **Wonders of the bazaar** — the Explore section lists every experiment on the site, each with a live trigger.
- **Mobile first** — 390 px friendly, 2-column stalls, edge-to-edge chip rails, thumb-sized controls.
- **Accessible by default** — keyboard focus, dialog labels, skip link, reduced-motion support, ARIA on the interactive canvas.

## Things to try

| Do this | What happens |
| --- | --- |
| Drag the sun slider | The whole scene moves through the day |
| Tap a shopper | They say something about the prices |
| Tap a stall in the canvas | The price board filters to that category |
| Press `/` | Jump to the search box |
| Press `B` | Open or close the basket |
| Press `T` | Switch day / night |
| Press `M` | Toggle the bazaar radio |
| Press `Esc` | Close whatever is open |
| Add a few items | Checkout → forge a receipt → save it |

## The data

The source is a Google Sheet of everyday purchases:

**https://docs.google.com/spreadsheets/d/1hwVcnyeRMP8Zh_G32qj-9qftLvwJ8308KE55PD9148c/edit**

`scripts/build-data.mjs` reads the sheet, parses prices and units (`₹120/kg`, `Rs 50/250gm`, `₹70 for 5 pieces`, `₹25 dozen`, …), normalises every note to a comparable basis, and writes:

- `data/price-sheet.csv` — the flat export
- `js/data.js` — `window.KHARIDAAR_DATA` used by the site

Raw recorded prices stay the headline on each card. Normalisation is only used where a fair comparison needs it. Nothing is audited; places are where the note was written, not necessarily where the thing was made.

## Under the hood

- Static **HTML + CSS + vanilla JS**. No framework, no build step, no npm runtime.
- Canvas 2D for the bazaar; Web Audio for music and effects.
- `localStorage` remembers theme, language, sound preferences and your basket.
- `IntersectionObserver` for reveals, with a scroll fallback so nothing stays invisible.
- GitHub Pages ready: `.nojekyll` included, all paths relative.

```
index.html            page, icons, dialogs, basket
css/style.css         the whole visual system
js/i18n.js            English / हिन्दी / Hinglish dictionary
js/audio.js           procedural music and SFX
js/bazaar.js          canvas bazaar, sky, shoppers, stalls
js/app.js             price board, ledger, basket, receipt, duel, theme, shortcuts
js/data.js            generated price data
data/price-sheet.csv  flat export
scripts/build-data.mjs  sheet → data pipeline
scripts/serve.cjs     tiny local static server
favicon.svg           the bag
```

## Run it locally

```bash
node scripts/serve.cjs
# open http://localhost:4173
```

Rebuild the data after editing the sheet export:

```bash
node scripts/build-data.mjs
```

## Dev helpers

Handy query parameters (they do not affect normal visits):

- `?theme=dark` or `?theme=light`
- `?lang=en`, `?lang=hi`, `?lang=eh`
- `?time=21:30` — set the scene clock
- `?scroll=bazaar|ledger|explore|about` — land on a section

## Credits

Made by **Ajeet** with sunsets, sound, and a stubborn spreadsheet.
Fonts: Fraunces, Outfit, Noto Sans Devanagari (Google Fonts).
No cookies, no tracking, no commerce. © 2026 Ajeet.

## Notes
- "Enter the bazaar" opens the walkable 3D bazaar (three.js, loaded as a classic script so it also works from file://).
- Stall cards show real CSS-3D packs on a supermarket shelf that turn on hover.
- Added: toran bunting, springy/bouncy animation layer, bazaar crowd ambience (the mp3) plus footstep, bell and haggle sounds in the 3D world, mobile polish.
- 3D bazaar: in-world day/night toggle (animated sun/moon), sound panel, cows, dogs, pigeons, balloon seller, kids, rickshaw, and chatty shopkeepers (ask price, bargain, daily pick).
- Game section "Sabzi Ninja": swipe-to-slice with the diary's real edible items, patakha bombs, combos, best score saved locally.
- Thela Rush runner game (shopping list timer, cows, rickshaws, horn, chai boost); 3D-bazaar shopping missions with budgets and per-item haggling; photo mode with a framed, shareable snapshot.
