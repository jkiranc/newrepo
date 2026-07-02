import type { StyleRun } from '../types/nativeTypes';
import { TagRegistry, defaultTagRegistry, type SerializedTag } from './TagRegistry';

/** Parse an inline `style="..."` attribute into a lowercase property→value map. */
export function parseInlineStyle(style: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!style) {
    return out;
  }
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) {
      continue;
    }
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (prop && value) {
      out[prop] = value;
    }
  }
  return out;
}

/** Style properties a `<span style>` (or any inline element's style attr) contributes. */
function styleRunFromCss(attrs: Record<string, string>): Partial<StyleRun> {
  const css = parseInlineStyle(attrs.style);
  const run: Partial<StyleRun> = {};
  if (css.color) {
    run.color = css.color;
  }
  if (css['background-color']) {
    run.backgroundColor = css['background-color'];
  }
  if (css['font-size']) {
    const size = parseFloat(css['font-size']);
    if (!Number.isNaN(size)) {
      run.fontSize = size;
    }
  }
  if (css['font-family']) {
    run.fontFamily = css['font-family'].replace(/['"]/g, '');
  }
  if (css['font-weight'] === 'bold' || parseInt(css['font-weight'], 10) >= 600) {
    run.bold = true;
  }
  if (css['font-style'] === 'italic') {
    run.italic = true;
  }
  const decoration = css['text-decoration'] ?? css['text-decoration-line'] ?? '';
  if (decoration.includes('underline')) {
    run.underline = true;
  }
  if (decoration.includes('line-through')) {
    run.strikethrough = true;
  }
  return run;
}

function serializeCssFromRun(run: StyleRun): SerializedTag | null {
  const parts: string[] = [];
  if (run.color) {
    parts.push(`color: ${run.color}`);
  }
  if (run.backgroundColor) {
    parts.push(`background-color: ${run.backgroundColor}`);
  }
  if (run.fontSize) {
    parts.push(`font-size: ${run.fontSize}px`);
  }
  if (run.fontFamily) {
    parts.push(`font-family: ${run.fontFamily}`);
  }
  if (parts.length === 0) {
    return null;
  }
  return { tag: 'span', attrs: { style: parts.join('; ') } };
}

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

/**
 * Register the standard HTML tags onto a registry. Called once for {@link defaultTagRegistry}
 * at import time; exposed so tests / advanced consumers can build a fresh registry.
 */
export function installBuiltInTags(registry: TagRegistry): void {
  // ── inline emphasis ────────────────────────────────────────────────────────
  registry.registerAlias(['b', 'strong'], {
    category: 'inline',
    toStyleRun: () => ({ bold: true }),
    fromStyleRun: (run) => (run.bold ? { tag: 'strong', attrs: {} } : null),
  });
  registry.registerAlias(['i', 'em'], {
    category: 'inline',
    toStyleRun: () => ({ italic: true }),
    fromStyleRun: (run) => (run.italic ? { tag: 'em', attrs: {} } : null),
  });
  registry.register({
    tag: 'u',
    category: 'inline',
    toStyleRun: () => ({ underline: true }),
    fromStyleRun: (run) => (run.underline ? { tag: 'u', attrs: {} } : null),
  });
  registry.registerAlias(['s', 'strike', 'del'], {
    category: 'inline',
    toStyleRun: () => ({ strikethrough: true }),
    fromStyleRun: (run) => (run.strikethrough ? { tag: 's', attrs: {} } : null),
  });
  registry.register({
    tag: 'code',
    category: 'inline',
    toStyleRun: () => ({ fontFamily: 'monospace' }),
    fromStyleRun: (run) =>
      run.fontFamily === 'monospace' ? { tag: 'code', attrs: {} } : null,
  });
  registry.register({
    tag: 'sup',
    category: 'inline',
    toStyleRun: () => ({ superscript: true }),
    fromStyleRun: (run) => (run.superscript ? { tag: 'sup', attrs: {} } : null),
  });
  registry.register({
    tag: 'sub',
    category: 'inline',
    toStyleRun: () => ({ subscript: true }),
    fromStyleRun: (run) => (run.subscript ? { tag: 'sub', attrs: {} } : null),
  });

  // ── links ──────────────────────────────────────────────────────────────────
  registry.register({
    tag: 'a',
    category: 'inline',
    // Native renders links with its own affordance (color/underline); we only carry the href
    // so the run round-trips cleanly to a single <a> without a redundant <u> wrapper.
    toStyleRun: (attrs) => ({ link: attrs.href }),
    fromStyleRun: (run) =>
      run.link ? { tag: 'a', attrs: { href: run.link } } : null,
  });

  // ── span with arbitrary inline CSS ───────────────────────────────────────────
  registry.register({
    tag: 'span',
    category: 'inline',
    toStyleRun: styleRunFromCss,
    fromStyleRun: serializeCssFromRun,
  });

  // ── block-level ──────────────────────────────────────────────────────────────
  registry.registerAlias(['p', 'div'], {
    category: 'block',
    toBlock: () => ({ tag: 'p' }),
    fromBlock: (block) => (block.tag === 'p' ? { tag: 'p', attrs: {} } : null),
  });
  for (const h of HEADING_TAGS) {
    registry.register({
      tag: h,
      category: 'block',
      toBlock: () => ({ tag: h }),
      fromBlock: (block) => (block.tag === h ? { tag: h, attrs: {} } : null),
    });
  }
  registry.register({
    tag: 'blockquote',
    category: 'block',
    toBlock: () => ({ tag: 'blockquote', indentLevel: 1 }),
    fromBlock: (block) =>
      block.tag === 'blockquote' ? { tag: 'blockquote', attrs: {} } : null,
  });
  registry.register({
    tag: 'pre',
    category: 'block',
    toBlock: () => ({ tag: 'pre' }),
    fromBlock: (block) => (block.tag === 'pre' ? { tag: 'pre', attrs: {} } : null),
  });
  registry.register({
    tag: 'li',
    category: 'block',
    toBlock: () => ({ tag: 'li' }),
    fromBlock: (block) => (block.tag === 'li' ? { tag: 'li', attrs: {} } : null),
  });

  // ── images (self-closing embed) ──────────────────────────────────────────────
  registry.register({
    tag: 'img',
    category: 'embed',
    toEmbed: (attrs) => ({
      kind: 'image',
      src: attrs.src,
      width: attrs.width ? parseFloat(attrs.width) : undefined,
      height: attrs.height ? parseFloat(attrs.height) : undefined,
      data: {},
    }),
    fromEmbed: (embed) =>
      embed.kind === 'image'
        ? {
            tag: 'img',
            attrs: {
              src: embed.src ?? '',
              ...(embed.width ? { width: String(embed.width) } : {}),
              ...(embed.height ? { height: String(embed.height) } : {}),
            },
            selfClosing: true,
          }
        : null,
  });
}

installBuiltInTags(defaultTagRegistry);
