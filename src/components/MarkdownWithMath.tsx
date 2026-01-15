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
  
  // Step 1: Normalize any wonky spacing around display math delimiters
  // Handle cases like "text$$formula$$more" or "text $$ formula $$ more"
  
  // First, protect display math blocks by marking them
  const displayMathBlocks: string[] = [];
  processed = processed.replace(/\$\$([^$]+)\$\$/g, (match, inner) => {
    // Fix double-escaped backslashes within the block
    const fixed = inner.replace(/\\\\([a-zA-Z]+)/g, '\\$1').trim();
    displayMathBlocks.push(fixed);
    return `%%DISPLAY_MATH_${displayMathBlocks.length - 1}%%`;
  });
  
  // Step 2: Fix inline math - handle double-escaping and spacing
  processed = processed.replace(/\$([^$\n]+)\$/g, (match, inner) => {
    // Don't process if it looks like a placeholder
    if (inner.startsWith('%') || inner.includes('DISPLAY_MATH')) return match;
    const fixed = inner.replace(/\\\\([a-zA-Z]+)/g, '\\$1').trim();
    return `$${fixed}$`;
  });
  
  // Step 3: Add spacing around inline math to prevent text clumping
  // Before: "Sincewehave$formula$" -> "Since we have $formula$"
  processed = processed.replace(/([a-zA-Z0-9,.:;!?)])(\$[^$\n]+\$)/g, '$1 $2');
  processed = processed.replace(/(\$[^$\n]+\$)([a-zA-Z(])/g, '$1 $2');
  
  // Step 4: Restore display math blocks with proper line breaks
  displayMathBlocks.forEach((block, index) => {
    // Ensure proper line breaks before and after display math
    processed = processed.replace(
      `%%DISPLAY_MATH_${index}%%`,
      `\n\n$$${block}$$\n\n`
    );
  });
  
  // Step 5: Clean up excessive newlines (more than 2 consecutive)
  processed = processed.replace(/\n{3,}/g, '\n\n');
  
  // Step 6: Fix cases where text runs directly into formulas
  // Pattern: "word$$" or "$$word" should have spacing
  processed = processed.replace(/([a-zA-Z0-9,.:;!?)])\s*\n\n\$\$/g, '$1\n\n$$');
  processed = processed.replace(/\$\$\n\n([a-zA-Z])/g, '$$\n\n$1');
  
  return processed.trim();
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
