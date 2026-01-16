import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';

interface MarkdownWithMathProps {
  content: string;
  className?: string;
}

/**
 * Pre-process content to fix common LaTeX rendering issues:
 * 1. Fix double-escaped backslashes that break LaTeX commands
 * 2. Ensure proper spacing around inline math WITHOUT breaking prose flow
 * 3. Handle edge cases where text runs directly into formulas
 * 4. Prevent forced newlines that scramble sentences
 */
const preprocessMathContent = (content: string): string => {
  if (!content) return '';
  
  let processed = content;
  
  // Step 1: Protect and extract existing math blocks FIRST
  const mathBlocks: { type: 'display' | 'inline'; content: string }[] = [];
  
  // Protect display math first ($$...$$)
  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, inner) => {
    const fixed = inner
      .replace(/\\\\([a-zA-Z]+)/g, '\\$1')  // Fix double-escaped: \\frac -> \frac
      .replace(/\n+/g, ' ')                  // Remove internal newlines in math
      .trim();
    mathBlocks.push({ type: 'display', content: fixed });
    return `__DISPLAYMATH_${mathBlocks.length - 1}__`;
  });
  
  // Protect inline math ($...$) - be careful not to match $$
  processed = processed.replace(/(?<!\$)\$(?!\$)([^$\n]+?)(?<!\$)\$(?!\$)/g, (match, inner) => {
    if (inner.includes('__DISPLAYMATH_') || inner.includes('__INLINEMATH_')) return match;
    const fixed = inner.replace(/\\\\([a-zA-Z]+)/g, '\\$1').trim();
    mathBlocks.push({ type: 'inline', content: fixed });
    return `__INLINEMATH_${mathBlocks.length - 1}__`;
  });
  
  // Step 2: Normalize line breaks - join lines that are part of the same paragraph
  // Replace single newlines between text with spaces (preserve paragraph breaks with 2+ newlines)
  processed = processed.replace(/([^\n])\n([^\n])/g, '$1 $2');
  
  // Step 3: Replace multiple newlines with exactly two (paragraph break)
  processed = processed.replace(/\n{2,}/g, '\n\n');
  
  // Step 4: Fix clumped text patterns (word directly touching LaTeX command)
  const latexCommands = ['lim', 'sin', 'cos', 'tan', 'log', 'ln', 'exp', 'sqrt', 'frac', 'int', 'sum', 'prod', 'infty', 'to', 'rightarrow', 'leftarrow', 'alpha', 'beta', 'gamma', 'delta', 'theta', 'pi', 'epsilon', 'lambda', 'sigma', 'omega'];
  
  latexCommands.forEach(cmd => {
    // Match: word + optional backslash + command (not followed by more letters)
    const regex = new RegExp(`([a-zA-Z]{2,})\\\\?(${cmd})(?![a-zA-Z])`, 'g');
    processed = processed.replace(regex, (match, word, command) => {
      if (word.includes('__DISPLAYMATH') || word.includes('__INLINEMATH')) return match;
      return `${word} $\\${command}$`;
    });
  });
  
  // Step 5: Fix common punctuation clumping
  processed = processed.replace(/([,.:;!?])([a-zA-Z])/g, '$1 $2');
  
  // Step 6: Fix text running into underscores (subscripts outside math)
  processed = processed.replace(/\b([a-zA-Z])_\{([^}]+)\}/g, '$$$1_{$2}$$');
  
  // Step 7: Restore math blocks - INLINE math stays inline, DISPLAY gets its own paragraph
  mathBlocks.forEach((block, index) => {
    if (block.type === 'display') {
      // Display math: paragraph break before and after
      processed = processed.replace(
        `__DISPLAYMATH_${index}__`,
        `\n\n$$${block.content}$$\n\n`
      );
    } else {
      // Inline math: NO newlines, stays in the flow of text
      processed = processed.replace(
        `__INLINEMATH_${index}__`,
        `$${block.content}$`
      );
    }
  });
  
  // Step 8: Add spacing around inline math to prevent clumping with adjacent words
  // But DO NOT add newlines
  processed = processed.replace(/([a-zA-Z0-9])(\$[^$\n]+\$)/g, '$1 $2');
  processed = processed.replace(/(\$[^$\n]+\$)([a-zA-Z])/g, '$1 $2');
  
  // Step 9: Final cleanup
  processed = processed.replace(/  +/g, ' ');           // Multiple spaces to single
  processed = processed.replace(/\n{3,}/g, '\n\n');     // Max 2 consecutive newlines
  processed = processed.replace(/^\s+|\s+$/g, '');      // Trim start/end
  
  return processed;
};

export default function MarkdownWithMath({ content, className = '' }: MarkdownWithMathProps) {
  const processedContent = preprocessMathContent(content);
  
  return (
    <div className={`prose prose-sm max-w-none dark:prose-invert ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}