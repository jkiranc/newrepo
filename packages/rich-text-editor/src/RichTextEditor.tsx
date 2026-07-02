import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import RichTextEditorView, {
  Commands,
  type NativeProps,
} from './RichTextEditorNativeComponent';
import { htmlToDocument } from './html/nativeBridge';
import { documentToHtml } from './html/serializer';
import { defaultTagRegistry, TagRegistry } from './registry/TagRegistry';
import {
  EMPTY_DOCUMENT,
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
  /** The tag registry to use for HTML ⇄ document translation. Defaults to the global one. */
  registry?: TagRegistry;
  /** Called (debounced) whenever content changes, with the serialized HTML. */
  onChangeHtml?: (html: string) => void;
  onSelectionChange?: (selection: SelectionChange) => void;
  onEmbedPress?: (tag: string, data: Record<string, string>) => void;
  style?: StyleProp<ViewStyle>;
}

/** Imperative handle for toolbars and programmatic control. */
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
  /** Set the selection's text color as `#RRGGBB`; pass null/'' to clear. */
  setTextColor: (color: string | null) => void;
  /** Set the selection's link href; pass null/'' to remove the link. */
  setLink: (url: string | null) => void;
  /** Adjust the current paragraph's indent by `delta` (e.g. +1 / -1). */
  adjustIndent: (delta: number) => void;
  /** Toggle the current paragraph's list type ('bullet' | 'ordered' | 'check' | 'none'). */
  toggleList: (listType: ListType) => void;
  /** Insert plain text (e.g. an emoji) at the caret. */
  insertText: (text: string) => void;
  /** Insert an image embed by URL at the caret. */
  insertImage: (src: string) => void;
  insertEmbed: (embed: EmbedPlaceholder) => void;
  undo: () => void;
  redo: () => void;
}

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

    const nativeRef = useRef<React.ComponentRef<typeof RichTextEditorView>>(null);
    // Cache of the latest document so getHTML() is synchronous (no native round trip).
    const latestDoc = useRef<RichTextDocument>(EMPTY_DOCUMENT);
    // Undo/redo history of serialized documents (no native undo API needed).
    const history = useRef<string[]>([]);
    const historyIndex = useRef(-1);
    const isRestoring = useRef(false);

    const initialDocumentJson = useMemo(() => {
      const doc = initialHtml ? htmlToDocument(initialHtml, registry) : EMPTY_DOCUMENT;
      latestDoc.current = doc;
      const json = JSON.stringify(doc);
      history.current = [json];
      historyIndex.current = 0;
      return json;
    }, [initialHtml, registry]);

    const handleDocumentChange = useCallback<NonNullable<NativeProps['onDocumentChange']>>(
      (event) => {
        try {
          const json = event.nativeEvent.documentJson;
          const doc = JSON.parse(json) as RichTextDocument;
          latestDoc.current = doc;
          if (isRestoring.current) {
            isRestoring.current = false;
          } else {
            // Record a new history entry, discarding any redo tail, capped at 100.
            const next = history.current.slice(0, historyIndex.current + 1);
            next.push(json);
            if (next.length > 100) {
              next.shift();
            }
            history.current = next;
            historyIndex.current = next.length - 1;
          }
          onChangeHtml?.(documentToHtml(doc, registry));
        } catch {
          // Ignore malformed payloads rather than crashing the editor.
        }
      },
      [onChangeHtml, registry],
    );

    const restoreSnapshot = useCallback(
      (json: string) => {
        if (!nativeRef.current) {
          return;
        }
        isRestoring.current = true;
        latestDoc.current = JSON.parse(json) as RichTextDocument;
        Commands.setDocument(nativeRef.current, json);
        onChangeHtml?.(documentToHtml(latestDoc.current, registry));
      },
      [onChangeHtml, registry],
    );

    const handleSelectionChange = useCallback<
      NonNullable<NativeProps['onSelectionChange']>
    >(
      (event) => {
        const { blockId, start, end, activeStyles } = event.nativeEvent;
        onSelectionChange?.({
          blockId,
          start,
          end,
          activeStyles: activeStyles
            ? (activeStyles.split(',').filter(Boolean) as InlineStyleName[])
            : [],
        });
      },
      [onSelectionChange],
    );

    const handleEmbedPress = useCallback<NonNullable<NativeProps['onEmbedPress']>>(
      (event) => {
        let data: Record<string, string> = {};
        try {
          data = JSON.parse(event.nativeEvent.dataJson) as Record<string, string>;
        } catch {
          // keep empty
        }
        onEmbedPress?.(event.nativeEvent.tag, data);
      },
      [onEmbedPress],
    );

    useImperativeHandle(
      ref,
      (): RichTextEditorRef => ({
        focus: () => nativeRef.current && Commands.focus(nativeRef.current),
        blur: () => nativeRef.current && Commands.blur(nativeRef.current),
        getHTML: () => documentToHtml(latestDoc.current, registry),
        setHTML: (html) => {
          const doc = htmlToDocument(html, registry);
          latestDoc.current = doc;
          if (nativeRef.current) {
            Commands.setDocument(nativeRef.current, JSON.stringify(doc));
          }
        },
        toggleInlineStyle: (s) =>
          nativeRef.current && Commands.toggleInlineStyle(nativeRef.current, s),
        toggleBold: () =>
          nativeRef.current && Commands.toggleInlineStyle(nativeRef.current, 'bold'),
        toggleItalic: () =>
          nativeRef.current && Commands.toggleInlineStyle(nativeRef.current, 'italic'),
        toggleUnderline: () =>
          nativeRef.current && Commands.toggleInlineStyle(nativeRef.current, 'underline'),
        toggleStrikethrough: () =>
          nativeRef.current &&
          Commands.toggleInlineStyle(nativeRef.current, 'strikethrough'),
        setBlockType: (tag) =>
          nativeRef.current && Commands.setBlockType(nativeRef.current, tag),
        setAlignment: (align) =>
          nativeRef.current && Commands.setAlignment(nativeRef.current, align),
        setTextColor: (color) =>
          nativeRef.current && Commands.setTextColor(nativeRef.current, color ?? ''),
        setLink: (url) =>
          nativeRef.current && Commands.setLink(nativeRef.current, url ?? ''),
        adjustIndent: (delta) =>
          nativeRef.current && Commands.adjustIndent(nativeRef.current, delta),
        toggleList: (listType) =>
          nativeRef.current && Commands.toggleList(nativeRef.current, listType),
        insertText: (text) =>
          nativeRef.current && Commands.insertText(nativeRef.current, text),
        insertImage: (src) => {
          if (!nativeRef.current) {
            return;
          }
          const embed: EmbedPlaceholder = {
            id: `img-${Date.now()}`,
            offset: 0,
            tag: 'img',
            kind: 'image',
            src,
            data: {},
          };
          Commands.insertEmbed(nativeRef.current, JSON.stringify(embed));
        },
        insertEmbed: (embed) =>
          nativeRef.current &&
          Commands.insertEmbed(nativeRef.current, JSON.stringify(embed)),
        undo: () => {
          if (historyIndex.current > 0) {
            historyIndex.current -= 1;
            restoreSnapshot(history.current[historyIndex.current]);
          }
        },
        redo: () => {
          if (historyIndex.current < history.current.length - 1) {
            historyIndex.current += 1;
            restoreSnapshot(history.current[historyIndex.current]);
          }
        },
      }),
      [registry, restoreSnapshot],
    );

    return (
      <RichTextEditorView
        ref={nativeRef}
        style={[styles.editor, style]}
        editable={editable}
        placeholder={placeholder}
        initialDocumentJson={initialDocumentJson}
        onDocumentChange={handleDocumentChange}
        onSelectionChange={handleSelectionChange}
        onEmbedPress={handleEmbedPress}
      />
    );
  },
);

const styles = StyleSheet.create({
  editor: {
    minHeight: 120,
  },
});
