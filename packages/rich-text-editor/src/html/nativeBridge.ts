import {
  OBJECT_REPLACEMENT_CHAR,
  type Alignment,
  type BlockNode,
  type EmbedPlaceholder,
  type ListType,
  type RichTextDocument,
  type StyleRun,
} from '../types/nativeTypes';
import { defaultTagRegistry, TagRegistry } from '../registry/TagRegistry';
import { parseInlineStyle } from '../registry/builtInTags';
// Side-effect import: ensures the built-in tags are installed on `defaultTagRegistry`
// whenever the bridge is used, even if the consumer never imports the package index.
import '../registry/builtInTags';
import { isElement, type HtmlNode } from './ast';
import { parseHtml } from './parser';

/** The subset of {@link StyleRun} that accumulates as we descend through inline elements. */
type RunStyle = Omit<StyleRun, 'start' | 'length'>;

interface IdCounter {
  block: number;
  embed: number;
}

const STYLE_KEYS: (keyof RunStyle)[] = [
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'superscript',
  'subscript',
  'color',
  'backgroundColor',
  'fontSize',
  'fontFamily',
  'link',
];

/** True if the accumulated style carries any actual styling (worth emitting a run for). */
function hasStyle(style: RunStyle): boolean {
  for (const key of STYLE_KEYS) {
    if (style[key] !== undefined) {
      return true;
    }
  }
  return style.data !== undefined && Object.keys(style.data).length > 0;
}

/** Merge an inline element's contribution onto the current accumulated style. */
function mergeStyle(base: RunStyle, add: Partial<StyleRun>, tag: string): RunStyle {
  const merged: RunStyle = { ...base, tag };
  for (const key of STYLE_KEYS) {
    if (add[key] !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (merged as any)[key] = add[key];
    }
  }
  if (add.data) {
    merged.data = { ...(base.data ?? {}), ...add.data };
  }
  return merged;
}

/** Compare two runs' styling (ignoring position) — used for coalescing. */
function sameStyle(a: StyleRun, b: StyleRun): boolean {
  for (const key of STYLE_KEYS) {
    if (a[key] !== b[key]) {
      return false;
    }
  }
  if (a.tag !== b.tag) {
    return false;
  }
  return JSON.stringify(a.data ?? {}) === JSON.stringify(b.data ?? {});
}

/** Merge adjacent, identically-styled runs so edits don't fragment output (see risk #5). */
export function coalesceRuns(runs: StyleRun[]): StyleRun[] {
  const sorted = [...runs].sort((x, y) => x.start - y.start);
  const out: StyleRun[] = [];
  for (const run of sorted) {
    const last = out[out.length - 1];
    if (last && last.start + last.length === run.start && sameStyle(last, run)) {
      last.length += run.length;
    } else {
      out.push({ ...run });
    }
  }
  return out;
}

/** A mutable block being assembled. */
interface BlockBuilder {
  id: string;
  tag: string;
  text: string;
  styleRuns: StyleRun[];
  embeds: EmbedPlaceholder[];
  listType?: ListType;
  listDepth?: number;
  listIndex?: number;
  indentLevel?: number;
  align?: Alignment;
  checked?: boolean;
  spacingBefore?: number;
  spacingAfter?: number;
  data?: Record<string, string>;
}

function newBlock(ids: IdCounter, partial: Partial<BlockNode>): BlockBuilder {
  const b: BlockBuilder = {
    id: `b${ids.block++}`,
    tag: partial.tag ?? 'p',
    text: '',
    styleRuns: [],
    embeds: [],
  };
  if (partial.indentLevel !== undefined) {
    b.indentLevel = partial.indentLevel;
  }
  if (partial.align !== undefined) {
    b.align = partial.align;
  }
  if (partial.spacingBefore !== undefined) {
    b.spacingBefore = partial.spacingBefore;
  }
  if (partial.spacingAfter !== undefined) {
    b.spacingAfter = partial.spacingAfter;
  }
  if (partial.data !== undefined) {
    b.data = partial.data;
  }
  return b;
}

