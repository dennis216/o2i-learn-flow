import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MarkdownWithMathProps {
  content: string;
  className?: string;
}

/**
 * Pre-process content to fix common LaTeX rendering issues:
 * 1. Add spacing around inline math ($...$) when glued to text
 * 2. Ensure display math ($$...$$) has proper line breaks
 * 3. Fix escaped backslashes that break LaTeX commands
 */
const preprocessMathContent = (content: string): string => {
  if (!content) return '';
  
  let processed = content;
  
  // Fix double-escaped backslashes (\\frac -> \frac) that come from JSON
  // Only fix within math delimiters
  processed = processed.replace(/\$\$([^$]+)\$\$/g, (match, inner) => {
    const fixed = inner.replace(/\\\\([a-zA-Z]+)/g, '\\$1');
    return `$$${fixed}$$`;
  });
  
  processed = processed.replace(/\$([^$\n]+)\$/g, (match, inner) => {
    // Don't process if it looks like a display math that was split
    if (inner.startsWith('$') || inner.endsWith('$')) return match;
    const fixed = inner.replace(/\\\\([a-zA-Z]+)/g, '\\$1');
    return `$${fixed}$`;
  });
  
  // Add space before inline math when preceded by letter/word
  processed = processed.replace(/([a-zA-Z0-9,.:;!?])(\$[^$\n]+\$)/g, '$1 $2');
  
  // Add space after inline math when followed by letter/word
  processed = processed.replace(/(\$[^$\n]+\$)([a-zA-Z])/g, '$1 $2');
  
  // Ensure display math ($$...$$) has line breaks for proper rendering
  // Add newline before $$ if preceded by text (not already newline)
  processed = processed.replace(/([^\n])\$\$/g, '$1\n\n$$');
  
  // Add newline after $$ if followed by text (not already newline)  
  processed = processed.replace(/\$\$([^\n])/g, '$$\n\n$1');
  
  return processed;
};

export default function MarkdownWithMath({ content, className = '' }: MarkdownWithMathProps) {
  const processedContent = preprocessMathContent(content);
  
  return (
    <div className={`prose prose-sm max-w-none dark:prose-invert ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
