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

  // Step 0: Auto-close unclosed $$ tags to prevent raw code leaking
  const displayMathCount = (processed.match(/\$\$/g) || []).length;
  if (displayMathCount % 2 !== 0) {
    processed = processed + '\n$$';
  }

  // Step 0.5: Normalize \begin{cases} blocks that may have been split or mangled
  // Fix double-escaped backslashes inside cases environments BEFORE extraction
  processed = processed.replace(/\\\\begin\{cases\}/g, '\\begin{cases}');
  processed = processed.replace(/\\\\end\{cases\}/g, '\\end{cases}');
  
  // Wrap bare \begin{cases}...\end{cases} that aren't already inside $$ delimiters
  processed = processed.replace(
    /(?<!\$)\s*(\\begin\{cases\}[\s\S]*?\\end\{cases\})\s*(?!\$)/g,
    (match, casesBlock) => {
      // Check if already wrapped - look backwards/forwards for $$
      return `\n$$${casesBlock}$$\n`;
    }
  );
  
  // Step 1: Normalize line breaks - remove excessive newlines first
  processed = processed.replace(/\n{3,}/g, '\n\n');
  
  // Remove single newlines in the middle of sentences (keep paragraph breaks)
  // BUT preserve newlines inside math blocks (between $$ pairs)
  processed = processed.replace(/([a-z,;:])\n([a-z])/gi, '$1 $2');
  
  // Step 2: Protect and extract existing math blocks
  const mathBlocks: { type: 'display' | 'inline'; content: string }[] = [];
  
  // Protect display math first ($$...$$)
  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, inner) => {
    let fixed = inner
      .replace(/\\\\([a-zA-Z]+)/g, '\\$1')  // Fix double-escaped: \\frac -> \frac
      .trim();
    
    // For cases environments, preserve \\ line breaks but collapse other newlines
    if (fixed.includes('\\begin{cases}')) {
      // Normalize spacing inside cases but keep \\ separators
      fixed = fixed
        .replace(/\n+/g, ' ')           // Collapse newlines to spaces
        .replace(/\s{2,}/g, ' ')         // Collapse multiple spaces
        .replace(/\\\\\s*/g, ' \\\\ ')   // Normalize \\ spacing
        .trim();
    } else {
      fixed = fixed.replace(/\n+/g, ' ').trim();
    }
    
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
  
  // Step 3: Fix clumped text patterns
  const latexCommands = ['lim', 'sin', 'cos', 'tan', 'log', 'ln', 'exp', 'sqrt', 'frac', 'int', 'sum', 'prod', 'infty', 'to', 'rightarrow', 'leftarrow', 'alpha', 'beta', 'gamma', 'delta', 'theta', 'pi', 'epsilon', 'lambda', 'sigma', 'omega'];
  
  latexCommands.forEach(cmd => {
    const regex = new RegExp(`([a-zA-Z]{2,})\\\\?(${cmd})(?![a-zA-Z])`, 'g');
    processed = processed.replace(regex, (match, word, command) => {
      if (word.includes('__MATH')) return match;
      return `${word} $\\${command}$`;
    });
  });
  
  // Step 4: Fix common punctuation clumping
  processed = processed.replace(/([,.:;!?])([a-zA-Z])/g, '$1 $2');
  
  // Step 5: Fix text running into underscores (subscripts outside math)
  processed = processed.replace(/\b([a-zA-Z])_\{([^}]+)\}/g, '$$$1_{$2}$$');
  
  // Step 6: Restore math blocks with proper formatting
  mathBlocks.forEach((block, index) => {
    if (block.type === 'display') {
      processed = processed.replace(
        `__MATH_${index}__`,
        `\n$$${block.content}$$\n`
      );
    } else {
      processed = processed.replace(
        `__MATH_${index}__`,
        `$${block.content}$`
      );
    }
  });
  
  // Step 7: Add spacing around math to prevent clumping with adjacent words
  processed = processed.replace(/([a-zA-Z0-9])(\$[^$\n]+\$)/g, '$1 $2');
  processed = processed.replace(/(\$[^$\n]+\$)([a-zA-Z])/g, '$1 $2');
  
  // Step 8: Final cleanup - normalize spacing
  processed = processed.replace(/  +/g, ' ');
  processed = processed.replace(/\n +/g, '\n');
  processed = processed.replace(/\n{3,}/g, '\n\n');
  
  return processed.trim();
};

export default function MarkdownWithMath({ content, className = '' }: MarkdownWithMathProps) {
  const processedContent = preprocessMathContent(content);
  
  return (
    <div className={`prose prose-sm max-w-none dark:prose-invert math-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Ensure paragraphs don't break inline math flow
          p: ({ children }) => <p className="leading-relaxed">{children}</p>,
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}