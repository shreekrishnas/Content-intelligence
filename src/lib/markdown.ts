/**
 * Minimal, dependency-free Markdown → HTML renderer for displaying
 * LLM-generated content (headings, bold, italic, lists, links, code, quotes).
 *
 * Input is HTML-escaped BEFORE any markdown is applied, so raw HTML in the
 * source can never inject markup. Only the whitelisted markdown constructs
 * below produce tags.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inline(text: string): string {
  return text
    // bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    // italic
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>')
    // inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // links [text](url) — url already escaped; only allow http/https/mailto
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function renderMarkdown(md: string): string {
  if (!md) return '';
  const lines = escapeHtml(md).split('\n');
  const html: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let inCode = false;
  const codeBuf: string[] = [];

  const closeList = () => {
    if (listType) { html.push(`</${listType}>`); listType = null; }
  };

  for (let raw of lines) {
    // fenced code blocks
    if (/^```/.test(raw.trim())) {
      if (inCode) {
        html.push(`<pre class="md-pre"><code>${codeBuf.join('\n')}</code></pre>`);
        codeBuf.length = 0;
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeBuf.push(raw); continue; }

    const line = raw.trim();

    if (line === '') { closeList(); continue; }

    // headings
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const level = h[1].length;
      html.push(`<h${level} class="md-h md-h${level}">${inline(h[2])}</h${level}>`);
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      closeList();
      html.push(`<blockquote class="md-quote">${inline(line.replace(/^>\s?/, ''))}</blockquote>`);
      continue;
    }

    // horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      closeList();
      html.push('<hr class="md-hr" />');
      continue;
    }

    // ordered list
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      if (listType !== 'ol') { closeList(); html.push('<ol class="md-ol">'); listType = 'ol'; }
      html.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }

    // unordered list
    const ul = line.match(/^[-*+]\s+(.*)$/);
    if (ul) {
      if (listType !== 'ul') { closeList(); html.push('<ul class="md-ul">'); listType = 'ul'; }
      html.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }

    // paragraph
    closeList();
    html.push(`<p class="md-p">${inline(line)}</p>`);
  }

  if (inCode && codeBuf.length) {
    html.push(`<pre class="md-pre"><code>${codeBuf.join('\n')}</code></pre>`);
  }
  closeList();

  return html.join('\n');
}
