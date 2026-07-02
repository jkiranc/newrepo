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

type ComponentRef = React.ElementRef<HostComponent<NativeProps>>;

interface NativeCommands {
  /** Replace the entire buffer with a serialized {@link RichTextDocument}. */
  setDocument: (viewRef: ComponentRef, documentJson: string) => void;
  focus: (viewRef: ComponentRef) => void;
  blur: (viewRef: ComponentRef) => void;
  /** Toggle an inline style ('bold' | 'italic' | 'underline' | 'strikethrough'). */
  toggleInlineStyle: (viewRef: ComponentRef, style: string) => void;
  /** Set the current block's type ('p' | 'h1'..'h6' | 'blockquote' | 'pre'). */
  setBlockType: (viewRef: ComponentRef, tag: string) => void;
  /** Insert a serialized {@link EmbedPlaceholder} at the current caret position. */
  insertEmbed: (viewRef: ComponentRef, embedJson: string) => void;
}

export const Commands: NativeCommands = codegenNativeCommands<NativeCommands>({
  supportedCommands: [
    'setDocument',
    'focus',
    'blur',
    'toggleInlineStyle',
    'setBlockType',
    'insertEmbed',
  ],
});

export default codegenNativeComponent<NativeProps>(
  'RichTextEditorView',
) as HostComponent<NativeProps>;