function finalize(b: BlockBuilder): BlockNode {
  const node: BlockNode = {
    id: b.id,
    tag: b.tag,
    text: b.text,
    styleRuns: coalesceRuns(b.styleRuns),
  };
  if (b.embeds.length > 0) {
    node.embeds = [...b.embeds].sort((x, y) => x.offset - y.offset);
  }
  if (b.listType && b.listType !== 'none') {
    node.listType = b.listType;
    node.listDepth = b.listDepth ?? 0;
    if (b.listType === 'ordered') {
      node.listIndex = b.listIndex;
    }
  }
  if (b.indentLevel !== undefined) {
    node.indentLevel = b.indentLevel;
  }
  if (b.align !== undefined) {
    node.align = b.align;
  }
  if (b.checked !== undefined) {
    node.checked = b.checked;
  }
  if (b.spacingBefore !== undefined) {
    node.spacingBefore = b.spacingBefore;
  }
  if (b.spacingAfter !== undefined) {
    node.spacingAfter = b.spacingAfter;
  }
  if (b.data !== undefined) {
    node.data = b.data;
  }
  return node;
}

/** Collapse runs of HTML whitespace to a single space, matching rough HTML rendering. */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ');
}

function extractText(node: HtmlNode): string {
  if (!isElement(node)) {
    return node.text;
  }
  return node.children.map(extractText).join('');
}

function appendText(b: BlockBuilder, raw: string, style: RunStyle): void {
  const text = collapseWhitespace(raw);
  if (text.length === 0) {
    return;
  }
  const start = b.text.length;
  b.text += text;
  if (hasStyle(style)) {
    b.styleRuns.push({ start, length: text.length, ...style });
  }
}

function appendEmbed(
  b: BlockBuilder,
  node: HtmlNode,
  registry: TagRegistry,
  ids: IdCounter,
): void {
  if (!isElement(node)) {
    return;
  }
  const def = registry.get(node.tag);
  const partial = def?.toEmbed?.(node.attrs, extractText(node)) ?? {};
  const offset = b.text.length;
  b.text += OBJECT_REPLACEMENT_CHAR;
  b.embeds.push({
    id: `e${ids.embed++}`,
    offset,
    tag: node.tag,
    kind: partial.kind ?? 'chip',
    data: partial.data ?? {},
    ...partial,
  });
}

/** Walk inline-level children, applying accumulated style to text and recording embeds. */
function processInline(
  nodes: HtmlNode[],
  b: BlockBuilder,
  registry: TagRegistry,
  style: RunStyle,
  ids: IdCounter,
): void {
  for (const node of nodes) {
    if (!isElement(node)) {
      appendText(b, node.text, style);
      continue;
    }
    if (node.tag === 'br') {
      b.text += '\n';
      continue;
    }
    const def = registry.get(node.tag);
    if (def?.category === 'embed') {
      appendEmbed(b, node, registry, ids);
      continue;
    }
    if (def?.category === 'block') {
      // A block tag nested in inline flow (unusual) — flatten its inline content.
      processInline(node.children, b, registry, style, ids);
      continue;
    }
    // inline (known) or unknown element → merge style (unknown adds nothing) and descend.
    const add = def?.toStyleRun?.(node.attrs) ?? {};
    const merged = mergeStyle(style, add, node.tag);
    processInline(node.children, b, registry, merged, ids);
  }
}

function processList(
  node: HtmlNode,
  blocks: BlockNode[],
  registry: TagRegistry,
  listType: ListType,
  depth: number,
  ids: IdCounter,
): void {
  if (!isElement(node)) {
    return;
  }
  let index = 1;
  for (const child of node.children) {
    if (!isElement(child)) {
      continue;
    }
    if (child.tag === 'ul' || child.tag === 'ol') {
      processList(child, blocks, registry, child.tag === 'ol' ? 'ordered' : 'bullet', depth + 1, ids);
      continue;
    }
    if (child.tag !== 'li') {
      continue;
    }
    const def = registry.get('li');
    const b = newBlock(ids, def?.toBlock?.(child.attrs) ?? { tag: 'li' });
    // A `data-checked` attribute marks a checklist item regardless of the container tag.
    if (child.attrs['data-checked'] !== undefined) {
      b.listType = 'check';
      b.checked = child.attrs['data-checked'] === 'true';
    } else {
      b.listType = listType;
    }
    b.listDepth = depth;
    b.listIndex = index++;
    const nested: HtmlNode[] = [];
    for (const gc of child.children) {
      if (isElement(gc) && (gc.tag === 'ul' || gc.tag === 'ol')) {
        nested.push(gc);
      } else {
        processInline([gc], b, registry, emptyStyle(), ids);
      }
    }
    blocks.push(finalize(b));
    for (const n of nested) {
      const t: ListType = isElement(n) && n.tag === 'ol' ? 'ordered' : 'bullet';
      processList(n, blocks, registry, t, depth + 1, ids);
    }
  }
}

