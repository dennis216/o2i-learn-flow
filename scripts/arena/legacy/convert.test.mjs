import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
const run = code => execFileSync('python3', ['-c', `import sys\nsys.path.insert(0,'scripts/arena/legacy')\nfrom convert import *\n${code}`], { cwd: new URL('../../../',import.meta.url), encoding: 'utf8', env: {...process.env,PYTHONDONTWRITEBYTECODE:'1'} }).trim();
test('restores glyphs, superscripts, limits and fractions without copying HTML',()=>{
 const code = String.raw`g=lambda h:'<use href="#MJX-TEX-N-'+h+'"></use>'
assert svg_math('<svg><g>'+g('78')+'<g transform="translate(600,363) scale(0.707)">'+g('32')+'</g></g></svg>')==r'\(x^{2}\)'
assert svg_math('<svg><g><g>'+g('6C')+g('69')+g('6D')+'</g><g transform="translate(0,-600) scale(0.707)">'+g('78')+g('2192')+g('32')+'</g></g></svg>')==r'\(\lim _{x\to 2}\)'
assert svg_math('<svg><g><g transform="translate(220,676)">'+g('31')+'</g><g transform="translate(220,-686)">'+g('32')+'</g><rect height="60"/></g></svg>')==r'\(\frac{1}{2}\)'
assert markdown('<span class="m"><svg><g>'+g('32')+'</g></svg></span>')==r'\(2\)'
print('ok')`;
 assert.equal(run(code),'ok');
});
test('tables keep all cells, unknown glyphs and active markup are rejected',()=>{
 assert.equal(run(`assert markdown('<table><tr><th>x</th><th>f(x)</th></tr><tr><td>1</td><td>2</td></tr></table>')=='| x | f(x) |\\n| --- | --- |\\n| 1 | 2 |'
for v in ['<svg><use href="https://invalid/x"/></svg>','<svg><use href="#MJX-TEX-S4-E000"/></svg>','<script>bad</script>','<span onclick="bad">x</span>']:
 try: markdown(v);raise AssertionError('accepted unsafe input')
 except Unsupported: pass
print('ok')`),'ok');
});
test('graph interpreter rejects code even behind a pole and exports validated static curves',()=>{
 assert.equal(run(`assert expression('-1/(x-(-1))+(2)',1)==1.5
for v in ['1/x+bad()','x**2','x.real','__import__("os")','True']:
 try: expression(v,0);raise AssertionError('accepted code')
 except Unsupported: pass
svg=graph_svg({'xr':[-2,4],'yr':[-1,5],'pieces':[{'a':-2,'b':4,'f':'x*x'}],'open':[[1,1]],'solid':[[1,3]]})
assert '<circle' in svg and 'white' in svg and '<script' not in svg
print('ok')`),'ok');
});
