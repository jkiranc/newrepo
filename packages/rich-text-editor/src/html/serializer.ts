import {
  OBJECT_REPLACEMENT_CHAR,
  type BlockNode,
  type EmbedPlaceholder,
  type RichTextDocument,
  type StyleRun,
} from '../types/nativeTypes';
import { defaultTagRegistry, TagRegistry, type SerializedTag } from '../registry/TagRegistry';
import { coalesceRuns } from './nativeBridge';
// Side-effect import: ensures built-in tags are installed on `defaultTagRegistry`.
import '../registry/builtInTags';

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br />');
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function attrsToString(attrs: Record<string, string>): string {
  const keys = Object.keys(attrs);
  if (keys.length === 0) {
    return '';
  }
  return keys.map((k) => ` ${k}="${escapeAttr(attrs[k])}"`).join('');
}

function openTag(tag: SerializedTag): string {
  return `<${tag.tag}${attrsToString(tag.attrs)}>`;
}

function closeTag(tag: SerializedTag): string {
  return `</${tag.tag}>`;
}

/** Wrap already-escaped inner text in the inline tags implied by a run's styling. */
function wrapRun(run: StyleRun, inner: string, registry: TagRegistry): string {
  const seen = new Set<string>();
  const tags: SerializedTag[] = [];
  for (const def of registry.getAll()) {
    if (def.category !== 'inline' || !def.fromStyleRun) {
      continue;
    }
    const serialized = def.fromStyleRun(run);
    if (!serialized) {
      continue;
    }
    // Aliases (b/strong, i/em, s/strike/del) produce identical output — dedupe.
    const signature = `${serialized.tag}${attrsToString(serialized.attrs)}`;
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    tags.push(serialized);
  }
  let result = inner;
  for (let i = tags.length - 1; i >= 0; i--) {
    result = openTag(tags[i]) + result + closeTag(tags[i]);
  }
  return result;
}

/** Parse a table embed's `data.rows` back into a grid of cell strings. */
function tableRows(embed: EmbedPlaceholder): string[][] {
  try {
    const parsed = JSON.parse(embed.data?.rows ?? '[]') as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((row) =>
      Array.isArray(row) ? row.map((cell) => String(cell)) : [],
    );
  } catch {
    return [];
  }
}

/** Serialize a grid of cell strings to a `<table>` element (first row optionally a header). */
export function rowsToTableHtml(rows: string[][], header: boolean): string {
  let out = '<table>';
  rows.forEach((row, r) => {
    const cellTag = header && r === 0 ? 'th' : 'td';
    out += '<tr>';
    for (const cell of row) {
      out += `<${cellTag}>${escapeText(cell)}</${cellTag}>`;
    }
    out += '</tr>';
  });
  out += '</table>';
  return out;
}

/** Serialize a `kind: 'table'` embed to a `<table>` element. */
function serializeTable(embed: EmbedPlaceholder): string {
  return rowsToTableHtml(tableRows(embed), embed.data?.header === 'true');
}

/** True if a block is exactly one table embed (so it serializes as a bare `<table>`). */
function tableEmbedOf(block: BlockNode): EmbedPlaceholder | undefined {
  if (
    block.text === OBJECT_REPLACEMENT_CHAR &&
    block.embeds?.length === 1 &&
    block.embeds[0].kind === 'table'
  ) {
    return block.embeds[0];
  }
  return undefined;
}

function serializeEmbed(embed: EmbedPlaceholder, registry: TagRegistry): string {
  if (embed.kind === 'table') {
    return serializeTable(embed);
  }
  const serialized = registry.serializeEmbed(embed);
  if (!serialized) {
    return '';
  }
  if (serialized.selfClosing) {
    return `<${serialized.tag}${attrsToString(serialized.attrs)} />`;
  }
  return `${openTag(serialized)}${escapeText(embed.label ?? '')}${closeTag(serialized)}`;
}

