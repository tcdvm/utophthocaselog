# Submitting to the Chrome Web Store

Everything the submission form will ask for, with draft answers. Build the
upload with `./tools/package.sh` — it runs the release checks first and refuses
to package if any fail.

---

## 1. Before you upload

- **Developer account** — a one-time $5 registration fee at
  <https://chrome.google.com/webstore/devconsole>. Use an account you will still
  control in five years; transferring a published item later is awkward.
- **The zip** — `dist/ophtho-case-log-1.0.0.zip`. It contains only `manifest.json`,
  `icons/` and `src/`. Tests, build notes and sample reports are excluded: anyone
  can download and unpack a published extension, so a package should contain
  nothing you would not hand over.

---

## 2. Store listing

**Name** — Ophtho Case Log

**Short description** (132 characters max; the one that appears in search)

> Log the ophthalmology cases you see on rotation, right beside ezyVet. Your
> case log stays on your own computer.

**Category** — Education (not Productivity: the audience is students and the
purpose is teaching)

**Detailed description**

> A case log for veterinary students on an ophthalmology rotation.
>
> Open the panel beside a patient record in ezyVet and press Import / Add case.
> The patient's name and signalment are read from the record you already have
> open, so you are not retyping what is on the screen in front of you. You add
> the chief area of interest, whether it was a new consult, a recheck or a
> procedure, your level of involvement, and a short summary.
>
> The panel shows a spider chart of the areas you have covered — orbit and globe,
> adnexa, cornea, KCS, uvea, glaucoma, retina and neuro-ophthalmology — so the
> gaps in your rotation are visible while there is still time to fill them.
> Counters track new consults, rechecks and procedures, and a set of milestones
> rewards breadth rather than volume.
>
> At the end of the rotation, one button produces a PDF for your service chief:
> the chart, the counts and every case in a table.
>
> WHAT THIS EXTENSION DOES NOT DO
>
> It has no network access of any kind. There is no account, no server, and no
> analytics. Your case log is stored in your own browser on your own computer and
> is never transmitted anywhere. The extension reads five fields — patient name,
> species, breed, sex and age — from the patient panel of the record you have
> open, and only at the moment you press the button. It does not run on ezyVet
> pages otherwise, and it never reads client details, appointment schedules,
> medical record numbers or clinical notes.
>
> Not affiliated with or endorsed by ezyVet.

---

## 3. Permission justifications

The console asks for a written justification per permission. Reviewers read
these; vague answers cause rejections.

| Permission | Justification |
|---|---|
| `sidePanel` | The entire user interface is a side panel shown next to the ezyVet tab, so the student can see the patient record and their case log at the same time. |
| `storage` | The case log is saved with `chrome.storage.local` so it survives closing the browser. Nothing is written anywhere else and nothing is synced. |
| `scripting` | When the student presses "Import / Add case", a single function is injected into the active ezyVet tab to read the patient's name and signalment from the open record's patient panel, and returns five named fields. It runs once per button press. |
| `https://*.ezyvet.com/*` | ezyVet is the veterinary medical record the extension reads the patient's signalment from. This is the only host the extension can access. |

**Single purpose statement**

> Recording the ophthalmology cases a veterinary student sees during a clinical
> rotation, and producing a summary of that log for their supervisor.

---

## 4. Privacy practices

Declare these in the Privacy tab. They must match what the code does — and here
they do, which `tests/privacy.test.mjs` checks on every run.

- **Does it collect personally identifiable information?** No — nothing is
  transmitted. The log is stored locally and never leaves the device.
- **Health information?** The log holds animal patient names and signalment
  only, stored locally. No human health data, no client details.
- **Remote code?** No. All code is in the package; nothing is fetched at runtime.
- **Certify:** data is not sold, not used for anything unrelated to the single
  purpose, and not used to determine creditworthiness.

**A privacy policy URL is required** whenever an extension handles user data,
and you will need to host one. A draft is in `docs/privacy-policy.md`.

---

## 5. Screenshots

Required: at least one, either **1280×800** or **640×400** PNG. The side panel is
roughly 370px wide, so a raw panel screenshot is the wrong shape — compose the
panel against a window showing ezyVet, or on a plain background, to fill the
frame.

Take these fresh from the current build. Suggested set:

1. The panel beside an ezyVet patient record, mid-rotation, with a filled chart
2. The Import / Add case form with signalment auto-filled
3. The exported PDF report

**Redact before uploading.** These screenshots are public forever. Use a test
patient, or blur every client-identifiable field in the ezyVet window behind the
panel — including the record tab label, which carries the owner's surname.

---

## 6. Review

First review typically takes a few days and can take longer for an extension
that reads a third-party medical site. Expect questions about the host
permission; the justification above is what answers them.

After publishing, updates are uploaded as a new zip with a higher `version` in
`manifest.json`. Students get them automatically.