function emptyStyle(): RunStyle {
  return { tag: '' };
}

/** Build a read-only table embed from a `<table>` node, flattening cells to plain text. */
function tableEmbedFromNode(node: HtmlNode, ids: IdCounter): EmbedPlaceholder {
  const rows: string[][] = [];
  let header = false;
  const walkRows = (n: HtmlNode) => {
    if (!isElement(n)) {
      return;
    }
    for (const child of n.children) {
      if (!isElement(child)) {
        continue;
      }
      if (child.tag === 'thead' || child.tag === 'tbody' || child.tag === 'tfoot') {
        walkRows(child);
      } else if (child.tag === 'tr') {
        const cells: string[] = [];
        let rowHasHeader = false;
        for (const cell of child.children) {
          if (isElement(cell) && (cell.tag === 'td' || cell.tag === 'th')) {
            if (cell.tag === 'th') {
              rowHasHeader = true;
            }
            cells.push(collapseWhitespace(extractText(cell)).trim());
          }
        }
        if (rows.length === 0 && rowHasHeader) {
          header = true;
        }
        rows.push(cells);
      }
    }
  };
  walkRows(node);
  return {
    id: `e${ids.embed++}`,
    offset: 0,
    tag: 'table',
    kind: 'table',
    data: { rows: JSON.stringify(rows), header: header ? 'true' : 'false' },
  };
}

/** Build a block whose sole content is a read-only table embed. */
function tableBlock(node: HtmlNode, ids: IdCounter): BlockNode {
  const b = newBlock(ids, { tag: 'p' });
  b.text = OBJECT_REPLACEMENT_CHAR;
  b.embeds.push(tableEmbedFromNode(node, ids));
  return finalize(b);
}

/** Read a `text-align` value (from the `style` attr or `align` attr) into an Alignment. */
function alignmentFromAttrs(attrs: Record<string, string>): Alignment | undefined {
  const css = parseInlineStyle(attrs.style);
  const value = (css['text-align'] ?? attrs.align ?? '').toLowerCase();
  if (value === 'center' || value === 'right' || value === 'justify' || value === 'left') {
    return value;
  }
  return undefined;
}

/** Walk block-level flow, grouping loose inline content into implicit paragraphs. */
function processFlow(
  nodes: HtmlNode[],
  blocks: BlockNode[],
  registry: TagRegistry,
  ids: IdCounter,
): void {
  let pending: BlockBuilder | null = null;
  const flush = () => {
    if (pending && (pending.text.length > 0 || pending.embeds.length > 0)) {
      blocks.push(finalize(pending));
    }
    pending = null;
  };

  for (const node of nodes) {
    if (!isElement(node)) {
      if (node.text.trim().length === 0 && !pending) {
        continue;
      }
      pending ??= newBlock(ids, { tag: 'p' });
      appendText(pending, node.text, emptyStyle());
      continue;
    }

    if (node.tag === 'ul' || node.tag === 'ol') {
      flush();
      processList(node, blocks, registry, node.tag === 'ol' ? 'ordered' : 'bullet', 0, ids);
      continue;
    }

    if (node.tag === 'table') {
      flush();
      blocks.push(tableBlock(node, ids));
      continue;
    }

    const def = registry.get(node.tag);
    if (def?.category === 'block') {
      flush();
      const b = newBlock(ids, def.toBlock?.(node.attrs) ?? { tag: node.tag });
      const align = alignmentFromAttrs(node.attrs);
      if (align) {
        b.align = align;
      }
      processInline(node.children, b, registry, emptyStyle(), ids);
      blocks.push(finalize(b));
      continue;
    }

    // inline / embed / unknown at top level → accumulate into an implicit paragraph.
    pending ??= newBlock(ids, { tag: 'p' });
    processInline([node], pending, registry, emptyStyle(), ids);
  }
  flush();
}

/** Convert a parsed HTML AST into the native {@link RichTextDocument}. */
export function astToDocument(
  nodes: HtmlNode[],
  registry: TagRegistry = defaultTagRegistry,
): RichTextDocument {
  const blocks: BlockNode[] = [];
  const ids: IdCounter = { block: 0, embed: 0 };
  processFlow(nodes, blocks, registry, ids);
  return { blocks };
}

/** Parse an HTML string and convert it to the native {@link RichTextDocument}. */
export function htmlToDocument(
  html: string,
  registry: TagRegistry = defaultTagRegistry,
): RichTextDocument {
  return astToDocument(parseHtml(html), registry);
}