function runCovering(runs: StyleRun[], index: number): StyleRun | undefined {
  for (const run of runs) {
    if (run.start <= index && index < run.start + run.length) {
      return run;
    }
  }
  return undefined;
}

/** Serialize a block's text (with its style runs and embeds) into inline HTML. */
function serializeInline(block: BlockNode, registry: TagRegistry): string {
  const { text } = block;
  // Merge adjacent identical runs so native per-character spans don't produce fragmented
  // output like <strong>a</strong><strong>b</strong> instead of <strong>ab</strong>.
  const runs = coalesceRuns(block.styleRuns);
  const embedByOffset = new Map<number, EmbedPlaceholder>();
  for (const embed of block.embeds ?? []) {
    embedByOffset.set(embed.offset, embed);
  }

  let out = '';
  let i = 0;
  while (i < text.length) {
    const embed = embedByOffset.get(i);
    if (embed) {
      out += serializeEmbed(embed, registry);
      i += 1;
      continue;
    }
    const run = runCovering(runs, i);
    if (!run) {
      out += escapeText(text[i]);
      i += 1;
      continue;
    }
    // Consume the run's text up to its end or the next embed, whichever comes first.
    const end = run.start + run.length;
    let j = i;
    let inner = '';
    while (j < end && !embedByOffset.has(j)) {
      inner += text[j];
      j += 1;
    }
    out += wrapRun(run, escapeText(inner), registry);
    i = j;
  }
  return out;
}

function serializeBlock(block: BlockNode, registry: TagRegistry): string {
  // A block that is nothing but a table embed becomes a bare <table> (no <p> wrapper).
  const table = tableEmbedOf(block);
  if (table) {
    return serializeTable(table);
  }
  const tag = registry.serializeBlock(block) ?? { tag: block.tag || 'p', attrs: {} };
  const attrs = withAlignment(tag.attrs, block.align);
  const withAttrs: SerializedTag = { ...tag, attrs };
  return `${openTag(withAttrs)}${serializeInline(block, registry)}${closeTag(withAttrs)}`;
}

/** Merge a `text-align` declaration into a block tag's inline style, if the block is aligned. */
function withAlignment(
  attrs: Record<string, string>,
  align: BlockNode['align'],
): Record<string, string> {
  if (!align || align === 'left') {
    return attrs;
  }
  const existing = attrs.style ? `${attrs.style.replace(/;\s*$/, '')}; ` : '';
  return { ...attrs, style: `${existing}text-align: ${align}` };
}

type ListKind = 'ul' | 'ol';

/** Serialize a document to HTML, grouping consecutive list-item blocks into <ul>/<ol>. */
export function documentToHtml(
  doc: RichTextDocument,
  registry: TagRegistry = defaultTagRegistry,
): string {
  let out = '';
  const stack: ListKind[] = [];
  const closeTo = (depth: number) => {
    while (stack.length > depth) {
      out += `</${stack.pop()}>`;
    }
  };

  for (const block of doc.blocks) {
    const isListItem =
      block.listType === 'bullet' || block.listType === 'ordered' || block.listType === 'check';
    if (!isListItem) {
      closeTo(0);
      out += serializeBlock(block, registry);
      continue;
    }

    // Bullet and checklist both use <ul>; checklist items carry data-checked.
    const want: ListKind = block.listType === 'ordered' ? 'ol' : 'ul';
    const depth = block.listDepth ?? 0;
    closeTo(depth + 1);
    if (stack.length === depth + 1 && stack[stack.length - 1] !== want) {
      closeTo(depth);
    }
    while (stack.length < depth + 1) {
      out += `<${want}>`;
      stack.push(want);
    }
    const liAttrs =
      block.listType === 'check' ? ` data-checked="${block.checked ? 'true' : 'false'}"` : '';
    out += `<li${liAttrs}>${serializeInline(block, registry)}</li>`;
  }
  closeTo(0);
  return out;
}
