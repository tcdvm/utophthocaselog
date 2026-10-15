# Ophtho Case Log

A Chrome extension that lets veterinary students log the ophthalmology cases they
see during a clinical rotation, in a side panel beside ezyVet.

Open the panel next to a patient record, press **Import / Add case**, and the
patient's name and signalment are read from the record already on screen. Add the
chief area of interest, the type of visit, your level of involvement in any
procedure, and a short summary. A spider chart shows which of the seven areas you
have covered, so the gaps are visible while there is still time to fill them. One
button produces a PDF for your service chief.

## Privacy

The extension has **no network access of any kind**. No account, no server, no
analytics. Your case log is stored in your own browser on your own computer.

It reads five fields — patient name, species, breed, sex and age — from the
patient panel of the record you have open, and only at the moment you press the
button. There is no content script, so nothing runs on ezyVet pages otherwise. It
never reads client details, appointment schedules, medical record numbers or
clinical notes.

These are not promises in prose: `tests/privacy.test.mjs` enforces them on every
test run. See [the privacy policy](https://tcdvm.github.io/utophthocaselog/privacy.html).

## Installing from source

1. `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked**, and choose this folder

## Development

No build step, no dependencies, no framework. The folder *is* the program: change
a file and press reload in Chrome.

```
npm test                      # 55 checks across four suites
node tools/release-check.mjs  # manifest, icons, imports, dead files
./tools/package.sh            # builds dist/ophtho-case-log-<version>.zip
```

| File | Does |
|---|---|
| `manifest.json` | name, permissions, what opens where |
| `src/background.js` | makes the toolbar icon open the side panel |
| `src/panel/panel.html` | both screens, in one file |
| `src/panel/panel.js` | view switching and wiring |
| `src/panel/store.js` | saving and loading — the whole privacy surface |
| `src/panel/taxonomy.js` | the seven areas of interest, as plain data |
| `src/panel/extract.js` | the only code that touches an ezyVet page |
| `src/panel/radar.js` | the spider chart, hand-drawn SVG |
| `src/panel/pdf.js` | writes the PDF file by hand, no library |
| `src/panel/text.js` | name casing |
| `src/panel/achievements.js` | milestones |

To add an eighth area of interest, add one line to `src/panel/taxonomy.js`. The
chart, the form and the report all read from that list.

## How it was built

`docs/build-notes.md` narrates the whole build for a non-technical audience,
including the bugs and the decisions behind them.

Not affiliated with or endorsed by ezyVet.
