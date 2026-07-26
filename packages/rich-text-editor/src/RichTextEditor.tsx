import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { EditableTable, type EditableTableState } from './EditableTable/EditableTable';
import { TextSegmentEditor, type TextSegmentRef } from './TextSegmentEditor';
import { htmlToDocument } from './html/nativeBridge';
import {
  htmlToSegments,
  newTableSegment,
  newTextSegment,
  segmentsToHtml,
  type Segment,
} from './html/segments';
import { defaultTagRegistry, TagRegistry } from './registry/TagRegistry';
import {
  type Alignment,
  type EmbedPlaceholder,
  type InlineStyleName,
  type ListType,
  type RichTextDocument,
} from './types/nativeTypes';

export interface SelectionChange {
  blockId: string;
  start: number;
  end: number;
  activeStyles: InlineStyleName[];
  /** The caret's block tag (`p`, `h1`…), so a toolbar can show the real current block. */
  blockTag: string;
  /** The caret's paragraph alignment. */
  align: Alignment;
  /** The caret's list type, or `''` when the paragraph isn't a list item. */
  listType: string;
}

export interface RichTextEditorProps {
  /** Initial HTML content (applied once on mount). */
  initialHtml?: string;
  editable?: boolean;
  placeholder?: string;
  registry?: TagRegistry;
  /** Called whenever any segment (text or table) changes, with the reassembled HTML. */
  onChangeHtml?: (html: string) => void;
  onSelectionChange?: (selection: SelectionChange) => void;
  onEmbedPress?: (tag: string, data: Record<string, string>) => void;
  /**
   * Called when a link is tapped. Return `true` to handle it yourself and suppress the built-in
   * Open / Edit / Remove popover.
   */
  onLinkPress?: (url: string, start: number, end: number) => boolean | void;
  style?: StyleProp<ViewStyle>;
}

/** Imperative handle for toolbars and programmatic control. Delegates to the active segment. */
export interface RichTextEditorRef {
  focus: () => void;
  blur: () => void;
  getHTML: () => string;
  setHTML: (html: string) => void;
  toggleInlineStyle: (style: InlineStyleName) => void;
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  toggleStrikethrough: () => void;
  setBlockType: (tag: string) => void;
  setAlignment: (align: Alignment) => void;
  setTextColor: (color: string | null) => void;
  setLink: (url: string | null) => void;
  insertLink: (text: string, url: string) => void;
  setFontSize: (size: number | null) => void;
  adjustIndent: (delta: number) => void;
  toggleList: (listType: ListType) => void;
  insertText: (text: string) => void;
  insertImage: (src: string) => void;
  /** Insert a new editable table block after the active text segment. */
  insertTable: (rows?: number, cols?: number) => void;
  insertEmbed: (embed: EmbedPlaceholder) => void;
  undo: () => void;
  redo: () => void;
}

type TableLatest = { rows: string[][]; header: boolean; headerColumn: boolean };
type LatestValue = RichTextDocument | TableLatest;

