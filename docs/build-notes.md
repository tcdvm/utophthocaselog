# Build notes — running log for the walkthrough

Raw material for the final guide. Written as we go so the reasoning is captured
while it is fresh, not reconstructed afterwards.

---

## Step 0 — The conversation before the code

The build started from a plain-English description: what the tool is for, who
uses it, what a case record contains, and what must never be collected. No file
names, no libraries, no framework. Four decisions were settled before a line was
written, because each one changes the code:

| Decision | Chosen | Why it mattered |
|---|---|---|
| How patients are identified | Patient name only, no record number | Sets the privacy ceiling of the whole tool |
| What we inspect in ezyVet | A real patient record | Changes how screenshots get redacted |
| Quizzes | Deferred to v2 | Keeps v1 shippable; the hook stays in the code |
| Export format | PDF report | Removes the need for a CSV path and a PDF library |

**Teaching point:** the planning conversation is the specification. Everything
downstream is a consequence of these four answers.

## Step 1 — The skeleton

Choices made and the reasoning behind them:

- **No build step, no npm, no framework.** The folder *is* the program. Change a
  file, press reload in Chrome, see the change. Most tutorials lose non-coders at
  the toolchain; there is no toolchain here.
- **No charting library.** Chrome extensions cannot fetch code from the internet
  at run time, so a library would have to be copied into the folder — hundreds of
  kilobytes of someone else's code to draw seven lines. `radar.js` is the entire
  chart, about 90 lines, and it reads top to bottom.
- **The vocabulary lives in one plain-data file.** `taxonomy.js` holds the seven
  areas of interest. Adding an eighth later is one line; the chart, the form and
  the report all read from that list.
- **All storage goes through one file.** Every read and write passes through
  `store.js`, so the question "what does this thing actually keep?" has exactly
  one place to look. The answer is the field list in `makeCase()`.

### Files after step 1

    manifest.json          the extension's ID card: name, permissions, what opens where
    src/background.js      four lines: make the toolbar icon open the side panel
    src/panel/panel.html   both screens (dashboard + case form) in one file
    src/panel/panel.css    styling, including dark mode
    src/panel/panel.js     view switching and wiring
    src/panel/store.js     save/load — the entire privacy surface
    src/panel/taxonomy.js  the seven areas, visit types, involvement levels
    src/panel/radar.js     the spider chart as hand-written SVG
    src/panel/achievements.js  goals that reward breadth, not just volume
    icons/                 generated eye icon at four sizes

### Permissions, and why each one is there

    "sidePanel"   open a panel beside the page
    "storage"     save the log locally
    "scripting"   read the patient header — only when Import case is pressed
    host_permissions: https://*.ezyvet.com/*   nothing outside ezyVet is reachable

There is deliberately **no** `content_scripts` entry. That is the difference
between "this extension runs on every ezyVet page forever" and "this extension
touches the page for a few milliseconds when the student presses a button."

## Step 2 — First screenshots, and a bug found by arithmetic

The panel loaded first try; the radar, counters, case list and achievements all
rendered. One real defect: the word "Glaucoma" was clipped off the left edge of
the chart.

The cause is a nice illustration of a whole category of layout bug. The drawing
area had been sized to fit the *chart*, but the thing that sticks out furthest is
the *label* — "Glaucoma 1" extends leftward from a point already near the edge.
The fix was a small circle inside a wide box (radius 76 in a 360-wide frame)
rather than a big circle in a tight one.

**Teaching point:** the fix was verified by *calculating* where every label would
land, not by looking at it. Trigonometry says the leftmost pixel of text now sits
34px inside the frame, with room to spare for two-digit counts. Checking by eye
would have confirmed only that it looks fine at today's numbers.

## Step 3 — Inspecting ezyVet without reading the record

We needed the page's structure, not its contents, so the tool was built to return
structure only: a script that reports element paths with the actual values
replaced by placeholders like `«name»`.

### What it found

