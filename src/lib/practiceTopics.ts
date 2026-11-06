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
