// A minimal C# reader for the settings pages' DrawSettings-style methods: just enough structure to
// turn their bodies into statement trees, without a real parser.

export type Stmt = ['block', Stmt[]] | ['using', string, Stmt] | ['if', string, Stmt, Stmt | null] | ['stmt', string];

export interface MethodSource {
  className: string;
  name: string;
  body: string;
}

// Length of a string or char literal starting at i (verbatim, interpolated, raw and plain forms).
function literalEnd(s: string, i: number): number {
  if (s.startsWith('"""', i)) {
    const end = s.indexOf('"""', i + 3);
    return end < 0 ? s.length : end + 3;
  }
  let j = i;
  let verbatim = false;
  while (s[j] === '@' || s[j] === '$') {
    if (s[j] === '@') verbatim = true;
    j++;
  }
  const quote = s[j];
  j++;
  while (j < s.length) {
    const c = s[j];
    if (verbatim && c === '"' && s[j + 1] === '"') j += 2;
    else if (!verbatim && c === '\\') j += 2;
    else if (c === quote) return j + 1;
    else j++;
  }
  return j;
}

function startsLiteral(s: string, i: number): boolean {
  const c = s[i];
  if (c === '"' || c === "'") return true;
  if (c === '@' || c === '$') return /^[@$]{1,2}"/.test(s.slice(i, i + 3));
  return false;
}

/** Removes comments and blank lines; string literals pass through untouched. */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    if (startsLiteral(src, i)) {
      const end = literalEnd(src, i);
      out += src.slice(i, end);
      i = end;
    } else if (src.startsWith('//', i)) {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
    } else {
      out += src[i];
      i++;
    }
  }
  return out
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .join('\n');
}

/** The same text with every literal's contents blanked, so braces and parens inside them never count. */
function mask(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    if (startsLiteral(s, i)) {
      const end = literalEnd(s, i);
      out += '"' + ' '.repeat(Math.max(0, end - i - 2)) + '"';
      i = end;
    } else {
      out += s[i];
      i++;
    }
  }
  return out;
}

function matchClose(masked: string, open: number, o = '{', c = '}'): number {
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === o) depth++;
    else if (masked[i] === c && --depth === 0) return i + 1;
  }
  throw new Error('Unbalanced ' + o + c);
}

/** Every Draw* method (void or bool) in a source file, with the class it is declared in. */
export function drawMethods(source: string): MethodSource[] {
  const text = stripComments(source);
  const masked = mask(text);
  const classes: { name: string; start: number; end: number }[] = [];
  for (const m of masked.matchAll(/\bclass\s+(\w+)[^{;]*\{/g)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    classes.push({ name: m[1] ?? '', start: open, end: matchClose(masked, open) });
  }
  const out: MethodSource[] = [];
  const header =
    /^\s*(?:(?:public|internal|private|protected|static|override|virtual|new|sealed)\s+)*(?:void|bool)\s+(Draw\w*)\s*\(([^)]*)\)\s*\{/gm;
  for (const m of masked.matchAll(header)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const close = matchClose(masked, open);
    const owner = classes.filter((c) => c.start < open && open < c.end).sort((a, b) => b.start - a.start)[0];
    out.push({ className: owner?.name ?? '', name: m[1] ?? '', body: text.slice(open + 1, close - 1) });
  }
  return out;
}

const isSpace = (c: string | undefined) => c === ' ' || c === '\t' || c === '\r' || c === '\n';

function skipWs(s: string, i: number): number {
  while (i < s.length && isSpace(s[i])) i++;
  return i;
}

// s[i] is a plain or verbatim string start; returns the index just past it.
function skipString(s: string, i: number): number {
  return literalEnd(s, i);
}

function matchParen(s: string, i: number, open = '(', close = ')'): number {
  let depth = 0;
  while (i < s.length) {
    const c = s[i];
    if (startsLiteral(s, i)) {
      i = skipString(s, i);
      continue;
    }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return i + 1;
    i++;
  }
  throw new Error('Unbalanced');
}

/** Parses a statement list into nested statement trees. */
export function parse(s: string): Stmt[] {
  const stmts: Stmt[] = [];
  let i = 0;
  for (;;) {
    i = skipWs(s, i);
    if (i >= s.length) break;
    const [st, next] = statement(s, i);
    stmts.push(st);
    i = next;
  }
  return stmts;
}

function statement(s: string, i: number): [Stmt, number] {
  i = skipWs(s, i);
  if (s[i] === '{') {
    const j = matchParen(s, i, '{', '}');
    return [['block', parse(s.slice(i + 1, j - 1))], j];
  }
  for (const kw of ['using', 'if'] as const) {
    if (new RegExp('^' + kw + '\\s*\\(').test(s.slice(i, i + 12))) {
      const p = s.indexOf('(', i);
      const j = matchParen(s, p);
      const cond = s.slice(p + 1, j - 1).trim();
      const [body, k] = statement(s, j);
      if (kw === 'using') return [['using', cond, body], k];
      const k2 = skipWs(s, k);
      if (s.startsWith('else', k2)) {
        const [elseBody, k3] = statement(s, k2 + 4);
        return [['if', cond, body, elseBody], k3];
      }
      return [['if', cond, body, null], k];
    }
  }
  // A plain statement runs to the first ';' outside any brackets.
  let j = i;
  let depth = 0;
  for (;;) {
    const c = s[j];
    if (c === undefined) throw new Error('Unterminated statement: ' + s.slice(i, i + 80));
    if (startsLiteral(s, j)) {
      j = skipString(s, j);
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ';' && depth === 0) break;
    j++;
  }
  return [['stmt', s.slice(i, j).replace(/\s+/g, ' ').trim()], j + 1];
}

/** Splits a call's argument list at top-level commas. */
export function splitArgs(a: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  let i = 0;
  while (i < a.length) {
    const c = a[i] ?? '';
    if (c === '"') {
      const end = skipString(a, i);
      cur += a.slice(i, end);
      i = end;
      continue;
    }
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
    i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', '0': '\0', '"': '"', "'": "'", '\\': '\\' };

function unescape(s: string): string {
  return s.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{1,4}|.)/g, (_, e: string) => {
    if (e[0] === 'u' || e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    return ESCAPES[e] ?? e;
  });
}

const LITERAL = /"((?:[^"\\]|\\.)*)"/g;

/** Evaluates a concatenation of C# string literals; null when anything else is mixed in. */
export function stringConcat(expr: string): string | null {
  const rest = expr.replace(LITERAL, '').replace(/\+/g, '').trim();
  if (rest) return null;
  return [...expr.matchAll(LITERAL)].map((m) => unescape(m[1] ?? '')).join('');
}