- Host `utcvm.use1.ezyvet.com` — already covered by the permission we requested
- The path is always `/`. ezyVet is a single-page app, so **the URL can never
  tell us which patient is open.** Detection has to come from the page itself
- The open record's tab is `div#rtab7`; its patient sidebar is
  `div#patientSideBar7`. **The shared number links them** — that is the anchor
- The sidebar's first span holds name and sex together: `«name» (FS)`

### Two over-capture risks, found before writing the extractor

1. **The record tab label reads `1204311 - "«name»" KUPRITZ (09-09-2026)`.** The
   trailing surname is the *owner*. It is the most convenient-looking place to
   read a patient name from, and using it would pull client identity into every
   student's laptop. We do not touch it.
2. **The appointment calendar is in the same page.** Every `div.appt` carries
   `data-contact`, `data-animal` and `data-consult` IDs for every patient on the
   schedule that day. An extractor written as "grab what's on the page" would
   harvest the entire day's caseload from one button press.

**Teaching point:** neither risk is a bug — nothing was broken. They are things
you only see if you look at the page before writing the code that reads it. This
is the entire argument for reading five named fields from one known element
instead of scraping.

## Step 4 — The extractor, and a bug caught before it met a patient

`src/panel/extract.js` is the only code that ever touches an ezyVet page. Three
rules govern it:

1. It runs **only** when the student presses Import case. There is no
   `content_scripts` entry in the manifest, so nothing runs on its own.
2. It reads **one element** — the patient sidebar of the open record. The day's
   whole appointment grid sits in the same page; scoping to one element keeps it
   out of reach.
3. It returns a **fixed list of five fields**. It is not a "read the page"
   function that we then filter down; it cannot return anything else.

Finding the right sidebar uses the link discovered during inspection: the
focused tab `#rtab7` points at `#patientSideBar7`. If that fails it falls back to
whichever patient sidebar is visible. If *that* fails, the form opens blank and
the student types — no failure path blocks the work.

### Why there are nine tests

The parser was tested against nine plausible sidebar layouts — abbreviated ages,
an en dash instead of a hyphen, a missing breed, a two-word patient name,
everything crammed onto one line — before it was pointed at a real record.

The first run failed all nine. The cause: the code tidied up whitespace *before*
splitting the text into lines, and tidying collapses newlines, so the entire
sidebar fused into one string. Reversing two steps fixed it.

**Teaching point, and it is the important one in this whole document:** that bug
would have been invisible on a live patient. The extractor would have returned a
name and quietly missed the species, and it would have looked like ezyVet simply
not showing what we expected. Testing against made-up patients found in seconds
what testing against real ones would have hidden.

The tests also assert something a human reviewer would struggle to check by eye:
that the diagnostic output contains no characters other than `x`, `X`, `9` and
punctuation — i.e. that the "send this to your maintainer" report cannot carry
patient data even if someone changes the code later.

### `package.json`

The project has one, and it does nothing you would expect. It exists so `node`
will run the test files. There is no build step and no dependencies; Chrome
ignores the file entirely.

## Step 5 — Privacy review

Run against the finished code, not against intentions. Each claim below is a
check anyone can repeat with a search across the project.

### What was verified

| Claim | How it was checked | Result |
|---|---|---|
| The extension cannot send data anywhere | searched for `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `new Image`, `eval`, dynamic `import` | none present |
| It loads nothing from the internet | searched every URL in the source | only the SVG namespace string, which is not a network address |
| It does not run on pages by itself | checked the manifest for `content_scripts` and `<all_urls>` | neither present |
| It can only reach ezyVet | `host_permissions` | `https://*.ezyvet.com/*` only |
| Storage holds only agreed fields | read the single function that builds a record | 14 fields, listed below |
| Patient data never reaches the console | searched for `console.` | one line, in `background.js`, which logs a Chrome API error and no case data |
| Page text is never treated as markup | searched for `innerHTML` | all uses either clear an element or compose from developer-authored constants; every value from the page or the student goes through `textContent` |
| The diagnostic report cannot carry patient data | automated test asserts the output contains only `x`, `X`, `9` and punctuation | passing |

