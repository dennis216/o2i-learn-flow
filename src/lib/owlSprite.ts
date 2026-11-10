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
export const OWL_BLINK = OWL.map((row, i) =>
  i === 9 ? withPrefix(row, '.kttttttkkttttttk') : i === 10 ? withPrefix(row, '.ktkkkkkkkkkkkktk') : row);

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
