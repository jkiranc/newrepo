// Public component + ref API
export { RichTextEditor } from './RichTextEditor';
export type {
  RichTextEditorProps,
  RichTextEditorRef,
  SelectionChange,
} from './RichTextEditor';

// Toolbar
export { Toolbar } from './Toolbar/Toolbar';
export type { ToolbarProps } from './Toolbar/Toolbar';

// Editable table block (rendered as its own segment between text)
export { EditableTable } from './EditableTable/EditableTable';
export type { EditableTableProps } from './EditableTable/EditableTable';

// Read-only HTML renderer (lightweight, pure-RN; for previews/feeds/messages)
export { RichTextViewer } from './RichTextViewer/RichTextViewer';
export type { RichTextViewerProps } from './RichTextViewer/RichTextViewer';

// Inline-blocks segmentation model (advanced use)
export {
  htmlToSegments,
  blocksToSegments,
  segmentsToHtml,
  type Segment,
  type TextSegment,
  type TableSegment,
} from './html/segments';

// Tag registry (the extension point)
export {
  TagRegistry,
  defaultTagRegistry,
  type TagDefinition,
  type TagCategory,
  type SerializedTag,
} from './registry/TagRegistry';
export { installBuiltInTags, parseInlineStyle } from './registry/builtInTags';

// HTML ⇄ document conversion (useful for advanced consumers / tooling)
export { htmlToDocument, astToDocument } from './html/nativeBridge';
export { documentToHtml } from './html/serializer';
export { parseHtml } from './html/parser';

// Native document model
export {
  OBJECT_REPLACEMENT_CHAR,
  EMPTY_DOCUMENT,
  type RichTextDocument,
  type BlockNode,
  type StyleRun,
  type EmbedPlaceholder,
  type ListType,
  type Alignment,
  type InlineStyleName,
} from './types/nativeTypes';