The entire storage surface is one function, `makeCase()`: id, createdAt,
dateSeen, patientName, species, breed, sex, age, visitType, procedure,
chiefArea, secondaryAreas, summary, source. Nothing else can be written, because
nothing else is copied in.

### Residual risks — real, and not fixable in code

1. **The free-text summary is the biggest remaining leak vector, and it is
   human.** Nothing stops a student typing an owner's name or a record number
   into it, and that text is printed in the report that gets emailed. *Mitigation
   added:* a line under the field saying the text will be printed and to keep it
   clinical. That is a nudge, not a guarantee.
2. **The PDF is the one artifact that leaves the machine**, and it contains
   patient names, signalment and summaries by design. That flow is intentional —
   the service chief needs to know what the student saw — but it is worth naming
   plainly rather than leaving implicit.
3. **`chrome.storage.local` is not encrypted.** Anyone using that Chrome profile
   on that laptop can read the log. On a shared hospital machine, students should
   use their own Chrome profile.
4. **Scope grew slightly from the original brief.** The stated need was "name and
   species"; the form also holds breed, sex and age, because the case record
   asked for signalment. This was a deliberate widening, agreed during planning,
   and is recorded here so it is not mistaken for drift.

### The design decision that did the most work

Not scoping the extractor to five fields — though that helped. It was choosing
**on-demand injection over an always-on content script.** An always-on script
would have been the conventional choice and would have worked identically from
the student's side. It would also have meant code running on every ezyVet page
all day, in reach of the appointment grid and every record the student opens.
The button-press model means the extension is inert until asked.

## Step 6 — Two changes after first use

### "Orbit" became "Orbit / Globe"

One line in `taxonomy.js`. The stored `id` stayed `orbit`, which matters: cases
already logged reference that id, and changing it would orphan them. Labels are
free to change; identifiers are not. The radar geometry was re-checked
arithmetically for the longer label — it sits at the top of the chart where
there is the most room, and still fits with two-digit counts.

### One-click PDF, which meant writing the PDF format by hand

The print-to-PDF approach worked but cost four clicks and a file picker. Chrome's
print dialog is a security boundary an extension cannot skip, so a true one-click
download left three options:

| Option | Cost |
|---|---|
| `debugger` permission | shows students "Ophtho Case Log is debugging this browser" |
| Vendor a PDF library | ~350 KB of third-party code, maintained forever |
| Write the PDF ourselves | ~430 lines, no dependencies |

The third was chosen. A PDF is a text format: a header, numbered objects, and a
cross-reference table of byte offsets. Pages are drawn with a small vocabulary
(`m` move, `l` line, `re` rectangle, `f` fill, `BT`/`Tj`/`ET` for text). The
implementation lives in `src/panel/pdf.js` and includes the Helvetica width table
needed to wrap text without either clipping or leaving slack.

`src/report/` was deleted — it was the printable page, now dead code.

### How it was verified

`node tests/pdf.test.mjs` runs ten structural checks, the important one being
that every entry in the cross-reference table lands exactly on the object it
points at. A wrong offset there produces a file that opens as an error message.

Then the PDF was rendered and looked at. That is how two defects appeared that no
structural test would catch: a word broken as "Neuro-ophthalmolo / gy", and an
age's stray "y" stranded on its own line. Fixed by rebalancing column widths and
teaching the wrapper to break after hyphens and slashes.

**Teaching point:** tests prove a file is valid. Only looking proves it is
readable. Both passes were needed, and neither would have found the other's bugs.

A sample is kept at `docs/sample-report.pdf`.

### Live extraction confirmed

Verified against a real patient record: pressing Import case fills the form with
name, sex, species, breed and age from the open consult's patient sidebar. The
selectors derived from the masked inspection held on the first attempt — no
tuning round was needed.

