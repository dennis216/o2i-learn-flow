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
 * 2. Ensure proper spacing around inline math without breaking prose
 * 3. Handle edge cases where text runs directly into formulas
 * 4. Remove excessive newlines that scramble text
 */
const preprocessMathContent = (content: string): string => {
  if (!content) return '';
  
  let processed = content;
  
  // Step 1: Normalize line breaks - remove excessive newlines first
  // Replace 3+ newlines with exactly 2
  processed = processed.replace(/\n{3,}/g, '\n\n');
  
  // Remove single newlines in the middle of sentences (keep paragraph breaks)
  // Pattern: lowercase/punctuation + single newline + lowercase = join them
  processed = processed.replace(/([a-z,;:])\n([a-z])/gi, '$1 $2');
  
  // Step 2: Protect and extract existing math blocks
  const mathBlocks: { type: 'display' | 'inline'; content: string }[] = [];
  
  // Protect display math first ($$...$$)
  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, inner) => {
    const fixed = inner
      .replace(/\\\\([a-zA-Z]+)/g, '\\$1')  // Fix double-escaped: \\frac -> \frac
      .replace(/\n+/g, ' ')                  // Remove internal newlines in math
      .trim();
    mathBlocks.push({ type: 'display', content: fixed });
    return `__MATH_${mathBlocks.length - 1}__`;
  });
  
  // Protect inline math ($...$) - be careful not to match $$
  processed = processed.replace(/(?<!\$)\$(?!\$)([^$\n]+?)(?<!\$)\$(?!\$)/g, (match, inner) => {
    if (inner.includes('__MATH_')) return match;
    const fixed = inner.replace(/\\\\([a-zA-Z]+)/g, '\\$1').trim();
    mathBlocks.push({ type: 'inline', content: fixed });
    return `__MATH_${mathBlocks.length - 1}__`;
  });
  
  // Step 3: Fix clumped text patterns (word directly touching LaTeX command)
  // E.g., "extremelylim" -> "extremely $\lim$" or "wordlim" -> "word $\lim$"
  const latexCommands = ['lim', 'sin', 'cos', 'tan', 'log', 'ln', 'exp', 'sqrt', 'frac', 'int', 'sum', 'prod', 'infty', 'to', 'rightarrow', 'leftarrow', 'alpha', 'beta', 'gamma', 'delta', 'theta', 'pi', 'epsilon', 'lambda', 'sigma', 'omega'];
  
  latexCommands.forEach(cmd => {
    // Match: word + optional backslash + command (not followed by more letters)
    // "extremelylim" or "extremely\lim" -> "extremely $\lim$"
    const regex = new RegExp(`([a-zA-Z]{2,})\\\\?(${cmd})(?![a-zA-Z])`, 'g');
    processed = processed.replace(regex, (match, word, command) => {
      // Don't modify if it's a placeholder
      if (word.includes('__MATH')) return match;
      return `${word} $\\${command}$`;
    });
  });
  
  // Step 4: Fix common punctuation clumping
  // "Therefore,since" -> "Therefore, since"
  processed = processed.replace(/([,.:;!?])([a-zA-Z])/g, '$1 $2');
  
  // Step 5: Fix text running into underscores (subscripts outside math)
  // "x_" or "f_" patterns that should be math
  processed = processed.replace(/\b([a-zA-Z])_\{([^}]+)\}/g, '$$$1_{$2}$$');
  
  // Step 6: Restore math blocks with proper formatting
  mathBlocks.forEach((block, index) => {
    if (block.type === 'display') {
      // Display math: ensure it's on its own line but don't add excessive breaks
      processed = processed.replace(
        `__MATH_${index}__`,
        `\n$$${block.content}$$\n`
      );
    } else {
      // Inline math: keep it inline with surrounding text
      processed = processed.replace(
        `__MATH_${index}__`,
        `$${block.content}$`
      );
    }
  });
  
  // Step 7: Add spacing around math to prevent clumping with adjacent words
  // Word directly before $...$ or after $...$
  processed = processed.replace(/([a-zA-Z0-9])(\$[^$\n]+\$)/g, '$1 $2');
  processed = processed.replace(/(\$[^$\n]+\$)([a-zA-Z])/g, '$1 $2');
  
  // Step 8: Final cleanup - normalize spacing
  processed = processed.replace(/  +/g, ' ');           // Multiple spaces to single
  processed = processed.replace(/\n +/g, '\n');         // Remove leading spaces on lines
  processed = processed.replace(/\n{3,}/g, '\n\n');     // Max 2 consecutive newlines
  
  return processed.trim();
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