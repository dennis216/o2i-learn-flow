import { renderToStaticMarkup } from 'react-dom/server';
import MarkdownWithMath from '@/components/MarkdownWithMath';

// The iframe inserts HTML. Render reviewed Markdown through the same safe renderer as Practice.
const markdown = (content: string) => renderToStaticMarkup(<MarkdownWithMath content={content} strictMath />);
export function arenaQuestionContent(action: string, data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  const value = data as Record<string, unknown>;
  if (value.status !== 'ok') return data;
  if (action === 'next') {
    if (typeof value.stem !== 'string' || typeof value.topic !== 'string' || !Array.isArray(value.opts)
      || value.opts.length !== 4 || value.opts.some(option => typeof option !== 'string')
      || (value.image_url != null && (typeof value.image_url !== 'string' || !/^https?:\/\/\S+$/.test(value.image_url))))
      throw new Error('Invalid Arena question.');
    return { ...value,
      stem: markdown(value.stem) + (value.image_url ? renderToStaticMarkup(<img src={value.image_url as string} alt="Question figure" />) : ''),
      topic: renderToStaticMarkup(<span>{value.topic}</span>),
      opts: value.opts.map(option => markdown(option as string)),
    };
  }
  if (action === 'answer') {
    if (typeof value.explanation !== 'string') throw new Error('Invalid Arena solution.');
    return { ...value, explanation: markdown(value.explanation) };
  }
  return data;
}
