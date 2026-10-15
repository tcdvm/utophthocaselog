/* ===========================================================================
   ezyVet page inspector — run this ONCE in Chrome's DevTools console while a
   patient record is open. It does not change the page and does not save
   anything. It answers one question: "where on this page do the signalment
   fields live?"

   HOW TO USE
   1. Open the patient record in ezyVet.
   2. Press Cmd+Option+J to open the console.
   3. If Chrome warns about pasting, type:  allow pasting   then Enter.
   4. Edit the WANT list below to the values shown on THIS patient's page,
      exactly as they appear on screen.
   5. Paste the whole thing, press Enter, and copy the output.
   6. Read the output before sending it. Anything you would rather not share,
      delete — the useful part is the "path" lines, not the text.
   =========================================================================== */

(function () {
  // ---- EDIT THESE to match what is on screen for this patient -------------
  const WANT = {
    name:    'Taz',
    species: 'Canine',
    breed:   'MIXED BREED DOG',
    sex:     'FS',
    age:     '9 years 11 months 21 days',
  };
  // ------------------------------------------------------------------------

  // Builds a readable "address" for an element: tag, id, first few classes,
  // and any data- attributes, up through six levels of parents.
  const pathOf = (el) => {
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && parts.length < 6) {
      let s = n.tagName.toLowerCase();
      if (n.id) s += '#' + n.id;
      const cls = (n.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 3);
      if (cls.length) s += '.' + cls.join('.');
      const data = [...n.attributes]
        .filter((a) => a.name.startsWith('data-') || a.name === 'role')
        .map((a) => `[${a.name}="${a.value.slice(0, 24)}"]`)
        .join('');
      s += data;
      parts.unshift(s);
      n = n.parentElement;
    }
    return parts.join(' > ');
  };

  // Only look at "leaf" elements — the ones that actually hold text.
  const leaves = [...document.querySelectorAll('*')]
    .filter((e) => e.children.length === 0 && e.textContent.trim());

  const out = {
    host: location.host,
    pathPattern: location.pathname.replace(/\d+/g, 'N'),
    inIframe: window.top !== window.self,
    frameCount: window.frames.length,
    leafCount: leaves.length,
    found: {},
  };

  for (const [field, value] of Object.entries(WANT)) {
    if (!value) continue;
    out.found[field] = leaves
      .filter((e) => e.textContent.trim().includes(value))
      .slice(0, 4)
      .map((e) => ({
        path: pathOf(e),
        // the matched value is replaced with a placeholder before you ever see it
        text: e.textContent.trim().slice(0, 70).split(value).join(`«${field}»`),
        attrs: [...e.attributes].map((a) => a.name).join(','),
      }));
    if (!out.found[field].length) out.found[field] = 'NOT FOUND in this frame';
  }

  return JSON.stringify(out, null, 1);
})();
