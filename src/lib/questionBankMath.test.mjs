import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { analyzeQuestionBankMath } from './questionBankMath.ts';

test('XLSX slash delimiters are converted only for rendering, including display math', () => {
  const source = '行内 \\(x^2\\) 和独立公式 \\[\\frac{1}{2}\\]。';
  const result = analyzeQuestionBankMath(source);
  assert.deepEqual(result.issues, []);
  assert.match(result.renderContent, /\$x\^2\$/);
  assert.match(result.renderContent, /\n\$\$\n\\frac\{1\}\{2\}\n\$\$\n/);
  assert.equal(source.includes('\\('), true);
});

test('existing dollar delimiters remain unchanged', () => {
  const source = '行内 $x^2$；独立 $$\\frac{1}{2}$$。';
  const result = analyzeQuestionBankMath(source);
  assert.equal(result.renderContent, source);
  assert.deepEqual(result.issues, []);
});

test('unclosed, extra and invalid LaTeX delimiters are reported, not repaired', () => {
  assert.match(analyzeQuestionBankMath('\\(x+1').issues[0].message, /Unclosed/);
  assert.match(analyzeQuestionBankMath('x \\)').issues[0].message, /Unexpected/);
  assert.match(analyzeQuestionBankMath('\\(\\frac{1}\\)').issues[0].message, /cannot be rendered/);
});

test('code spans are not interpreted as formulas', () => {
  const result = analyzeQuestionBankMath('`\\(not math\\)` 后面是 \\(x\\)');
  assert.deepEqual(result.issues, []);
  assert.match(result.renderContent, /`\\\(not math\\\)`/);
  assert.match(result.renderContent, /\$x\$/);
});

test('the preview Markdown pipeline actually emits KaTeX for slash delimiters', () => {
  const content = analyzeQuestionBankMath('行内 \\(x^2\\)\n\n独立 \\[\\frac{1}{2}\\]').renderContent;
  const html = renderToStaticMarkup(createElement(ReactMarkdown, {
    remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex], children: content,
  }));
  assert.match(html, /katex/);
  assert.match(html, /katex-display/);
  assert.match(html, /x\^2/);
});