Worth noting what that means: the parser was written entirely from shapes
(`Xxxxxx (XX)`, `Xxxxxx (Xxx) - Xxxxxxx`) and nine invented patients, and worked
first time on live data. Not seeing the real values cost nothing.

## Step 7 — The achievement system

Four changes, and one design tension worth recording.

### Quizzes live in files, not in code

`quizzes/core-bank.json` holds 35 draft questions, five per area, each with an
explanation. Adding a question means editing a text file. The format uses
**1-based answers** — `"answer": 2` means the second choice — because the people
writing these are clinicians, not programmers, and "the second one" means 2.

`quizzes/README.md` documents the format for someone who has never opened a code
editor.

### An imported pack is untrusted input

Students can import a `.json` pack from disk. That file was handed to them by
someone, and it is treated exactly the way ezyVet page text is treated: validated
field by field, copied into a **fresh object** containing only known keys, and
rendered with `textContent`. A pack can add questions. It cannot add behaviour.

Sixteen tests cover the rejection paths, including one asserting that a pack
carrying `"onclick"` and `"script"` fields loses them at the door.

### The tension: "updated automatically"

The request was for packs that load from an external file "so the extension can
be updated automatically when new quizzes are created." Two of the three senses
of that are now true — a replaced bundled file updates everyone who reloads, and
an imported pack replaces its earlier version by `packId`. The third sense,
fetching new questions over the internet, was **not** built, because it would
end the property this project has held since the first commit: that the
extension contains no way to reach the network.

That is a decision for the person who owns the risk, not for the person writing
the code. It is recorded here as an open choice rather than quietly resolved.

### The first fetch, and the invariant that guards it

Loading the bundled pack introduced the project's first `fetch()`. It reads a
`chrome-extension://` address and cannot reach the internet — but a future reader
grepping for `fetch(` deserves better than a comment saying so.

`tests/quiz.test.mjs` now scans every source file and asserts that **every**
`fetch` in the project is immediately handed `chrome.runtime.getURL(...)`, and
that no other connection API appears anywhere.

**Teaching point:** the privacy review in step 5 was a snapshot — true on the day
it ran. This turns one of its claims into something that is re-checked on every
test run. A property worth auditing once is usually worth enforcing.

### The unlock moment

A badge quietly turning gold is not a reward. Earning one now stops the panel and
shows the badge, what it took, and what is closest next. Several earned at once
queue up rather than collide.

### In the report

One short block: milestones earned, and which area quizzes were passed. Milestones
mostly reflect what walked through the door; the quiz line reflects the student,
which is why it is named explicitly rather than folded into a single number.

## Step 8 — Cutting the quiz system back out

After seeing the quiz layer working, the call was to remove it: "we're building a
little beyond what I imagined would be the first version." Quizzes and per-area
mastery came out; the badges stayed.

### What was removed

`src/panel/quiz.js`, the `quizzes/` folder and its 35-question bank, the quiz
view and the pack-import control, the seven mastery badges, the quiz fields in
storage, and the quiz line in the PDF.

### What was kept, and why

- **The badges**, with the progress counters (`3/5`) added alongside the quizzes.
- **The unlock panel.** It was built for the quiz work but belongs to the badges,
  and it is what makes earning one register at all.
- **The no-network test.** Loading the question bank had introduced the project's
  first `fetch`, and with it a test asserting that every `fetch` read a file
  inside the extension. The `fetch` is gone — but the test was the better half of
  that change, so it was kept and widened into `tests/privacy.test.mjs`.

### The rollback improved the privacy story

Removing a feature left its data behind: `quizPacks` and `quizResults` would have
sat in storage indefinitely, because the loader merged whatever it found with the
current shape. It now keeps **only known keys**, so a removed feature's data is
dropped on the next load. That is a better rule than the one it replaced, and it
was only noticed because something was taken away.

`tests/privacy.test.mjs` now re-checks, on every run, what the step 5 review
checked once by hand:

