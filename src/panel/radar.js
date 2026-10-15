// ---------------------------------------------------------------------------
// radar.js — the spider chart, drawn by hand as SVG.
//
// Why not a charting library? Chrome extensions are not allowed to pull code in
// from the internet at run time, so any library would have to be copied into
// this folder — hundreds of kilobytes of someone else's code to draw seven
// lines. This file is the whole chart, and it reads top to bottom.
//
// SVG is just shapes described in text: "draw a line from here to there".
// The only real work is trigonometry to place seven axes evenly around a circle.
// ---------------------------------------------------------------------------

// The drawing area needs room for the LABELS, not just the chart. A word like
// "Glaucoma" sits on the far left and extends further left still, so the circle
// is deliberately small inside a wide box. Getting this wrong is what clipped
// the first version's left-hand label.
const VIEW_W = 360;   // wide box...
const VIEW_H = 215;
const CX = 180;
const CY = 105;
const R = 76;         // ...small circle inside it
const LABEL_GAP = 15; // how far outside the outer ring the words sit

// Angle for axis i, starting at the top (-90 degrees) and going clockwise.
function pointAt(index, total, radius) {
  const angle = (-90 + (360 / total) * index) * (Math.PI / 180);
  return {
    x: CX + radius * Math.cos(angle),
    y: CY + radius * Math.sin(angle),
  };
}

function polygonPoints(total, radius) {
  return Array.from({ length: total }, (_, i) => {
    const p = pointAt(i, total, radius);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(' ');
}

/**
 * @param {SVGElement} svg   the <svg> element to draw into
 * @param {Array}      areas the CHIEF_AREAS list (order sets the axis order)
 * @param {Object}     counts  e.g. { cornea: 3, glaucoma: 1 }
 */
export function renderRadar(svg, areas, counts, { scaleCounts = counts, labelCounts = counts, emphasis = {} } = {}) {
  const n = areas.length;
  const values = areas.map((a) => counts[a.id] || 0);

  // The scale and the labels can be driven by a DIFFERENT set of numbers than
  // the shape. During an animation the shape holds fractional in-between values
  // while the rings and the printed counts stay fixed at their final figures —
  // otherwise the grid would rescale and the numbers would tick through
  // fractions on every frame.
  const scaleValues = areas.map((a) => scaleCounts[a.id] || 0);

  // Always show at least 3 rings so an empty chart still looks like a chart,
  // and never more than 5 so it stays readable in a narrow panel.
  const scaleMax = Math.max(3, ...scaleValues);
  const ringCount = Math.min(Math.ceil(scaleMax), 5);

  const parts = [];

  // Grid rings, faintest first.
  for (let ring = 1; ring <= ringCount; ring++) {
    const radius = (R * ring) / ringCount;
    parts.push(
      `<polygon points="${polygonPoints(n, radius)}" class="radar-ring" />`
    );
  }

  // Spokes out to each axis.
  for (let i = 0; i < n; i++) {
    const p = pointAt(i, n, R);
    parts.push(
      `<line x1="${CX}" y1="${CY}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" class="radar-spoke" />`
    );
  }

  // The data shape itself.
  // Clamped slightly beyond the outer ring: the growth animation overshoots on
  // purpose, and a little poke past the grid reads as spring rather than error.
  const radiusFor = (v) => Math.min((R * v) / scaleMax, R * 1.06);

  const dataPoints = values
    .map((v, i) => {
      const p = pointAt(i, n, radiusFor(v));
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');
  parts.push(`<polygon points="${dataPoints}" class="radar-shape" />`);

  // A dot on each axis that has at least one case, so a single case is visible
  // (a polygon with one non-zero point is a hairline and reads as nothing).
  values.forEach((v, i) => {
    if (v <= 0) return;
    const p = pointAt(i, n, radiusFor(v));
    // An axis that just changed gets an expanding halo behind its dot. On a
    // chart with a dozen cases, one more case moves the outline only a few
    // pixels — the halo is what makes it unmissable.
    const strength = emphasis[areas[i].id] || 0;
    if (strength > 0) {
      parts.push(
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(4 + 11 * strength).toFixed(1)}" ` +
        `class="radar-halo" opacity="${(0.4 * strength).toFixed(2)}" />`
      );
    }
    parts.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" class="radar-dot" />`);
  });

  // Axis labels, nudged outside the outer ring.
  areas.forEach((area, i) => {
    const p = pointAt(i, n, R + LABEL_GAP);
    const dx = p.x - CX;
    const anchor = Math.abs(dx) < 12 ? 'middle' : dx > 0 ? 'start' : 'end';
    const count = labelCounts[area.id] || 0;
    const isNew = (emphasis[area.id] || 0) > 0.15;
    parts.push(
      `<text x="${p.x.toFixed(1)}" y="${(p.y + 4).toFixed(1)}" text-anchor="${anchor}" class="radar-label${isNew ? ' is-new' : ''}">${area.short}${count ? ` <tspan class="radar-count">${count}</tspan>` : ''}</text>`
    );
  });

  svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
  svg.innerHTML = parts.join('\n');
}

/**
 * Grows the chart from one set of counts to another.
 *
 * Why animate at all: a student presses Save and the panel returns to a
 * dashboard that looks almost identical to the one they left. Watching the
 * shape reach out along one axis is what tells them the case landed, and which
 * axis it landed on.
 *
 * The rings and the printed numbers are held at their final values throughout,
 * so only the coloured shape moves.
 *
 * @param {SVGElement} svg
 * @param {Array}  areas
 * @param {Object} fromCounts  the shape before the change
 * @param {Object} toCounts    the shape after it
 */
export function animateRadar(svg, areas, fromCounts, toCounts, { duration = 900, hold = 1100 } = {}) {
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const changed = areas.filter((a) => (fromCounts[a.id] || 0) !== (toCounts[a.id] || 0)).map((a) => a.id);

  if (reduceMotion || !changed.length || duration <= 0) {
    // Still mark what changed, just without motion: a static halo that is
    // cleared after the hold.
    const flat = {};
    for (const id of changed) flat[id] = 1;
    renderRadar(svg, areas, toCounts, { emphasis: flat });
    if (changed.length) setTimeout(() => renderRadar(svg, areas, toCounts), hold + duration);
    return;
  }

  // Ease out with a small overshoot, so the shape springs into place instead of
  // sliding. A one-case change is only a few pixels of travel; the spring is
  // what makes those few pixels register.
  const c1 = 1.2, c3 = c1 + 1;
  const easeOutBack = (t) => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);

  const started = performance.now();
  const total = duration + hold;

  const frame = (now) => {
    const elapsed = now - started;
    const t = Math.min(1, elapsed / duration);
    const k = easeOutBack(t);

    const blended = {};
    for (const area of areas) {
      const from = fromCounts[area.id] || 0;
      const to = toCounts[area.id] || 0;
      blended[area.id] = from + (to - from) * k;
    }

    // The halo swells over the first third of the growth, holds, then fades
    // across the tail — bright while the eye is arriving, gone before it nags.
    const fadeStart = duration * 0.55;
    const strength = elapsed <= fadeStart
      ? Math.min(1, elapsed / (duration * 0.3))
      : Math.max(0, 1 - (elapsed - fadeStart) / (total - fadeStart));

    const emphasis = {};
    for (const id of changed) emphasis[id] = strength;

    renderRadar(svg, areas, blended, { scaleCounts: toCounts, labelCounts: toCounts, emphasis });

    if (elapsed < total) requestAnimationFrame(frame);
    else renderRadar(svg, areas, toCounts);
  };

  requestAnimationFrame(frame);
}
