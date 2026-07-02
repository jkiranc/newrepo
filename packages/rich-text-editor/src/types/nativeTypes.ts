/**
 * The native-friendly document model.
 *
 * These are the ONLY shapes the native (iOS/Android) layer understands. There is no notion
 * of an HTML "tag" here — tags are translated to/from these primitives entirely in JS by the
 * {@link TagRegistry}. That is what makes the tag vocabulary extensible without native code.
 */

/** The Unicode "object replacement character" used to mark an embed position within text. */
export const OBJECT_REPLACEMENT_CHAR = '￼';

/**
 * A contiguous run of inline styling applied over `[start, start + length)` (UTF-16 offsets)
 * within a {@link BlockNode.text}.
 */
export interface StyleRun {
  /** UTF-16 offset into the owning block's `text`. */
  start: number;
  /** Length in UTF-16 code units. */
  length: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  /** `#RRGGBB` or `#RRGGBBAA`. */
  color?: string;
  /** `#RRGGBB` or `#RRGGBBAA`. */
  backgroundColor?: string;
  fontSize?: number;
  fontFamily?: string;
  /** Link target (href). */
  link?: string;
  /**
   * The tag this run originated from (e.g. `"b"`, `"code"`, or a custom `"highlight"`).
   * Carried through so serialization can round-trip back to the right tag.
   */
  tag: string;
  /** Arbitrary custom attributes, e.g. `{ mentionId: "123" }`. */
  data?: Record<string, string>;
}

export type ListType = 'none' | 'bullet' | 'ordered' | 'check';

export type Alignment = 'left' | 'center' | 'right' | 'justify';

/**
 * A block-level container (paragraph, heading, list item, blockquote, code block, or a
 * custom block tag). Blocks are flat — nesting (e.g. lists) is expressed via
 * `listDepth` / `indentLevel` rather than a tree.
 */
export interface BlockNode {
  /** Stable id used to correlate selection/change events. */
  id: string;
  /** Originating block tag: `p`, `h1`–`h6`, `blockquote`, `li`, `pre`, or a custom tag. */
  tag: string;
  /** Plain text. Embed positions are represented inline by {@link OBJECT_REPLACEMENT_CHAR}. */
  text: string;
  styleRuns: StyleRun[];
  listType?: ListType;
  listDepth?: number;
  /** 1-based ordinal for ordered lists. */
  listIndex?: number;
  indentLevel?: number;
  /** Paragraph text alignment. */
  align?: Alignment;
  /** For `listType: 'check'` items — whether the checkbox is ticked. */
  checked?: boolean;
  spacingBefore?: number;
  spacingAfter?: number;
  /** Embeds positioned at the {@link OBJECT_REPLACEMENT_CHAR} offsets within `text`. */
  embeds?: EmbedPlaceholder[];
  data?: Record<string, string>;
}

/**
 * An inline embed drawn natively at a text position. v1 supports only natively-drawn embeds
 * (an image, or a rounded "chip"); live interactive RN subviews are a future stretch goal.
 */
export interface EmbedPlaceholder {
  id: string;
  /** UTF-16 offset of the {@link OBJECT_REPLACEMENT_CHAR} within the block's text. */
  offset: number;
  /** Originating tag, e.g. `"img"` or a custom `"mention"`. */
  tag: string;
  kind: 'image' | 'chip';
  width?: number;
  height?: number;
  /** For `kind: 'image'`. */
  src?: string;
  /** For `kind: 'chip'`. */
  label?: string;
  backgroundColor?: string;
  textColor?: string;
  cornerRadius?: number;
  data: Record<string, string>;
}

/** The full document — a flat list of blocks. This is what crosses the Fabric bridge (as JSON). */
export interface RichTextDocument {
  blocks: BlockNode[];
}

/** Inline style flags that a toolbar can toggle and that appear in `onSelectionChange`. */
export type InlineStyleName =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'superscript'
  | 'subscript';

export const EMPTY_DOCUMENT: RichTextDocument = { blocks: [] };