export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  function RichTextEditor(props, ref) {
    const {
      initialHtml,
      editable = true,
      placeholder,
      registry = defaultTagRegistry,
      onChangeHtml,
      onSelectionChange,
      onEmbedPress,
      onLinkPress,
      style,
    } = props;

    const initialSegments = useMemo(
      () => htmlToSegments(initialHtml ?? '', registry),
      // Seed once.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    const [segments, setSegments] = useState<Segment[]>(initialSegments);
    // Which table segment currently has a focused cell (so only that table shows its controls).
    const [activeTableId, setActiveTableId] = useState<string | null>(null);
    // A tapped link awaiting an Open / Edit / Remove choice (null = popover closed).
    const [linkAction, setLinkAction] = useState<
      { segId: string; url: string; start: number; end: number } | null
    >(null);
    const [linkEditing, setLinkEditing] = useState(false);

    // Per-segment refs and latest content (kept out of state so keystrokes don't re-render).
    const segRefs = useRef(new Map<string, TextSegmentRef | null>());
    const latest = useRef(new Map<string, LatestValue>());
    const activeTextId = useRef<string | null>(null);
    // Mirror of `segments` for reading current order inside change callbacks without stale state.
    const segmentsRef = useRef<Segment[]>(initialSegments);
    const applySegments = useCallback((next: Segment[]) => {
      segmentsRef.current = next;
      setSegments(next);
    }, []);

    // Seed `latest` and the initial active segment on first render.
    useMemo(() => {
      for (const seg of initialSegments) {
        latest.current.set(seg.id, seg.type === 'text' ? seg.doc : { rows: seg.rows, header: seg.header, headerColumn: seg.headerColumn });
        if (seg.type === 'text' && activeTextId.current == null) {
          activeTextId.current = seg.id;
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const emitHtml = useCallback(
      (segs: Segment[]) => {
        const merged: Segment[] = segs.map((seg) => {
          const l = latest.current.get(seg.id);
          if (!l) return seg;
          if (seg.type === 'text') return { ...seg, doc: l as RichTextDocument };
          const t = l as TableLatest;
          return { ...seg, rows: t.rows, header: t.header, headerColumn: t.headerColumn };
        });
        onChangeHtml?.(segmentsToHtml(merged, registry));
      },
      [onChangeHtml, registry],
    );

    const active = () =>
      activeTextId.current ? segRefs.current.get(activeTextId.current) ?? null : null;

    const handleTextChange = useCallback(
      (id: string, doc: RichTextDocument) => {
        latest.current.set(id, doc);
        emitHtml(segmentsRef.current);
      },
      [emitHtml],
    );

    const handleTableChange = useCallback(
      (id: string, state: EditableTableState) => {
        latest.current.set(id, state);
        emitHtml(segmentsRef.current);
      },
      [emitHtml],
    );

    const insertTable = useCallback(
      (rows = 2, cols = 2) => {
        const table = newTableSegment(rows, cols, true);
        const trailing = newTextSegment();
        latest.current.set(table.id, {
          rows: table.rows,
          header: table.header,
          headerColumn: table.headerColumn,
        });
        latest.current.set(trailing.id, trailing.doc);
        // Insert the table (and a text segment to type after it) right after the active segment.
        const prev = segmentsRef.current;
        const idx = prev.findIndex((s) => s.id === activeTextId.current);
        const at = idx >= 0 ? idx + 1 : prev.length;
        const next = [...prev.slice(0, at), table, trailing, ...prev.slice(at)];
        activeTextId.current = trailing.id;
        applySegments(next);
        emitHtml(next);
      },
      [emitHtml, applySegments],
    );

    const removeSegment = useCallback(
      (id: string) => {
        const prev = segmentsRef.current;
        const idx = prev.findIndex((s) => s.id === id);
        if (idx < 0) return;
        latest.current.delete(id);
        let next = [...prev.slice(0, idx), ...prev.slice(idx + 1)];

        // If the removed segment sat between two text segments, merge them into one so the
        // document doesn't fragment into two editors with a gap where the table was.
        const leftIdx = idx - 1;
        const rightIdx = idx; // the segment that shifted into the removed slot
        const left = next[leftIdx];
        const right = next[rightIdx];
        if (left?.type === 'text' && right?.type === 'text') {
          const leftDoc = (latest.current.get(left.id) as RichTextDocument | undefined) ?? left.doc;
          const rightDoc = (latest.current.get(right.id) as RichTextDocument | undefined) ?? right.doc;
          const mergedDoc: RichTextDocument = { blocks: [...leftDoc.blocks, ...rightDoc.blocks] };
          latest.current.set(left.id, mergedDoc);
          latest.current.delete(right.id);
          next = [...next.slice(0, rightIdx), ...next.slice(rightIdx + 1)];
          activeTextId.current = left.id;
          applySegments(next);
          // Load the combined content into the surviving (already-mounted) left editor.
          segRefs.current.get(left.id)?.replaceDocument(mergedDoc);
          emitHtml(next);
          return;
        }

        // No merge: make sure at least one text segment remains to type in.
        if (!next.some((s) => s.type === 'text')) {
          const t = newTextSegment();
          latest.current.set(t.id, t.doc);
          next = [...next, t];
        }
        activeTextId.current =
          (next.find((s) => s.type === 'text')?.id) ?? activeTextId.current;
        applySegments(next);
        emitHtml(next);
      },
      [emitHtml, applySegments],
    );

    useImperativeHandle(
      ref,
      (): RichTextEditorRef => ({
        focus: () => active()?.focus(),
        blur: () => active()?.blur(),
        getHTML: () => {
          const merged: Segment[] = segments.map((seg) => {
            const l = latest.current.get(seg.id);
            if (!l) return seg;
            if (seg.type === 'text') return { ...seg, doc: l as RichTextDocument };
            const t = l as TableLatest;
            return { ...seg, rows: t.rows, header: t.header, headerColumn: t.headerColumn };
          });
          return segmentsToHtml(merged, registry);
        },
        setHTML: (html) => {
          const segs = htmlToSegments(html, registry);
          latest.current.clear();
          activeTextId.current = null;
          for (const seg of segs) {
            latest.current.set(seg.id, seg.type === 'text' ? seg.doc : { rows: seg.rows, header: seg.header, headerColumn: seg.headerColumn });
            if (seg.type === 'text' && activeTextId.current == null) activeTextId.current = seg.id;
          }
          applySegments(segs);
        },
        toggleInlineStyle: (s) => active()?.toggleInlineStyle(s),
        toggleBold: () => active()?.toggleInlineStyle('bold'),
        toggleItalic: () => active()?.toggleInlineStyle('italic'),
        toggleUnderline: () => active()?.toggleInlineStyle('underline'),
        toggleStrikethrough: () => active()?.toggleInlineStyle('strikethrough'),
        setBlockType: (tag) => active()?.setBlockType(tag),
        setAlignment: (align) => active()?.setAlignment(align),
        setTextColor: (color) => active()?.setTextColor(color),
        setLink: (url) => active()?.setLink(url),
        insertLink: (text, url) => active()?.insertLink(text, url),
        setFontSize: (size) => active()?.setFontSize(size),
        adjustIndent: (delta) => active()?.adjustIndent(delta),
        toggleList: (listType) => active()?.toggleList(listType),
        insertText: (text) => active()?.insertText(text),
        insertImage: (src) => active()?.insertImage(src),
        insertTable,
        insertEmbed: (embed) => active()?.insertEmbed(embed),
        undo: () => active()?.undo(),
        redo: () => active()?.redo(),
      }),
      [segments, registry, insertTable, applySegments],
    );

    return (
      <View style={[styles.container, style]}>
        {segments.map((seg) =>
          seg.type === 'table' ? (
            <EditableTable
              key={seg.id}
              rows={seg.rows}
              header={seg.header}
              headerColumn={seg.headerColumn}
              editable={editable}
              active={activeTableId === seg.id}
              onFocus={() => {
                activeTextId.current = null;
                setActiveTableId(seg.id);
              }}
              onChange={(state) => handleTableChange(seg.id, state)}
              onDelete={() => removeSegment(seg.id)}
            />
          ) : (
            <TextSegmentEditor
              key={seg.id}
              ref={(r) => {
                segRefs.current.set(seg.id, r);
              }}
              document={seg.doc}
              editable={editable}
              placeholder={placeholder}
              registry={registry}
              onActive={() => {
                activeTextId.current = seg.id;
                setActiveTableId(null);
              }}
              onChangeDoc={(doc) => handleTextChange(seg.id, doc)}
              onSelectionActiveStyles={(activeStyles, block) =>
                onSelectionChange?.({
                  blockId: seg.id,
                  start: 0,
                  end: 0,
                  activeStyles,
                  blockTag: block.blockTag,
                  align: (block.align || 'left') as Alignment,
                  listType: block.listType,
                })
              }
              onEmbedPress={onEmbedPress}
              onLinkPress={(url, start, end) => {
                if (onLinkPress?.(url, start, end) === true) return;
                setLinkEditing(false);
                setLinkAction({ segId: seg.id, url, start, end });
              }}
            />
          ),
        )}

        <LinkActionPopover
          action={linkAction}
          editing={linkEditing}
          onOpen={(url) => {
            Linking.openURL(url).catch(() => {});
            setLinkAction(null);
          }}
          onStartEdit={() => setLinkEditing(true)}
          onSubmitEdit={(url) => {
            if (linkAction) {
              segRefs.current
                .get(linkAction.segId)
                ?.setLinkRange(linkAction.start, linkAction.end, url.trim() || null);
            }
            setLinkAction(null);
          }}
          onRemove={() => {
            if (linkAction) {
              segRefs.current
                .get(linkAction.segId)
                ?.setLinkRange(linkAction.start, linkAction.end, null);
            }
            setLinkAction(null);
          }}
          onClose={() => setLinkAction(null)}
        />
      </View>
    );
  },
);

/** A popover shown when a link is tapped: Open in browser, Edit the URL, or Remove the link. */
function LinkActionPopover({
  action,
  editing,
  onOpen,
  onStartEdit,
  onSubmitEdit,
  onRemove,
  onClose,
}: {
  action: { url: string; start: number; end: number } | null;
  editing: boolean;
  onOpen: (url: string) => void;
  onStartEdit: () => void;
  onSubmitEdit: (url: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  return (
    <Modal
      visible={action != null}
      transparent
      animationType="fade"
      onShow={() => setValue(action?.url ?? '')}
      onRequestClose={onClose}
    >
      <Pressable style={linkStyles.backdrop} onPress={onClose}>
        <Pressable style={linkStyles.card} onPress={() => {}}>
          {editing ? (
            <>
              <Text style={linkStyles.title}>Edit link</Text>
              <TextInput
                autoFocus
                value={value}
                onChangeText={setValue}
                placeholder="https://example.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={linkStyles.input}
              />
              <View style={linkStyles.row}>
                <TouchableOpacity accessibilityRole="button" onPress={onClose}>
                  <Text style={linkStyles.cancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" onPress={() => onSubmitEdit(value)}>
                  <Text style={linkStyles.ok}>Save</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={linkStyles.url} numberOfLines={1}>{action?.url}</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="link-open" style={linkStyles.item} onPress={() => onOpen(action?.url ?? '')}>
                <Text style={linkStyles.itemText}>🔗 Open</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="link-edit" style={linkStyles.item} onPress={onStartEdit}>
                <Text style={linkStyles.itemText}>✏️ Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="link-remove" style={linkStyles.item} onPress={onRemove}>
                <Text style={[linkStyles.itemText, linkStyles.danger]}>🗑 Remove</Text>
              </TouchableOpacity>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Parse HTML to the native document model (exposed for advanced/programmatic use). */
export function htmlToRichTextDocument(html: string, registry?: TagRegistry) {
  return htmlToDocument(html, registry);
}

const styles = StyleSheet.create({
  container: {
    minHeight: 120,
  },
});

const linkStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000033', justifyContent: 'center', padding: 32 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 8,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  url: { fontSize: 13, color: '#5F6368', paddingHorizontal: 16, paddingVertical: 8 },
  item: { paddingHorizontal: 16, paddingVertical: 12 },
  itemText: { fontSize: 16, color: '#222' },
  danger: { color: '#D93025' },
  title: { fontSize: 15, fontWeight: '600', color: '#333', paddingHorizontal: 16, paddingTop: 12 },
  input: {
    margin: 16,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#aaa',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    color: '#111',
  },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20, paddingHorizontal: 16, paddingBottom: 12 },
  cancel: { color: '#5F6368', fontSize: 15 },
  ok: { color: '#1A73E8', fontSize: 15, fontWeight: '600' },
});
