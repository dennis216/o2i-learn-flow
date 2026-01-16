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
 * 1. Fix double-escaped backslashes that break LaTeX commands (\\frac -> \frac)
 * 2. Ensure proper spacing around inline math
 * 3. Ensure display math has proper line breaks
 * 4. Handle edge cases where text runs directly into formulas
 */
const preprocessMathContent = (content: string): string => {
  if (!content) return '';
  
  let processed = content;
  
  // Step 0: Fix clumped text before LaTeX commands (outside of math blocks)
  // Pattern: "wordlim" or "word\\lim" -> "word lim" (will be wrapped in $$ later if needed)
  // Only apply outside of existing $...$ or $$...$$ blocks
  const latexCommands = ['lim', 'sin', 'cos', 'tan', 'log', 'ln', 'exp', 'sqrt', 'frac', 'int', 'sum', 'prod', 'infty', 'alpha', 'beta', 'gamma', 'delta', 'theta', 'pi'];
  
  // First, protect existing math blocks
  const mathBlocks: string[] = [];
  processed = processed.replace(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g, (match) => {
    mathBlocks.push(match);
    return `__MATH_BLOCK_${mathBlocks.length - 1}__`;
  });
  
  // Now fix clumped text outside math blocks
  latexCommands.forEach(cmd => {
    // Match lowercase letter directly before the command
    const regex = new RegExp(`([a-z])\\\\?(${cmd})(?![a-z])`, 'gi');
    processed = processed.replace(regex, (match, letter, command) => {
      return `${letter} $\\${command}`;
    });
  });
  
  // Restore math blocks
  processed = processed.replace(/__MATH_BLOCK_(\d+)__/g, (match, index) => {
    return mathBlocks[parseInt(index)];
  });
  
  // Step 1: Fix display math blocks ($$...$$)
  // Match $$ blocks and fix double-escaped backslashes inside
  const displayMathBlocks: string[] = [];
  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, inner) => {
    // Fix double-escaped backslashes: \\frac -> \frac, \\sqrt -> \sqrt, etc.
    let fixed = inner
      .replace(/\\\\([a-zA-Z]+)/g, '\\$1')  // \\frac -> \frac
      .replace(/\\\\ /g, '\\\\ ')            // Keep actual line breaks
      .trim();
    displayMathBlocks.push(fixed);
    return `%%DISPLAY_MATH_${displayMathBlocks.length - 1}%%`;
  });
  
  // Step 2: Fix inline math blocks ($...$)
  // Be careful not to match $$ or escaped \$
  processed = processed.replace(/(?<!\$)\$(?!\$)([^$\n]+?)(?<!\$)\$(?!\$)/g, (match, inner) => {
    // Don't process placeholders
    if (inner.includes('DISPLAY_MATH') || inner.startsWith('%')) return match;
    
    // Fix double-escaped backslashes
    const fixed = inner.replace(/\\\\([a-zA-Z]+)/g, '\\$1').trim();
    return `$${fixed}$`;
  });
  
  // Step 3: Add spacing around inline math to prevent text clumping
  // Before: "Sincewehave$formula$" -> "Since we have $formula$"
  // Match word characters directly adjacent to $ and add space
  processed = processed.replace(/([a-zA-Z0-9,.:;!?)])(\$[^$\n]+\$)/g, '$1 $2');
  processed = processed.replace(/(\$[^$\n]+\$)([a-zA-Z(])/g, '$1 $2');
  
  // Step 4: Restore display math blocks with proper line breaks
  displayMathBlocks.forEach((block, index) => {
    // Ensure there's a blank line before and after display math
    processed = processed.replace(
      `%%DISPLAY_MATH_${index}%%`,
      `\n\n$$${block}$$\n\n`
    );
  });
  
  // Step 5: Clean up excessive newlines (more than 2 consecutive)
  processed = processed.replace(/\n{4,}/g, '\n\n\n');
  
  // Step 6: Ensure display math isn't glued to preceding text
  // Pattern: "wordtext$$" should have a newline before $$
  processed = processed.replace(/([a-zA-Z0-9,.:;!?)])[ ]*\n\n\$\$/g, '$1\n\n$$');
  
  // Step 7: Fix common AI text clumping patterns outside math blocks
  // E.g., "Therefore,since" -> "Therefore, since"
  processed = processed.replace(/([,.:;!?])([a-zA-Z])/g, '$1 $2');
  
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