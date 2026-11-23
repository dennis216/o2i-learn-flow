import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const tokens = block => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g)]
  .map(([, name, h, s, l]) => [name, [Number(h), Number(s), Number(l)]]));
const dark = tokens(css.match(/:root, \.dark\s*\{([^}]+)\}/)[1]);
const light = { ...dark, ...tokens(css.match(/\.light\s*\{([^}]+)\}/)[1]) };
function rgb([h, s, l]) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map(n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); });
}
function luminance(color) {
  return rgb(color).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
    .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
}
const pairs = [
  ['foreground', 'background'], ['card-foreground', 'card'], ['popover-foreground', 'popover'],
  ['muted-foreground', 'background'], ['muted-foreground', 'card'], ['muted-foreground', 'muted'],
  ['primary-foreground', 'primary'], ['secondary-foreground', 'secondary'], ['accent-foreground', 'accent'],
  ['accent-text', 'background'], ['studio-white', 'studio-ink'], ['studio-muted', 'studio-ink'],
  ['foreground', 'quest-background'], ['education-green', 'background'],
  // Quiet tone tiles and status pills (src/lib/tones.ts): the ink is used for icons and pill text.
  ['tone-forest-ink', 'background'], ['tone-sage-ink', 'background'], ['tone-gold-ink', 'background'],
  ['tone-bronze-ink', 'background'], ['tone-sage-ink', 'card'], ['education-teal', 'background'],
];
let failed = false;
for (const [mode, palette] of Object.entries({ light, dark })) {
  for (const [text, surface] of pairs) {
    const a = luminance(palette[text]), b = luminance(palette[surface]);
    const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    const pass = ratio >= 4.5;
    console.log(`${mode.padEnd(5)} ${text}/${surface}: ${ratio.toFixed(2)}:1 ${pass ? 'PASS' : 'FAIL'}`);
    if (!pass) failed = true;
  }
}
if (failed) process.exitCode = 1;