| Claim | Now enforced by |
|---|---|
| Cannot reach the network | no connection API, and no web address, in any source file |
| No code built from strings | no `eval`, no `new Function` |
| Asks for the least it can | permissions must be exactly `sidePanel`, `storage`, `scripting` |
| Only ezyVet is reachable | `host_permissions` must be exactly the ezyVet pattern |
| Storage holds only agreed fields | a saved case's field list is compared against a written-down list |
| Never reads the owner surname | the extractor must not reference the record tab label |
| Never reads the day's schedule | the extractor must not reference `.appt`, `data-animal` or `data-contact` |

**Teaching point:** the last two are the interesting ones. They do not test that
the code works — they test that it still refuses to do something. A test can
hold a decision in place long after everyone has forgotten why it was made.

## Step 9 — Who the log belongs to

School, graduating term and graduating year now sit under the student's name, and
appear on the report header:

    A. Student   ·   St. George's University   ·   Graduating Spring 2027
    09/02/2026 to 09/08/2026   ·   31 cases

Two small decisions inside a small feature:

**The year list is generated, not written down.** The request named 2026 and 2027.
Hard-coding those would have been correct today and wrong in fourteen months,
silently, with no error — just a student unable to pick their own year. The list
runs from the current year to five years out, so it stays right without anyone
remembering to edit it. A year already saved but no longer in the range is added
back to the list rather than being replaced with a blank.

**The schools live in `taxonomy.js`**, next to the seven areas of interest, with
both a short label for the panel and a full name for the report. Adding a fourth
school is one line, which is the same promise the areas of interest make.

**Teaching point:** "2026/2027" was a perfectly clear instruction, and following
it literally would have built a bug with a delayed fuse. Most requests contain an
example where a rule was meant; noticing which is which is a large part of the
work.

### Correction: a placeholder is not a label

The first version put three dropdowns in a row reading *School · Term · Year*.
Once a student chose a term, the control simply read "Fall" — and in a rotation
log, "Fall 2027" reads just as naturally as the term of the rotation itself. The
meaning was carried entirely by placeholder text that vanished on first use.

Now the school sits on its own line and the pair sits behind a standing label:

    [ SGU ▾ ]
    GRADUATING  [ Fall ▾ ]  [ 2027 ▾ ]

**Teaching point:** a placeholder is a hint for an empty field, not a label for a
full one. Any control whose meaning is not obvious from its own value needs
something that stays on screen after it has been filled in.

## Step 10 — Landscape, and renaming ids while it is still free

### The ids were renamed

`quarter` (a 15-case goal), `halfway`, `surgeon` and the rest became `cases-15`,
`areas-4`, `procedures-3` and so on. Two steps ago the advice here was that ids
must never change because they are written into saved data — and that is still
true. It is simply not true *yet*: nobody has used the extension, so there is no
saved data to orphan.

**Teaching point:** "never rename an identifier" is really "never rename an
identifier once something depends on it." The window before the first real user
is the one moment that rule is free to break, and it closes permanently. Worth
spending.

### The report turned landscape

Seven columns of clinical text need width far more than height. The page is now
792 × 612 rather than 612 × 792, and the extra 180 points went mostly to the
summary column, which is the one that holds actual sentences: 102 points wide
before, 210 now.

It is not a matter of swapping two numbers. Portrait stacked the chart, the
counters and the area breakdown vertically; landscape sets them side by side,
which buys back the vertical room the taller header would otherwise have cost.
Pages now hold 17 case rows instead of 14, with most summaries on a single line.

### The stray "y"

An age of "9 y" kept splitting across lines, stranding the unit — the same defect
found in the portrait layout, reappearing at a different column width because the
fix then was to widen the column rather than to stop the split.

The real fix: the age now travels as a single word, joined by a no-break space,
and the wrapper was taught to split on ordinary whitespace only. Widening a column
hides this bug; gluing the word removes it.

