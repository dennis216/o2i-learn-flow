// One quiet style for feature icons and status tiles: a tinted surface, a hairline ring and
// the icon in the tone's ink. No bright gradients or coloured shadows, so every page stays
// inside the forest / champagne-gold palette in both themes. Colours: --tone-* in index.css.
export const TONE_TILE = {
  blue: 'bg-[hsl(var(--tone-forest)/0.12)] text-[hsl(var(--tone-forest-ink))] ring-1 ring-inset ring-[hsl(var(--tone-forest)/0.3)]',
  teal: 'bg-[hsl(var(--tone-sage)/0.14)] text-[hsl(var(--tone-sage-ink))] ring-1 ring-inset ring-[hsl(var(--tone-sage)/0.32)]',
  amber: 'bg-[hsl(var(--tone-gold)/0.16)] text-[hsl(var(--tone-gold-ink))] ring-1 ring-inset ring-[hsl(var(--tone-gold)/0.4)]',
  purple: 'bg-[hsl(var(--tone-bronze)/0.14)] text-[hsl(var(--tone-bronze-ink))] ring-1 ring-inset ring-[hsl(var(--tone-bronze)/0.32)]',
} as const;

export type ToneName = keyof typeof TONE_TILE;
