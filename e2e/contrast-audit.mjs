// Runtime WCAG contrast audit against the live app across every theme combo.
//
// `pnpm check:contrast` checks token pairs statically from source. This checks
// the colors the browser actually resolved and painted, so it also catches a
// token wired to the wrong variable, or a translucent overlay that erodes a
// pair which passes on paper.
//
// Usage: start the app with remote debugging (see cdp.mjs), then:
//   node e2e/contrast-audit.mjs

import { connect } from './cdp.mjs';

const { session: s } = await connect();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The window is transparent, so `body` has no background of its own. Walking
// ancestors for "the first opaque background" therefore falls off the top and
// lands on black, which fabricates failures for every muted foreground. The
// real opaque base is the app shell's --background token, so probe that and
// composite each translucent layer over it bottom-up.
const helpers = `
  function lum(rgb) {
    const [r,g,b] = rgb.map(v => {
      const c = v / 255;
      return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
    });
    return 0.2126*r + 0.7152*g + 0.0722*b;
  }
  // Resolve any CSS color to sRGB 0-255 + alpha. Tailwind 4 emits oklab() for
  // colors carrying alpha, and Chromium's computed style PRESERVES that color
  // space rather than serializing to rgb() -- so an rgb()-only regex drops most
  // of the real text and the audit "passes" by sampling nothing. Rasterizing to
  // a canvas is the one path that always yields sRGB bytes.
  const _ctx = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    return c.getContext('2d', { willReadFrequently: true });
  })();
  function parse(str) {
    if (!str) return null;
    const trimmed = String(str).trim();
    if (!trimmed || trimmed === 'transparent') return { rgb: [0, 0, 0], a: 0 };
    // Canvas ignores an invalid fillStyle and keeps the previous one, so set a
    // sentinel first and treat "unchanged" as unparseable.
    _ctx.fillStyle = '#000000';
    _ctx.fillStyle = trimmed;
    if (_ctx.fillStyle === '#000000' && !/^(#0{3,8}|black|rgba?\\(\\s*0[\\s,]+0[\\s,]+0)/i.test(trimmed)) {
      return null;
    }
    _ctx.clearRect(0, 0, 1, 1);
    _ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a255] = _ctx.getImageData(0, 0, 1, 1).data;
    const a = a255 / 255;
    // clearRect + fillRect composites onto transparent black, so the stored
    // bytes are premultiplied; undo that to recover the source color.
    if (a === 0) return { rgb: [0, 0, 0], a: 0 };
    return { rgb: [r / a, g / a, b / a].map((v) => Math.min(255, v)), a };
  }
  function over(fg, bg) {
    return fg.rgb.map((c, i) => c * fg.a + bg[i] * (1 - fg.a));
  }
  function contrast(fg, bg) {
    const l1 = lum(fg), l2 = lum(bg);
    const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
  }
  function baseColor() {
    const probe = document.createElement('div');
    probe.style.background = 'var(--background)';
    document.documentElement.appendChild(probe);
    const c = parse(getComputedStyle(probe).backgroundColor);
    probe.remove();
    return c ? c.rgb : [255,255,255];
  }
  function effectiveBg(el) {
    const layers = [];
    let node = el;
    while (node && node !== document.documentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 0.999) break;
      }
      node = node.parentElement;
    }
    let acc = baseColor();
    for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
    return acc;
  }
`;

const families = ['brick', 'ember', 'graphite', 'rose'];
const modes = ['light', 'dark'];
// A run that samples nothing must never report success: an empty sample set is
// how a broken selector or an unparsed color space disguises itself as a pass.
const MIN_SAMPLES = 10;
let totalFails = 0;
let vacuous = 0;

for (const fam of families) {
  for (const mode of modes) {
    await s.eval(`
      document.documentElement.setAttribute('data-theme', ${JSON.stringify(fam)});
      document.documentElement.setAttribute('data-mode', ${JSON.stringify(mode)});
      document.documentElement.classList.toggle('dark', ${mode === 'dark'});
      return 1;
    `);
    await wait(350);

    const r = await s.eval(`
      ${helpers}
      const base = baseColor();
      const samples = [];
      let unparsed = 0;
      const targets = [
        ...document.querySelectorAll('[data-testid="clipboard-virtual-row"] p'),
        ...document.querySelectorAll('[data-testid="clipboard-virtual-row"] span'),
        ...document.querySelectorAll('header input, header span, header button'),
      ].slice(0, 60);

      for (const el of targets) {
        if (!el.textContent || !el.textContent.trim()) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) continue;
        const cs = getComputedStyle(el);
        const fgp = parse(cs.color);
        if (!fgp) { unparsed++; continue; }
        const bg = effectiveBg(el);
        const fg = fgp.a < 0.999 ? over(fgp, bg) : fgp.rgb;
        const ratio = contrast(fg, bg);
        const size = parseFloat(cs.fontSize);
        const bold = parseInt(cs.fontWeight, 10) >= 700;
        // WCAG 2.x: large text (>=18.66px, or >=14px bold) needs 3:1, else 4.5:1
        const floor = size >= 18.66 || (size >= 14 && bold) ? 3.0 : 4.5;
        samples.push({
          text: el.textContent.trim().slice(0, 18),
          ratio: Math.round(ratio*100)/100,
          size, floor, pass: ratio >= floor,
        });
      }
      const fails = samples.filter(x => !x.pass);
      samples.sort((a,b) => a.ratio - b.ratio);
      return {
        base: 'rgb(' + base.map(Math.round).join(',') + ')',
        candidates: targets.length,
        sampled: samples.length,
        unparsed,
        failCount: fails.length,
        worst: samples.slice(0, 2),
        fails: fails.slice(0, 4),
      };
    `);

    totalFails += r.failCount;
    const tooFew = r.sampled < MIN_SAMPLES;
    if (tooFew) vacuous++;
    const tag = r.failCount ? 'FAIL' : tooFew ? 'VOID' : 'ok  ';
    console.log(
      `[${tag}] ${fam}/${mode} base=${r.base}` +
        ` sampled=${r.sampled}/${r.candidates} unparsed=${r.unparsed} fails=${r.failCount}` +
        (r.worst[0]
          ? ` worst=${r.worst[0].ratio}:1 (${r.worst[0].size}px, floor ${r.worst[0].floor})`
          : '')
    );
    if (tooFew) {
      console.log(
        `     sampled only ${r.sampled} of ${r.candidates} candidates` +
          ` (${r.unparsed} colors unparsed) — selectors or color parsing are broken,` +
          ` not a passing result`
      );
    }
    if (r.failCount) console.log('    ', JSON.stringify(r.fails));
  }
}

await s.eval(`
  document.documentElement.setAttribute('data-theme','brick');
  document.documentElement.setAttribute('data-mode','light');
  document.documentElement.classList.remove('dark');
  return 1;
`);

console.log(`\ntotal runtime contrast failures: ${totalFails}`);
if (vacuous > 0) {
  console.log(
    `${vacuous} of ${families.length * modes.length} combos sampled too little to judge.` +
      ` Treat this run as inconclusive, not green.`
  );
}
process.exit(totalFails > 0 || vacuous > 0 ? 1 : 0);
