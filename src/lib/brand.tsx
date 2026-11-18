import { Fragment, type ReactNode } from 'react';

// Headings put 'O2I Numerals' (Inter digits) in front of the serif, so the "2" in
// "O2I" would come out sans-serif between a serif O and I. Wrap each "O2I" so the
// whole name uses one face, matching the header wordmark (see .o2i-name in index.css).
export function brandText(text: string): ReactNode {
  const parts = text.split('O2I');
  if (parts.length === 1) return text;
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <span className="o2i-name">O2I</span>}
      {part}
    </Fragment>
  ));
}
