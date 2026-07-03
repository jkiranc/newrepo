import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { EditableTable } from './EditableTable/EditableTable';
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

type LatestValue = RichTextDocument | { rows: string[][]; header: boolean };

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
      style,
    } = props;

    const initialSegments = useMemo(
      () => htmlToSegments(initialHtml ?? '', registry),
      // Seed once.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    const [segments, setSegments] = useState<Segment[]>(initialSegments);

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
        latest.current.set(seg.id, seg.type === 'text' ? seg.doc : { rows: seg.rows, header: seg.header });
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
          const t = l as { rows: string[][]; header: boolean };
          return { ...seg, rows: t.rows, header: t.header };
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
      (id: string, rows: string[][], header: boolean) => {
        latest.current.set(id, { rows, header });
        emitHtml(segmentsRef.current);
      },
      [emitHtml],
    );

    const insertTable = useCallback(
      (rows = 2, cols = 2) => {
        const table = newTableSegment(rows, cols, true);
        const trailing = newTextSegment();
        latest.current.set(table.id, { rows: table.rows, header: table.header });
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
            const t = l as { rows: string[][]; header: boolean };
            return { ...seg, rows: t.rows, header: t.header };
          });
          return segmentsToHtml(merged, registry);
        },
        setHTML: (html) => {
          const segs = htmlToSegments(html, registry);
          latest.current.clear();
          activeTextId.current = null;
          for (const seg of segs) {
            latest.current.set(seg.id, seg.type === 'text' ? seg.doc : { rows: seg.rows, header: seg.header });
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
              editable={editable}
              onFocus={() => {
                activeTextId.current = null;
              }}
              onChange={(rows, header) => handleTableChange(seg.id, rows, header)}
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
              }}
              onChangeDoc={(doc) => handleTextChange(seg.id, doc)}
              onSelectionActiveStyles={(activeStyles) =>
                onSelectionChange?.({ blockId: seg.id, start: 0, end: 0, activeStyles })
              }
              onEmbedPress={onEmbedPress}
            />
          ),
        )}
      </View>
    );
  },
);

/** Parse HTML to the native document model (exposed for advanced/programmatic use). */
export function htmlToRichTextDocument(html: string, registry?: TagRegistry) {
  return htmlToDocument(html, registry);
}

const styles = StyleSheet.create({
  container: {
    minHeight: 120,
  },
});
