import type * as React from 'react';
import type { HostComponent, ViewProps } from 'react-native';
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';
import codegenNativeCommands from 'react-native/Libraries/Utilities/codegenNativeCommands';
import type {
  DirectEventHandler,
  Int32,
} from 'react-native/Libraries/Types/CodegenTypes';

/**
 * Fabric codegen spec — the single source of truth for the native view on both platforms.
 *
 * The document crosses the bridge as a JSON string (`*Json` fields), deliberately avoiding
 * Fabric codegen's immature support for dynamic-keyed / deeply-nested prop structs, which we
 * need for custom-tag `data` maps. See docs/architecture.md.
 */
export interface NativeProps extends ViewProps {
  /** A serialized {@link RichTextDocument}, applied once to seed the native buffer on mount. */
  initialDocumentJson?: string;
  editable?: boolean;
  placeholder?: string;

  /** Fires (debounced) whenever the native buffer changes; payload is a serialized document. */
  onDocumentChange?: DirectEventHandler<Readonly<{ documentJson: string }>>;
  /** Fires when the caret/selection moves. `activeStyles` is a comma-joined list. */
  onSelectionChange?: DirectEventHandler<
    Readonly<{ blockId: string; start: Int32; end: Int32; activeStyles: string }>
  >;
  /** Fires when an embed (image/chip) is tapped; `dataJson` is the embed's serialized data. */
  onEmbedPress?: DirectEventHandler<Readonly<{ tag: string; dataJson: string }>>;
}

// Fabric codegen requires each command's first argument to be written literally as
// `React.ElementRef<...>` — a type alias is not resolved by the codegen parser.
interface NativeCommands {
  /** Replace the entire buffer with a serialized {@link RichTextDocument}. */
  setDocument: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    documentJson: string,
  ) => void;
  focus: (viewRef: React.ElementRef<HostComponent<NativeProps>>) => void;
  blur: (viewRef: React.ElementRef<HostComponent<NativeProps>>) => void;
  /** Toggle an inline style ('bold' | 'italic' | 'underline' | 'strikethrough'). */
  toggleInlineStyle: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    style: string,
  ) => void;
  /** Set the current block's type ('p' | 'h1'..'h6' | 'blockquote' | 'pre'). */
  setBlockType: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    tag: string,
  ) => void;
  /** Set the current paragraph's alignment ('left' | 'center' | 'right' | 'justify'). */
  setAlignment: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    align: string,
  ) => void;
  /** Set the selection's text color as `#RRGGBB` (empty string clears it). */
  setTextColor: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    color: string,
  ) => void;
  /** Set the selection's link href (empty string removes the link). */
  setLink: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    url: string,
  ) => void;
  /** Adjust the current paragraph's indent level by `delta` (e.g. +1 or -1). */
  adjustIndent: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    delta: Int32,
  ) => void;
  /** Toggle the current paragraph's list type ('bullet' | 'ordered' | 'check' | 'none'). */
  toggleList: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    listType: string,
  ) => void;
  /** Insert plain text (e.g. an emoji) at the caret. */
  insertText: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    text: string,
  ) => void;
  /** Insert a serialized {@link EmbedPlaceholder} at the current caret position. */
  insertEmbed: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    embedJson: string,
  ) => void;
}

export const Commands: NativeCommands = codegenNativeCommands<NativeCommands>({
  supportedCommands: [
    'setDocument',
    'focus',
    'blur',
    'toggleInlineStyle',
    'setBlockType',
    'setAlignment',
    'setTextColor',
    'setLink',
    'adjustIndent',
    'toggleList',
    'insertText',
    'insertEmbed',
  ],
});

export default codegenNativeComponent<NativeProps>(
  'RichTextEditorView',
) as HostComponent<NativeProps>;
