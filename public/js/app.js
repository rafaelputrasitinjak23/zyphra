document.addEventListener('DOMContentLoaded', () => {
  const copyButtons = document.querySelectorAll('[data-copy-code]');

  copyButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const codeTarget = document.querySelector(button.dataset.copyCode);
      const shareId = button.dataset.shareId;
      if (!codeTarget) return;

      const text = codeTarget.innerText;
      await navigator.clipboard.writeText(text);

      if (shareId) {
        try {
          const response = await fetch(`/api/share/${shareId}/copy`, { method: 'POST' });
          const result = await response.json();
          const copyCount = document.querySelector('[data-copy-count]');
          if (copyCount && result.ok) copyCount.textContent = new Intl.NumberFormat('id-ID').format(result.copies || 0);
        } catch (error) {}
      }

      const original = button.innerHTML;
      button.innerHTML = 'Tersalin ✓';
      setTimeout(() => {
        button.innerHTML = original;
      }, 1600);
    });
  });

  const typeSelect = document.querySelector('[data-type-select]');
  const scriptFields = document.querySelectorAll('[data-script-field]');
  const codeFields = document.querySelectorAll('[data-code-field]');

  function syncTypeFields() {
    if (!typeSelect) return;
    const isCode = typeSelect.value === 'code';
    scriptFields.forEach((el) => el.classList.toggle('hidden', isCode));
    codeFields.forEach((el) => el.classList.toggle('hidden', !isCode));
  }

  if (typeSelect) {
    typeSelect.addEventListener('change', syncTypeFields);
    syncTypeFields();
  }

  const languageSelect = document.querySelector('[data-language-select]');
  const codeTextarea = document.querySelector('[data-code-textarea]');
  const detectedSyntax = document.querySelector('[data-detected-syntax]');

  const labels = {
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

  function has(regex, code) {
    return regex.test(code);
  }

  function score(code, patterns) {
    return patterns.reduce((total, item) => total + (has(item[0], code) ? item[1] : 0), 0);
  }

  function detectSyntax(code) {
    const value = String(code || '').trim();
    if (!value) return 'text';

    if (/^\s*[{[]/.test(value)) {
      try {
        JSON.parse(value);
        return 'json';
      } catch (error) {}
    }

    if (/^\s*<!doctype html/i.test(value) || /<html[\s>]/i.test(value) || /<body[\s>]/i.test(value) || /<div[\s>]/i.test(value)) return 'html';
    if (/^\s*<\?php/i.test(value) || (/\$[a-zA-Z_][\w]*\s*=/.test(value) && /echo\s+|namespace\s+|use\s+[^;]+;/i.test(value))) return 'php';
    if (/^\s*#!/.test(value) || (/\b(npm|yarn|pnpm|git|curl|wget|sudo|chmod|mkdir|cd|echo)\b/.test(value) && /\n/.test(value))) return 'bash';
    if (/\bSELECT\b[\s\S]+\bFROM\b/i.test(value) || /\b(INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE|ALTER TABLE|DROP TABLE)\b/i.test(value)) return 'sql';
    if (/^\s*#\s+\S+/m.test(value) || /```[\s\S]*```/.test(value) || /^\s*[-*]\s+\[[ x]\]/m.test(value)) return 'markdown';

    const scores = {
      typescript: score(value, [[/\binterface\s+\w+\s*[{]/, 6], [/\btype\s+\w+\s*=\s*/, 5], [/:\s*(string|number|boolean|unknown|any|void|Promise<|Record<)/, 4], [/\bimplements\s+\w+/, 3], [/\bas\s+const\b/, 3]]),
      javascript: score(value, [[/\b(const|let|var)\s+\w+\s*=/, 4], [/\b(require|module\.exports|export default|import\s+.+from)\b/, 5], [/\b(async\s+function|function\s+\w+|=>)\b/, 4], [/\b(console\.log|document\.querySelector|addEventListener)\b/, 4]]),
      python: score(value, [[/^\s*def\s+\w+\s*\(/m, 6], [/^\s*class\s+\w+\s*[:(]/m, 4], [/\b(import\s+\w+|from\s+\w+\s+import)\b/, 4], [/^\s*(print|if __name__\s*==)\b/m, 4], [/:\s*\n\s{2,}\S/m, 3]]),
      css: score(value, [[/[.#]?[a-zA-Z0-9_-]+\s*{[\s\S]*:[\s\S]*}/, 5], [/\b(display|position|background|color|font-size|border-radius|grid-template)\s*:/, 4], [/\@media\s*\(/, 3]]),
      java: score(value, [[/\bpublic\s+class\s+\w+/, 6], [/\bpublic\s+static\s+void\s+main\s*\(/, 6], [/\bSystem\.out\.println\s*\(/, 4], [/\bimport\s+java\./, 4]]),
      cpp: score(value, [[/#include\s*<[^>]+>/, 6], [/\bstd::\w+/, 5], [/\busing\s+namespace\s+std\s*;/, 4], [/\bcout\s*<</, 4]]),
      csharp: score(value, [[/\busing\s+System\s*;/, 6], [/\bnamespace\s+\w+/, 4], [/\bConsole\.Write(Line)?\s*\(/, 5], [/\bpublic\s+class\s+\w+[\s\S]*\bstatic\s+void\s+Main\s*\(/, 6]]),
      go: score(value, [[/^\s*package\s+main\b/m, 6], [/\bfunc\s+\w+\s*\(/, 5], [/\bfmt\.Print/, 4], [/\bimport\s*\(/, 3]]),
      rust: score(value, [[/\bfn\s+main\s*\(/, 6], [/\blet\s+mut\s+\w+/, 4], [/\bprintln!\s*\(/, 5], [/\buse\s+std::/, 4]])
    };

    const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return winner && winner[1] >= 4 ? winner[0] : 'text';
  }

  function updateDetectedSyntax() {
    if (!languageSelect || !codeTextarea || !detectedSyntax) return;
    const selected = languageSelect.value;
    const detected = selected === 'auto' ? detectSyntax(codeTextarea.value) : selected;
    detectedSyntax.textContent = `Detected: ${labels[detected] || detected}`;
  }

  if (languageSelect && codeTextarea) {
    languageSelect.addEventListener('change', updateDetectedSyntax);
    codeTextarea.addEventListener('input', updateDetectedSyntax);
    updateDetectedSyntax();
  }

  const mobileMenuButton = document.querySelector('[data-mobile-menu-button]');
  const mobileMenu = document.querySelector('[data-mobile-menu]');

  if (mobileMenuButton && mobileMenu) {
    mobileMenuButton.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });
  }

  const chatWidget = document.querySelector('[data-chat-widget]');

  if (chatWidget) {
    const openButton = chatWidget.querySelector('[data-chat-open]');
    const closeButton = chatWidget.querySelector('[data-chat-close]');
    const panel = chatWidget.querySelector('[data-chat-panel]');
    const form = chatWidget.querySelector('[data-chat-form]');
    const input = chatWidget.querySelector('[data-chat-input]');
    const messages = chatWidget.querySelector('[data-chat-messages]');
    const suggestionButtons = chatWidget.querySelectorAll('[data-chat-suggest]');
    const history = [];

    function openChat() {
      if (!panel) return;
      panel.classList.remove('hidden');
      setTimeout(() => input && input.focus(), 80);
    }

    function closeChat() {
      if (!panel) return;
      panel.classList.add('hidden');
    }

    function scrollChat() {
      if (!messages) return;
      messages.scrollTop = messages.scrollHeight;
    }

    function cleanDisplayText(value) {
      return String(value || '')
        .replace(/\*\*/g, '')
        .replace(/__+/g, '')
        .replace(/`{1,3}/g, '')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
        .replace(/https?:\/\/[^\s)]+/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    function escapeMessage(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function renderMessage(value) {
      return escapeMessage(cleanDisplayText(value)).replace(/\n/g, '<br>');
    }

    function safeCardText(value) {
      return escapeMessage(String(value || '').trim());
    }

    function formatCompactNumber(value) {
      return new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
    }

    function appendCards(messageItem, cards) {
      if (!messageItem || !Array.isArray(cards) || !cards.length) return;
      const oldList = messageItem.querySelector('.zyphra-result-list');
      if (oldList) oldList.remove();

      const list = document.createElement('div');
      list.className = 'zyphra-result-list';

      cards.slice(0, 4).forEach((card) => {
        const item = document.createElement('div');
        item.className = 'zyphra-result-card';
        const meta = [card.type, card.category, card.language].filter(Boolean).join(' • ');
        item.innerHTML = `
          <div class="zyphra-result-title">${safeCardText(card.title)}</div>
          <div class="zyphra-result-meta">${safeCardText(meta)}</div>
          <div class="zyphra-result-desc">${safeCardText(card.description)}</div>
          <div class="zyphra-result-stats">
            <span>${formatCompactNumber(card.views)} view</span>
            <span>${formatCompactNumber(card.downloads)} download</span>
            <span>${formatCompactNumber(card.copies)} copy</span>
          </div>
          <a class="zyphra-result-button" href="${safeCardText(card.url)}">Lihat Detail</a>
        `;
        list.appendChild(item);
      });

      messageItem.appendChild(list);
      scrollChat();
    }

    function createMessage(role, content, loading = false, cards = []) {
      const item = document.createElement('div');
      item.className = `zyphra-msg ${role === 'user' ? 'zyphra-msg-user' : 'zyphra-msg-ai'}${loading ? ' zyphra-msg-loading' : ''}`;
      const bubble = document.createElement('div');
      bubble.className = 'zyphra-msg-bubble';
      bubble.innerHTML = renderMessage(content);
      item.appendChild(bubble);
      messages.appendChild(item);
      appendCards(item, cards);
      scrollChat();
      return { item, bubble };
    }

    function setBusy(isBusy) {
      if (input) input.disabled = isBusy;
      const submit = form && form.querySelector('button[type="submit"]');
      if (submit) submit.disabled = isBusy;
    }

    async function sendChat(text) {
      const prompt = String(text || '').trim();
      if (!prompt) return;

      openChat();
      createMessage('user', prompt);
      history.push({ role: 'user', content: prompt });
      if (history.length > 8) history.splice(0, history.length - 8);

      const loading = createMessage('assistant', 'Zyphra AI sedang mencari jawaban');
      loading.item.classList.add('zyphra-msg-loading');
      setBusy(true);

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, history: history.slice(-6) })
        });

        const result = await response.json();
        const answer = result && result.ok ? result.answer : result.message;
        const cards = result && Array.isArray(result.cards) ? result.cards : [];
        loading.item.classList.remove('zyphra-msg-loading');
        const finalAnswer = answer || 'Maaf, Zyphra AI belum bisa menjawab sekarang.';
        loading.bubble.innerHTML = renderMessage(finalAnswer);
        appendCards(loading.item, cards);
        history.push({ role: 'assistant', content: finalAnswer });
        if (history.length > 8) history.splice(0, history.length - 8);
      } catch (error) {
        loading.item.classList.remove('zyphra-msg-loading');
        const errorAnswer = 'Maaf, koneksi ke Zyphra AI sedang bermasalah. Coba lagi sebentar lagi.';
        loading.bubble.innerHTML = renderMessage(errorAnswer);
      } finally {
        setBusy(false);
        if (input) input.focus();
        scrollChat();
      }
    }

    if (openButton) openButton.addEventListener('click', openChat);
    if (closeButton) closeButton.addEventListener('click', closeChat);

    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const value = input ? input.value : '';
        if (input) input.value = '';
        sendChat(value);
      });
    }

    suggestionButtons.forEach((button) => {
      button.addEventListener('click', () => {
        sendChat(button.dataset.chatSuggest || button.textContent || '');
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && panel && !panel.classList.contains('hidden')) closeChat();
    });
  }

});
