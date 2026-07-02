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
  insertEmbed: (embed: EmbedPlaceholder) => void;
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

    const initialDocumentJson = useMemo(() => {
      const doc = initialHtml ? htmlToDocument(initialHtml, registry) : EMPTY_DOCUMENT;
      latestDoc.current = doc;
      return JSON.stringify(doc);
    }, [initialHtml, registry]);

    const handleDocumentChange = useCallback<NonNullable<NativeProps['onDocumentChange']>>(
      (event) => {
        try {
          const doc = JSON.parse(event.nativeEvent.documentJson) as RichTextDocument;
          latestDoc.current = doc;
          onChangeHtml?.(documentToHtml(doc, registry));
        } catch {
          // Ignore malformed payloads rather than crashing the editor.
        }
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
        insertEmbed: (embed) =>
          nativeRef.current &&
          Commands.insertEmbed(nativeRef.current, JSON.stringify(embed)),
      }),
      [registry],
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