## Step 11 — Names in whatever case the record held them

ezyVet entries are typed by many people over many years, so the same field turns
up as FLUFFY, fluffy and Fluffy. A case list then shows what look like three
different patients, and a printed table looks like a data-entry error.

Patient name and breed are now normalised to Title Case — at extraction, so the
student sees what will be stored, and again on save, so typed input is tidied
whatever its source.

### The request contained a contradiction

"Add some text transformation to all caps" and "those should be properly
capitalized" point in different directions: ALL CAPS handles multi-word names
trivially, so the second sentence only makes sense if Title Case was meant. That
was worth thirty seconds of asking rather than a guess applied to every stored
name.

**Teaching point:** most requests are clear. The ones worth stopping on are the
ones that contradict themselves — that is usually a sign the person is
describing an outcome rather than a mechanism, and the outcome is the thing to
ask about.

### Casing has more edge cases than it looks like it does

`src/panel/text.js` is twelve lines of logic and twenty-two tests, because:

| Input | Output | Why it is not obvious |
|---|---|---|
| `o'malley` | `O'Malley` | an apostrophe can start a syllable |
| `buddy's girl` | `Buddy's Girl` | ...but a possessive must not gain a capital |
| `poodle (standard)` | `Poodle (Standard)` | brackets start a word too |
| `COCKER–SPANIEL` | `Cocker–Spaniel` | an en dash is not a hyphen |

Three limitations are **asserted in the tests rather than fixed**: `mcdonald`
becomes `Mcdonald`, `JD` becomes `Jd`, and `van Gogh` becomes `Van Gogh`.
Capitalising after "Mc" would break Macy, Mack and Machado; detecting initials
would misfire on short names. Every field stays editable, so a student can
correct these in a second.

**Teaching point:** a test that pins down a *limitation* is doing real work. It
says "this behaviour is known and chosen", so the next person to look either
leaves it alone or changes it deliberately — instead of discovering it as a bug
and guessing at a fix.

### One thing not done

Cases already saved keep their original casing until they are next edited. A
migration could rewrite them on load, but silently rewriting a user's stored data
is a habit worth not starting.

## Step 12 — Trimming the panel, and two pieces of feedback

### Removed

- **Load sample cases** and its eight invented patients. It existed so the layout
  could be judged before real cases existed, and that job is done. Scaffolding
  that outlives its purpose becomes a button a student presses by accident.
- **The privacy paragraph** at the foot of the panel. The claim is still true and
  still enforced by `tests/privacy.test.mjs`; it does not need restating to the
  student on every visit.
- **Copy layout report**, and the masking machinery behind it in `extract.js`.
  The capability is not lost: `docs/inspect-snippet.js` still produces the same
  masked structural report if extraction ever breaks on a changed ezyVet page.
  It belongs in the maintainer's hands, not in a student's form.

### Renamed

"Primary operator" became **Primary surgeon**, with a scissors icon. Labels are
free to change; the id `procedure-performed` stays as it is.

### Two pieces of feedback after a save

A student pressed Save and landed back on a dashboard that looked almost
identical to the one they had left. Two small signals now say the case landed:

1. **The chart grows into its new shape** over about two thirds of a second,
   easing out. The rings and the printed counts are held at their *final* values
   for the whole animation — only the coloured shape moves. Without that, the
   grid would rescale and the numbers would tick through fractions on every
   frame, which reads as a glitch rather than as growth.
2. **The new row flashes once** in the case list and fades over two seconds, so
   the student can see where it landed without scanning for it.

Both respect `prefers-reduced-motion`: with motion reduced, the chart redraws
instantly and the row highlight appears and clears without animating. And a save
that changes no counts — editing a summary, say — skips the animation entirely
rather than playing a half-second of nothing moving.

**Teaching point:** the animation is not decoration. It answers a question the
student would otherwise have to answer by reading: *did that work, and where did
it go?* Motion is good at that specific job and bad at most others.
