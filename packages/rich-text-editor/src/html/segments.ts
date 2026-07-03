import {
  OBJECT_REPLACEMENT_CHAR,
  type BlockNode,
  type EmbedPlaceholder,
  type RichTextDocument,
} from '../types/nativeTypes';
import { defaultTagRegistry, TagRegistry } from '../registry/TagRegistry';
import { htmlToDocument } from './nativeBridge';
import { documentToHtml, rowsToTableHtml } from './serializer';

// -------------------------------------------------------------------------------------------
// Segments
//
// The inline-blocks model. A document is split into an ordered list of segments: runs of
// flowing text (each rendered by the native text editor) and tables (each an editable RN grid).
// Tables can't live inside the single native text view, so they become their own segments
// between text segments — this is what makes them truly editable.
// -------------------------------------------------------------------------------------------

export interface TextSegment {
  type: 'text';
  id: string;
  /** The sub-document rendered by one native text editor. */
  doc: RichTextDocument;
}

export interface TableSegment {
  type: 'table';
  id: string;
  rows: string[][];
  /** First row is a header. */
  header: boolean;
  /** First column is a header. */
  headerColumn: boolean;
}

export type Segment = TextSegment | TableSegment;

/** A block that is nothing but a single read-only/table embed. */
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

function parseRows(embed: EmbedPlaceholder): string[][] {
  try {
    const parsed = JSON.parse(embed.data?.rows ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => (Array.isArray(row) ? row.map((c) => String(c)) : []));
  } catch {
    return [];
  }
}

/** Group a flat block list into text/table segments, preserving order. */
export function blocksToSegments(blocks: BlockNode[]): Segment[] {
  const segments: Segment[] = [];
  let pending: BlockNode[] = [];
  let textId = 0;
  let tableId = 0;
  const flush = () => {
    if (pending.length > 0) {
      segments.push({ type: 'text', id: `t${textId++}`, doc: { blocks: pending } });
      pending = [];
    }
  };
  for (const block of blocks) {
    const embed = tableEmbedOf(block);
    if (embed) {
      flush();
      segments.push({
        type: 'table',
        id: `tbl${tableId++}`,
        rows: parseRows(embed),
        header: embed.data?.header === 'true',
        headerColumn: embed.data?.headerColumn === 'true',
      });
    } else {
      pending.push(block);
    }
  }
  flush();
  // Always keep at least one text segment so there is somewhere to type.
  if (segments.length === 0 || segments.every((s) => s.type === 'table')) {
    segments.push({ type: 'text', id: `t${textId++}`, doc: { blocks: [] } });
  }
  return segments;
}

export function htmlToSegments(
  html: string,
  registry: TagRegistry = defaultTagRegistry,
): Segment[] {
  return blocksToSegments(htmlToDocument(html, registry).blocks);
}

/** Reassemble the ordered segments back into a single HTML string. */
export function segmentsToHtml(
  segments: Segment[],
  registry: TagRegistry = defaultTagRegistry,
): string {
  return segments
    .map((seg) =>
      seg.type === 'table'
        ? rowsToTableHtml(seg.rows, seg.header, seg.headerColumn)
        : documentToHtml(seg.doc, registry),
    )
    .join('');
}

/** A fresh empty table segment (no placeholder text — starts blank). */
export function newTableSegment(rows = 2, cols = 2, header = true): TableSegment {
  return {
    type: 'table',
    id: `tbl-${Date.now()}`,
    rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => '')),
    header,
    headerColumn: false,
  };
}

/** A fresh empty text segment. */
export function newTextSegment(): TextSegment {
  return { type: 'text', id: `t-${Date.now()}`, doc: { blocks: [] } };
}
