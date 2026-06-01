const crypto = require('crypto');

const categoryLabels = {
  'bot-wa': 'Bot WA',
  telegram: 'Telegram',
  discord: 'Discord',
  website: 'Website',
  api: 'API',
  tool: 'Tools',
  template: 'Template',
  other: 'Lainnya'
};

const languageLabels = {
  auto: 'Auto Detect',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  php: 'PHP',
  html: 'HTML',
  css: 'CSS',
  json: 'JSON',
  bash: 'Bash',
  markdown: 'Markdown',
  java: 'Java',
  cpp: 'C++',
  csharp: 'C#',
  go: 'Go',
  rust: 'Rust',
  sql: 'SQL',
  text: 'Text'
};

const prismAliases = {
  html: 'markup',
  csharp: 'csharp',
  cpp: 'cpp',
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  php: 'php',
  css: 'css',
  json: 'json',
  bash: 'bash',
  markdown: 'markdown',
  java: 'java',
  go: 'go',
  rust: 'rust',
  sql: 'sql',
  text: 'text'
};

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `share-${Date.now()}`;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseTags(input) {
  if (Array.isArray(input)) return input.map((tag) => String(tag).trim()).filter(Boolean);
  return String(input || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function formatNumber(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('id-ID').format(number);
}

function getSnippet(code, maxLines = 8) {
  const lines = String(code || '').replace(/\r\n/g, '\n').split('\n');
  return lines.slice(0, maxLines).join('\n');
}

function makeAdminToken(username) {
  const payload = Buffer.from(JSON.stringify({ username, iat: Date.now() })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', process.env.ADMIN_COOKIE_SECRET || 'dev-secret')
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function verifyAdminToken(token) {
  if (!token || !token.includes('.')) return false;
  const [payload, signature] = token.split('.');
  const expected = crypto
    .createHmac('sha256', process.env.ADMIN_COOKIE_SECRET || 'dev-secret')
    .update(payload)
    .digest('base64url');

  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const maxAge = 1000 * 60 * 60 * 12;
    return data.username === (process.env.ADMIN_USERNAME || 'admin') && Date.now() - data.iat < maxAge;
  } catch {
    return false;
  }
}

function siteName() {
  return process.env.APP_NAME || 'Zyphra Share';
}

function defaultImage(category) {
  const label = categoryLabels[category] || 'Code';
  return `https://placehold.co/900x560/0f172a/ffffff?text=${encodeURIComponent(label)}`;
}

function normalizeCode(input) {
  return String(input || '').replace(/\r\n/g, '\n').trim();
}

function scorePatterns(code, patterns) {
  return patterns.reduce((total, [regex, weight]) => total + (regex.test(code) ? weight : 0), 0);
}

function detectLanguage(code, preferred = 'auto') {
  const value = normalizeCode(code);
  const selected = String(preferred || 'auto').toLowerCase().trim();

  if (selected && selected !== 'auto' && languageLabels[selected]) return selected;
  if (!value) return 'text';

  const trimmed = value.trim();

  if (/^\s*[{[]/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {}
  }

  if (/^\s*<!doctype html/i.test(trimmed) || /<html[\s>]/i.test(trimmed) || /<body[\s>]/i.test(trimmed) || /<div[\s>]/i.test(trimmed)) return 'html';
  if (/^\s*<\?php/i.test(trimmed) || /\$[a-zA-Z_][\w]*\s*=/.test(trimmed) && /echo\s+|namespace\s+|use\s+[^;]+;/i.test(trimmed)) return 'php';
  if (/^\s*#!/.test(trimmed) || /\b(npm|yarn|pnpm|git|curl|wget|sudo|chmod|mkdir|cd|echo)\b/.test(trimmed) && /\n/.test(trimmed)) return 'bash';
  if (/\bSELECT\b[\s\S]+\bFROM\b/i.test(trimmed) || /\b(INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE|ALTER TABLE|DROP TABLE)\b/i.test(trimmed)) return 'sql';
  if (/^\s*#\s+\S+/m.test(trimmed) || /```[\s\S]*```/.test(trimmed) || /^\s*[-*]\s+\[[ x]\]/m.test(trimmed)) return 'markdown';

  const scores = {
    typescript: scorePatterns(trimmed, [
      [/\binterface\s+\w+\s*[{]/, 6],
      [/\btype\s+\w+\s*=\s*/, 5],
      [/:\s*(string|number|boolean|unknown|any|void|Promise<|Record<)/, 4],
      [/\bimplements\s+\w+/, 3],
      [/\bas\s+const\b/, 3],
      [/[<]\w+[>][\s\S]*=>/, 2]
    ]),
    javascript: scorePatterns(trimmed, [
      [/\b(const|let|var)\s+\w+\s*=/, 4],
      [/\b(require|module\.exports|export default|import\s+.+from)\b/, 5],
      [/\b(async\s+function|function\s+\w+|=>)\b/, 4],
      [/\b(console\.log|document\.querySelector|addEventListener)\b/, 4]
    ]),
    python: scorePatterns(trimmed, [
      [/^\s*def\s+\w+\s*\(/m, 6],
      [/^\s*class\s+\w+\s*[:(]/m, 4],
      [/\b(import\s+\w+|from\s+\w+\s+import)\b/, 4],
      [/^\s*(print|if __name__\s*==)\b/m, 4],
      [/:\s*\n\s{2,}\S/m, 3]
    ]),
    css: scorePatterns(trimmed, [
      [/[.#]?[a-zA-Z0-9_-]+\s*{[\s\S]*:[\s\S]*}/, 5],
      [/\b(display|position|background|color|font-size|border-radius|grid-template)\s*:/, 4],
      [/\@media\s*\(/, 3]
    ]),
    java: scorePatterns(trimmed, [
      [/\bpublic\s+class\s+\w+/, 6],
      [/\bpublic\s+static\s+void\s+main\s*\(/, 6],
      [/\bSystem\.out\.println\s*\(/, 4],
      [/\bimport\s+java\./, 4]
    ]),
    cpp: scorePatterns(trimmed, [
      [/#include\s*<[^>]+>/, 6],
      [/\bstd::\w+/, 5],
      [/\busing\s+namespace\s+std\s*;/, 4],
      [/\bcout\s*<</, 4]
    ]),
    csharp: scorePatterns(trimmed, [
      [/\busing\s+System\s*;/, 6],
      [/\bnamespace\s+\w+/, 4],
      [/\bConsole\.Write(Line)?\s*\(/, 5],
      [/\bpublic\s+class\s+\w+[\s\S]*\bstatic\s+void\s+Main\s*\(/, 6]
    ]),
    go: scorePatterns(trimmed, [
      [/^\s*package\s+main\b/m, 6],
      [/\bfunc\s+\w+\s*\(/, 5],
      [/\bfmt\.Print/, 4],
      [/\bimport\s*\(/, 3]
    ]),
    rust: scorePatterns(trimmed, [
      [/\bfn\s+main\s*\(/, 6],
      [/\blet\s+mut\s+\w+/, 4],
      [/\bprintln!\s*\(/, 5],
      [/\buse\s+std::/, 4]
    ])
  };

  const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (winner && winner[1] >= 4) return winner[0];

  return 'text';
}

function iconSvg(name, className = 'h-5 w-5') {
  const safeClass = escapeHtml(className);
  const icons = {
    view: `<svg class="${safeClass}" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M2.25 12s3.5-6.75 9.75-6.75S21.75 12 21.75 12 18.25 18.75 12 18.75 2.25 12 2.25 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    download: `<svg class="${safeClass}" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M12 3v11m0 0 4-4m-4 4-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 15v3a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    copy: `<svg class="${safeClass}" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M8 8.5A2.5 2.5 0 0 1 10.5 6H18a2.5 2.5 0 0 1 2.5 2.5V16A2.5 2.5 0 0 1 18 18.5h-7.5A2.5 2.5 0 0 1 8 16V8.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M5.5 15.5A2.5 2.5 0 0 1 3 13V5.5A2.5 2.5 0 0 1 5.5 3H13a2.5 2.5 0 0 1 2.5 2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    code: `<svg class="${safeClass}" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="m9 18-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="m15 6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    file: `<svg class="${safeClass}" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M14 3H7a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V9l-6-6Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M14 3v6h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  };
  return icons[name] || icons.file;
}

function renderMarkdown(input) {
  const text = String(input || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const html = [];
  let inList = false;
  let inCode = false;
  let codeLang = '';
  let codeBuffer = [];

  function inline(value) {
    return escapeHtml(value)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  function closeList() {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (inCode) {
        const detected = detectLanguage(codeBuffer.join('\n'), codeLang || 'auto');
        const prismClass = prismAliases[detected] || 'text';
        html.push(`<pre><code class="language-${escapeHtml(prismClass)}">${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
        codeBuffer = [];
        codeLang = '';
        inCode = false;
      } else {
        closeList();
        codeLang = trimmed.replace(/^```/, '').trim() || 'auto';
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    if (!trimmed) {
      closeList();
      continue;
    }

    if (trimmed.startsWith('### ')) {
      closeList();
      html.push(`<h3>${inline(trimmed.slice(4))}</h3>`);
      continue;
    }

    if (trimmed.startsWith('## ')) {
      closeList();
      html.push(`<h2>${inline(trimmed.slice(3))}</h2>`);
      continue;
    }

    if (trimmed.startsWith('# ')) {
      closeList();
      html.push(`<h1>${inline(trimmed.slice(2))}</h1>`);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${inline(trimmed.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${inline(trimmed)}</p>`);
  }

  closeList();

  if (inCode) {
    const detected = detectLanguage(codeBuffer.join('\n'), codeLang || 'auto');
    const prismClass = prismAliases[detected] || 'text';
    html.push(`<pre><code class="language-${escapeHtml(prismClass)}">${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
  }

  return html.join('\n');
}

module.exports = {
  categoryLabels,
  languageLabels,
  prismAliases,
  slugify,
  escapeHtml,
  parseTags,
  formatNumber,
  getSnippet,
  makeAdminToken,
  verifyAdminToken,
  siteName,
  defaultImage,
  detectLanguage,
  iconSvg,
  renderMarkdown
};
