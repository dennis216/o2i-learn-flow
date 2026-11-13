import type { PracticeTopic } from './studentPractice.ts';

export function practiceTopicUnit(code: string): number | null {
  return /^\d+\.\d+$/.test(code) ? Number(code.split('.')[0]) : null;
}

export function practiceTopicCards(topics: PracticeTopic[], unit: number | null) {
  const units = [...new Set(topics.map(topic => practiceTopicUnit(topic.code)).filter(value => value !== null))].sort((a, b) => a - b);
  const cards = topics.filter(topic => unit === null || practiceTopicUnit(topic.code) === unit)
    .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
  return { units, cards };
}

// "All" view: one foldable group per Unit, in Unit order; topics without a numeric Unit go last (unit null).
export function practiceTopicGroups(topics: PracticeTopic[]) {
  const { units, cards } = practiceTopicCards(topics, null);
  const groups: { unit: number | null; topics: PracticeTopic[] }[] = units.map(unit => ({ unit, topics: cards.filter(topic => practiceTopicUnit(topic.code) === unit) }));
  const other = cards.filter(topic => practiceTopicUnit(topic.code) === null);
  if (other.length) groups.push({ unit: null, topics: other });
  return groups;
}
