import { spanish } from './es.ts';

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const templates = Object.entries(spanish)
  .filter(([key]) => key.includes('{{'))
  .sort(([a], [b]) => b.replace(/\{\{\d+\}\}/g, '').length - a.replace(/\{\{\d+\}\}/g, '').length)
  .map(([key, translated]) => {
    const slots: number[] = [];
    const pattern = key.split(/(\{\{\d+\}\})/).map(part => {
      const slot = /^\{\{(\d+)\}\}$/.exec(part);
      if (!slot) return escape(part);
      slots.push(Number(slot[1]));
      return '(.*?)';
    }).join('');
    return { match: new RegExp(`^${pattern}$`, 'u'), translated, slots };
  });

export function translateSpanish(english: string): string {
  if (Object.prototype.hasOwnProperty.call(spanish, english)) return spanish[english];
  for (const template of templates) {
    const values = template.match.exec(english);
    if (!values) continue;
    return template.translated.replace(/\{\{(\d+)\}\}/g, (_, slot: string) => {
      const index = template.slots.indexOf(Number(slot));
      return index < 0 ? '' : values[index + 1];
    });
  }
  return english;
}
