"""Conservative legacy SVG-to-LaTeX conversion. Unknown shapes are exclusions, never guesses."""
import ast
import html
from html.parser import HTMLParser
import json
import math
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET


class Unsupported(ValueError):
    pass


SYMBOLS = {
    '−': '-', '·': r'\cdot ', '⋅': r'\cdot ', '×': r'\times ', '÷': r'\div ',
    '\u2061': ' ', '{': r'\{', '}': r'\}',
    '∞': r'\infty ', '→': r'\to ', '↔': r'\leftrightarrow ',
    '≤': r'\le ', '≥': r'\ge ', '≠': r'\ne ', '≈': r'\approx ',
    '∫': r'\int ', '∑': r'\sum ', '±': r'\pm ', '∂': r'\partial ',
    '′': "'", '″': "''", 'π': r'\pi ', 'θ': r'\theta ',
    'α': r'\alpha ', 'β': r'\beta ', 'δ': r'\delta ', 'ε': r'\epsilon ',
    'λ': r'\lambda ', 'Δ': r'\Delta ', 'ℝ': r'\mathbb{R}',
    '∈': r'\in ', '∪': r'\cup ', '∩': r'\cap ', '∅': r'\varnothing ',
    '∼': r'\sim ', '…': r'\ldots ', '⋯': r'\cdots ', '⟨': r'\langle ',
    '⟩': r'\rangle ', '∣': '|', '‖': r'\Vert ', '<': r'\lt ', '>': r'\gt ',
}


def tag(node):
    return node.tag.rsplit('}', 1)[-1]


def glyph(node):
    href = node.get('href') or node.get('{http://www.w3.org/1999/xlink}href', '')
    match = re.fullmatch(r'#MJX-TEX-(N|I|SO|S[1-4]|LO|V)-([0-9A-Fa-f]+)', href)
    if not match:
        raise Unsupported('unknown_or_external_glyph')
    char = chr(int(match[2], 16))
    if char in SYMBOLS:
        return SYMBOLS[char]
    char = unicodedata.normalize('NFKC', char)
    if len(char) == 1 and (char.isascii() and (char.isalnum() or char in '+-=()/[]{}.,:;|!') or char.isspace()):
        return char
    if char in SYMBOLS:
        return SYMBOLS[char]
    raise Unsupported('unsupported_glyph_' + match[2])


def offset(node):
    match = re.search(r'translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)', node.get('transform', ''))
    return (float(match[1]), float(match[2])) if match else (0, 0)


def decode(node):
    name = tag(node)
    if name == 'use':
        return glyph(node)
    if name not in ('svg', 'g') or (node.text or '').strip():
        raise Unsupported('unsupported_svg_element_' + name)
    children = list(node)
    rectangles = [c for c in children if tag(c) == 'rect']
    if rectangles:
        groups = [c for c in children if tag(c) == 'g']
        if len(children) == 3 and len(groups) == 2 and len(rectangles) == 1 and offset(groups[0])[1] > 0 and offset(groups[1])[1] < 0 and float(rectangles[0].get('height', 999)) <= 100:
            return r'\frac{' + decode(groups[0]) + '}{' + decode(groups[1]) + '}'
        roots = [c for c in children if tag(c) == 'use' and (c.get('href', '').endswith('-221A'))]
        if len(children) == 3 and len(roots) == 1 and len(groups) == 1:
            return r'\sqrt{' + decode(groups[0]) + '}'
        raise Unsupported('unrecognized_fraction_or_radical')
    result = ''
    scripts = set()
    for child in children:
        value = decode(child)
        transform = child.get('transform', '')
        y = offset(child)[1]
        if re.search(r'scale\(0\.707\)', transform) and abs(y) > 100:
            kind = '^' if y > 0 else '_'
            if not result or kind in scripts:
                raise Unsupported('ambiguous_script_layout')
            result += kind + '{' + value + '}'
            scripts.add(kind)
        else:
            result += value
            scripts.clear()
    return re.sub(r'(?<![\\A-Za-z])(lim|sin|cos|tan|sec|csc|cot|ln|log|arcsin|arccos|arctan)(?![A-Za-z])', r'\\\1 ', result)


def svg_math(svg):
    if '<!' in svg or re.search(r'\bon\w+\s*=|javascript:', svg, re.I):
        raise Unsupported('unsafe_svg_markup')
    result = decode(ET.fromstring(svg)).strip()
    if not result:
        raise Unsupported('empty_formula')
    return r'\(' + result + r'\)'


