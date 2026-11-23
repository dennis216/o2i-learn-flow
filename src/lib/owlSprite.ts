// Dr. Owler, same 24×19 sprite and palette as the Limit Arena game (public/games/limit-arena.html).
export const OWL = [
  '.....kkkkkkkkkkk........',
  '...kknnnnnnnnnnnkk......',
  '.kknnnnnnnyynnnnnnkk....',
  '...kknnnnnnnnnnnkk.g....',
  '.....kkkkkkkkkkk...g....',
  '....k.kttttk.k.....g....',
  '...ktkttttttktk....g....',
  '..kttttttttttttk...YY...',
  '..ktwwwkttkwwwtk...YY...',
  '.ktwwkwwkkwwkwwtk.......',
  '.ktwwkwwkkwwkwwtk...Y...',
  '.kttwwwtyytwwwttk..YY...',
  '.ktttttttyytttttk.YYY...',
  '.kttccccttccccttkY.YY...',
  '.kttcTccccccTcttk..YY...',
  '.ktttccccccccttt...YY...',
  '..kttcTccccTcttk...YY.Y.',
  '..kttttttttttttk....YYY.',
  '...kkooookkookk.........',
];

const withPrefix = (row: string, prefix: string) => prefix + row.slice(prefix.length);
// Replace some rows (by index) with new left-hand pixels; the rest of each row is kept.
const edit = (base: string[], rows: Record<number, string>) => base.map((row, i) => (rows[i] ? withPrefix(row, rows[i]) : row));

export const OWL_BLINK = edit(OWL, { 9: '.kttttttkkttttttk', 10: '.ktkkkkkkkkkkkktk' });

// Idle frames for the desk pet (src/components/DeskPet.tsx). Eyes: rows 8–11, belly: 13–17, feet: 18.
export const OWL_LOOK_LEFT = edit(OWL, { 9: '.ktwkwwwkkwkwwwtk', 10: '.ktwkwwwkkwkwwwtk' });
export const OWL_LOOK_RIGHT = edit(OWL, { 9: '.ktwwwkwkkwwwkwtk', 10: '.ktwwwkwkkwwwkwtk' });
// Content "^ ^" eyes.
export const OWL_HAPPY = edit(OWL, {
  8: '..kttttkttkttttk', 9: '.ktttkttkkttktttk', 10: '.kttktktkktktkttk', 11: '.kttttttyyttttttk',
});
// Heavy lids: the top half of each eye is shut.
export const OWL_SLEEPY = edit(OWL, { 8: '..kttttkttkttttk', 9: '.ktkkkkkkkkkkkktk' });
// Preening: eyes shut, beak tucked to the chest, belly feathers ruffled two ways.
const PREEN_FACE = { 9: '.kttttttkkttttttk', 10: '.ktkkkkkkkkkkkktk', 11: '.kttwwwttttwwwttk', 13: '.kttccccyyccccttk' };
export const OWL_PREEN_A = edit(OWL, { ...PREEN_FACE, 14: '.kttccTccccTccttk', 16: '..kttTccTccTcttk' });
export const OWL_PREEN_B = edit(OWL, { ...PREEN_FACE, 14: '.kttTccccccccTttk', 15: '.ktttcTccccTcttt', 16: '..kttccTTccccttk' });
// Two steps of a slow waddle.
export const OWL_STEP_A = edit(OWL, { 18: '...kkooookk.ooo.' });
export const OWL_STEP_B = edit(OWL, { 18: '...kooo.kkkookk.' });

export const OWL_COLS = OWL[0].length;
export const OWL_ROWS = OWL.length;

// The game's PICO-8 style palette, for pixel accents elsewhere on the site.
export const PIXEL = {
  black: '#000000', navy: '#1D2B53', ink: '#111D35', white: '#FFF1E8', yellow: '#FFEC27',
  orange: '#FFA300', lav: '#83769C', tan: '#A28879', peach: '#FFCCAA', green: '#00E436',
} as const;

const COLORS: Record<string, string> = {
  k: PIXEL.black, n: PIXEL.navy, y: PIXEL.yellow, Y: PIXEL.yellow, t: PIXEL.tan, T: PIXEL.tan,
  w: PIXEL.white, c: PIXEL.peach, o: PIXEL.orange, g: PIXEL.orange,
};

export function drawSprite(canvas: HTMLCanvasElement, sprite: string[], scale: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  sprite.forEach((row, y) => [...row].forEach((ch, x) => {
    const color = COLORS[ch];
    if (!color) return;
    ctx.fillStyle = color;
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }));
}
