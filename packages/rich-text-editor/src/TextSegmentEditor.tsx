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
import { type TagRegistry } from './registry/TagRegistry';
import {
  type Alignment,
  type EmbedPlaceholder,
  type InlineStyleName,
  type ListType,
  type RichTextDocument,
} from './types/nativeTypes';

/** Imperative handle for one text segment (the toolbar drives whichever is active). */
export interface TextSegmentRef {
  focus: () => void;
  blur: () => void;
  toggleInlineStyle: (style: InlineStyleName) => void;
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
  insertEmbed: (embed: EmbedPlaceholder) => void;
  undo: () => void;
  redo: () => void;
  /** Replace the whole buffer (used when a table insert splits a segment). */
  replaceDocument: (doc: RichTextDocument) => void;
  /** The latest known document for this segment. */
  getDocument: () => RichTextDocument;
}

export interface TextSegmentEditorProps {
  document: RichTextDocument;
  editable?: boolean;
  placeholder?: string;
  registry?: TagRegistry;
  onChangeDoc?: (doc: RichTextDocument) => void;
  onActive?: () => void;
  onSelectionActiveStyles?: (styles: InlineStyleName[]) => void;
  onEmbedPress?: (tag: string, data: Record<string, string>) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * A single flowing-text segment, backed by the native Fabric text view. This is the piece that
 * used to be the whole editor; the container ({@link RichTextEditor}) now stacks several of
 * these with editable tables in between.
 */
export const TextSegmentEditor = forwardRef<TextSegmentRef, TextSegmentEditorProps>(
  function TextSegmentEditor(props, ref) {
    const {
      document,
      editable = true,
      placeholder,
      onChangeDoc,
      onActive,
      onSelectionActiveStyles,
      onEmbedPress,
      style,
    } = props;

    const nativeRef = useRef<React.ComponentRef<typeof RichTextEditorView>>(null);
    const latestDoc = useRef<RichTextDocument>(document);
    const history = useRef<string[]>([]);
    const historyIndex = useRef(-1);
    const isRestoring = useRef(false);

    const initialDocumentJson = useMemo(() => {
      latestDoc.current = document;
      const json = JSON.stringify(document);
      history.current = [json];
      historyIndex.current = 0;
      return json;
      // Seed once from the initial document; later updates come through commands.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleDocumentChange = useCallback<NonNullable<NativeProps['onDocumentChange']>>(
      (event) => {
        try {
          const json = event.nativeEvent.documentJson;
          const doc = JSON.parse(json) as RichTextDocument;
          latestDoc.current = doc;
          if (isRestoring.current) {
            isRestoring.current = false;
          } else {
            const next = history.current.slice(0, historyIndex.current + 1);
            next.push(json);
            if (next.length > 100) next.shift();
            history.current = next;
            historyIndex.current = next.length - 1;
          }
          onChangeDoc?.(doc);
        } catch {
          // Ignore malformed payloads.
        }
      },
      [onChangeDoc],
    );

    const restoreSnapshot = useCallback(
      (json: string) => {
        if (!nativeRef.current) return;
        isRestoring.current = true;
        latestDoc.current = JSON.parse(json) as RichTextDocument;
        Commands.setDocument(nativeRef.current, json);
        onChangeDoc?.(latestDoc.current);
      },
      [onChangeDoc],
    );

    const handleSelectionChange = useCallback<
      NonNullable<NativeProps['onSelectionChange']>
    >(
      (event) => {
        onActive?.();
        const { activeStyles } = event.nativeEvent;
        onSelectionActiveStyles?.(
          activeStyles ? (activeStyles.split(',').filter(Boolean) as InlineStyleName[]) : [],
        );
      },
      [onActive, onSelectionActiveStyles],
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
      (): TextSegmentRef => ({
        focus: () => nativeRef.current && Commands.focus(nativeRef.current),
        blur: () => nativeRef.current && Commands.blur(nativeRef.current),
        toggleInlineStyle: (s) =>
          nativeRef.current && Commands.toggleInlineStyle(nativeRef.current, s),
        setBlockType: (tag) =>
          nativeRef.current && Commands.setBlockType(nativeRef.current, tag),
        setAlignment: (align) =>
          nativeRef.current && Commands.setAlignment(nativeRef.current, align),
        setTextColor: (color) =>
          nativeRef.current && Commands.setTextColor(nativeRef.current, color ?? ''),
        setLink: (url) => nativeRef.current && Commands.setLink(nativeRef.current, url ?? ''),
        insertLink: (text, url) =>
          nativeRef.current && Commands.insertLink(nativeRef.current, text, url),
        setFontSize: (size) =>
          nativeRef.current && Commands.setFontSize(nativeRef.current, size ?? 0),
        adjustIndent: (delta) =>
          nativeRef.current && Commands.adjustIndent(nativeRef.current, delta),
        toggleList: (listType) =>
          nativeRef.current && Commands.toggleList(nativeRef.current, listType),
        insertText: (text) =>
          nativeRef.current && Commands.insertText(nativeRef.current, text),
        insertImage: (src) => {
          if (!nativeRef.current) return;
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
          nativeRef.current && Commands.insertEmbed(nativeRef.current, JSON.stringify(embed)),
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
        replaceDocument: (doc) => {
          if (!nativeRef.current) return;
          isRestoring.current = true;
          latestDoc.current = doc;
          Commands.setDocument(nativeRef.current, JSON.stringify(doc));
          onChangeDoc?.(doc);
        },
        getDocument: () => latestDoc.current,
      }),
      [restoreSnapshot, onChangeDoc],
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
    minHeight: 60,
  },
});