class Markdown(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.output = []
        self.rows = None
        self.cell = None

    def handle_starttag(self, name, attrs):
        if any(k.startswith('on') or k in ('src', 'href') for k, _ in attrs):
            raise Unsupported('active_html_attribute')
        if name == 'table':
            if self.rows is not None:
                raise Unsupported('nested_table')
            self.rows = []
        elif name == 'tr':
            self.rows.append([])
        elif name in ('td', 'th'):
            if not self.rows or self.cell is not None:
                raise Unsupported('malformed_table')
            self.cell = []
        elif name in ('span',):
            pass
        elif name == 'br':
            self.handle_data('\n')
        elif name in ('p', 'div'):
            self.handle_data('\n\n')
        elif name in ('b', 'strong'):
            self.handle_data('**')
        elif name in ('i', 'em'):
            self.handle_data('*')
        else:
            raise Unsupported('unsupported_html_' + name)

    def handle_endtag(self, name):
        if name in ('td', 'th'):
            self.rows[-1].append(''.join(self.cell).strip().replace('|', r'\|'))
            self.cell = None
        elif name == 'table':
            if not self.rows or len({len(r) for r in self.rows}) != 1:
                raise Unsupported('ragged_table')
            rows = self.rows[:1] + [['---'] * len(self.rows[0])] + self.rows[1:]
            self.output.append('\n\n' + '\n'.join('| ' + ' | '.join(r) + ' |' for r in rows) + '\n\n')
            self.rows = None
        elif name in ('p', 'div'):
            self.handle_data('\n\n')
        elif name in ('b', 'strong'):
            self.handle_data('**')
        elif name in ('i', 'em'):
            self.handle_data('*')
        elif name not in ('span', 'tr', 'br'):
            raise Unsupported('unsupported_html_' + name)

    def handle_data(self, value):
        (self.cell if self.cell is not None else self.output).append(value)


def markdown(value):
    formulas = []

    def math_replace(match):
        formulas.append(svg_math(match[0]))
        return 'O2IFORMULA' + str(len(formulas) - 1) + 'TOKEN'

    value = re.sub(r'<svg\b[\s\S]*?</svg>', math_replace, value)
    parser = Markdown()
    parser.feed(value)
    parser.close()
    if parser.rows is not None or parser.cell is not None:
        raise Unsupported('unclosed_table')
    result = ''.join(parser.output)
    for i, formula in enumerate(formulas):
        result = result.replace('O2IFORMULA' + str(i) + 'TOKEN', formula)
    if re.search(r'MJX-TEX|<svg|O2IFORMULA\d+TOKEN', result):
        raise Unsupported('unresolved_formula')
    return re.sub(r'\n{3,}', '\n\n', result).strip()


def expression(source, x):
    tree = ast.parse(source, mode='eval')
    allowed = (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Constant, ast.Name, ast.Load, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.UAdd, ast.USub)
    for node in ast.walk(tree):
        if not isinstance(node, allowed) or isinstance(node, ast.Name) and node.id != 'x' or isinstance(node, ast.Constant) and (type(node.value) not in (int, float) or not math.isfinite(node.value)):
            raise Unsupported('unsupported_graph_expression')

    def evaluate(node):
        if isinstance(node, ast.Expression):
            return evaluate(node.body)
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            return node.value
        if isinstance(node, ast.Name) and node.id == 'x':
            return x
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            return evaluate(node.operand) * (-1 if isinstance(node.op, ast.USub) else 1)
        if isinstance(node, ast.BinOp):
            a, b = evaluate(node.left), evaluate(node.right)
            if isinstance(node.op, ast.Add): return a + b
            if isinstance(node.op, ast.Sub): return a - b
            if isinstance(node.op, ast.Mult): return a * b
            if isinstance(node.op, ast.Div): return a / b
        raise Unsupported('unsupported_graph_expression')

    return evaluate(tree)


def graph_svg(graph):
    def finite(value):
        if type(value) not in (int, float) or not math.isfinite(value) or abs(value) > 1e6:
            raise Unsupported('invalid_graph_number')
        return value

    if set(graph) - {'xr', 'yr', 'open', 'solid', 'pieces', 'vasym', 'hasym'}:
        raise Unsupported('unknown_graph_properties')
    x0, x1 = map(finite, graph['xr'])
    y0, y1 = map(finite, graph['yr'])
    if x0 >= x1 or y0 >= y1 or x1-x0 > 100 or y1-y0 > 100:
        raise Unsupported('invalid_graph_bounds')
    width, height, pad = 660, 396, 39
    px = lambda x: pad + (x-x0)/(x1-x0)*(width-2*pad)
    py = lambda y: height-pad-(y-y0)/(y1-y0)*(height-2*pad)
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">', '<rect width="100%" height="100%" fill="white"/>', '<defs><clipPath id="plot"><rect x="39" y="39" width="582" height="318"/></clipPath></defs>']
    for x in range(math.ceil(x0), math.floor(x1)+1):
        parts += [f'<path d="M{px(x):.2f} {pad}V{height-pad}" stroke="#ddd"/>', f'<text x="{px(x):.2f}" y="{height-pad+22}" text-anchor="middle" font-size="16">{x}</text>']
    for y in range(math.ceil(y0), math.floor(y1)+1):
        parts += [f'<path d="M{pad} {py(y):.2f}H{width-pad}" stroke="#ddd"/>', f'<text x="{pad-10}" y="{py(y)+5:.2f}" text-anchor="end" font-size="16">{y}</text>']
    parts += ['<g clip-path="url(#plot)">']
    if y0 <= 0 <= y1: parts += [f'<path d="M{pad} {py(0):.2f}H{width-pad}" stroke="black" stroke-width="2"/>']
    if x0 <= 0 <= x1: parts += [f'<path d="M{px(0):.2f} {pad}V{height-pad}" stroke="black" stroke-width="2"/>']
    for x in graph.get('vasym', []): parts += [f'<path d="M{px(finite(x)):.2f} {pad}V{height-pad}" stroke="#a33" stroke-dasharray="6 5"/>']
    for y in graph.get('hasym', []): parts += [f'<path d="M{pad} {py(finite(y)):.2f}H{width-pad}" stroke="#a33" stroke-dasharray="6 5"/>']
    if not graph['pieces'] or len(graph['pieces']) > 20:
        raise Unsupported('invalid_graph_pieces')
    for piece in graph['pieces']:
        if set(piece) != {'a', 'b', 'f'} or finite(piece['a']) > finite(piece['b']):
            raise Unsupported('invalid_graph_piece')
        path, previous = [], None
        for i in range(1165):
            x = x0+(x1-x0)*i/1164
            if not piece['a'] <= x <= piece['b']:
                previous = None
                continue
            try: y = expression(piece['f'], x)
            except ZeroDivisionError:
                previous = None
                continue
            if not math.isfinite(y) or not y0-(y1-y0) <= y <= y1+(y1-y0):
                previous = None
                continue
            command = 'L' if previous is not None and abs(py(y)-previous) < 60 else 'M'
            path.append(f'{command}{px(x):.2f} {py(y):.2f}')
            previous = py(y)
        parts += [f'<path d="{" ".join(path)}" fill="none" stroke="#174a9b" stroke-width="3"/>']
    for field in ['open', 'solid']:
        for x, y in graph.get(field, []):
            parts += [f'<circle cx="{px(finite(x)):.2f}" cy="{py(finite(y)):.2f}" r="6" stroke="#111" stroke-width="2" fill="{"white" if field == "open" else "#111"}"/>']
    parts += ['</g>', f'<text x="{width-18}" y="{height-pad+5}" font-size="18">x</text>', '<text x="24" y="23" font-size="18">y</text>', '</svg>']
    return ''.join(parts)


def converted(row):
    q = row['source']
    try:
        stem = markdown(q['stem'])
        if q.get('table_html'):
            stem += '\n\n' + markdown(q['table_html'])
        options = [markdown(o) for o in q['options']]
        solution = markdown(q['explanation'])
        if not stem or not solution or not all(options) or len(set(options)) != 4:
            raise Unsupported('empty_or_repeated_converted_content')
        graph = graph_svg(q['graph']) if q.get('graph') else None
        return {'source_id': q['id'], 'source_sha256': row['source_sha256'], 'unit': q['unit'], 'tier': q['tier'], 'legacy_topic': q['topic'], 'stem': stem, 'options': options, 'solution': solution, 'graph_svg': graph, 'status': 'converted_unreviewed'}
    except (Unsupported, ET.ParseError, ValueError, KeyError, TypeError) as error:
        return {'source_id': q['id'], 'source_sha256': row['source_sha256'], 'status': 'excluded', 'reason': str(error)}


if __name__ == '__main__':
    data = json.load(sys.stdin)
    json.dump([converted(row) for row in data], sys.stdout, ensure_ascii=False)
