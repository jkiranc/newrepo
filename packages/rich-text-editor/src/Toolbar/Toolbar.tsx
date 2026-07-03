import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { RichTextEditorRef } from '../RichTextEditor';
import type { Alignment, InlineStyleName } from '../types/nativeTypes';

export interface ToolbarProps {
  editorRef: React.RefObject<RichTextEditorRef | null>;
  /** Inline styles currently active at the caret (from `onSelectionChange`), for highlighting. */
  activeStyles?: InlineStyleName[];
  /** The current block's tag (e.g. 'p' | 'h1' | 'blockquote'), for the font dropdown label. */
  activeBlockType?: string;
  /** The current paragraph's alignment, for highlighting. */
  activeAlignment?: Alignment;
  /** Optional swatches for the color picker. Defaults to a small standard palette. */
  colors?: string[];
  /** Default unit for the font-size dropdown ('px' | 'pt'). Users can switch it live. */
  fontSizeUnit?: FontSizeUnit;
  style?: StyleProp<ViewStyle>;
}

type FontSizeUnit = 'px' | 'pt';

/** CSS reference: 1pt = 1/72in, 1px = 1/96in, so pt→px is ×96/72. */
const PT_TO_PX = 96 / 72;

const INLINE_BUTTONS: { label: string; style: InlineStyleName }[] = [
  { label: 'B', style: 'bold' },
  { label: 'I', style: 'italic' },
  { label: 'U', style: 'underline' },
  { label: 'S', style: 'strikethrough' },
  { label: 'x²', style: 'superscript' },
  { label: 'x₂', style: 'subscript' },
];

const BLOCK_OPTIONS: { label: string; tag: string }[] = [
  { label: 'Normal', tag: 'p' },
  { label: 'Heading 1', tag: 'h1' },
  { label: 'Heading 2', tag: 'h2' },
  { label: 'Heading 3', tag: 'h3' },
  { label: 'Heading 4', tag: 'h4' },
  { label: 'Heading 5', tag: 'h5' },
  { label: 'Heading 6', tag: 'h6' },
];

const FONT_SIZES = [10, 12, 14, 16, 18, 24, 32, 48];

const ALIGN_BUTTONS: { label: string; align: Alignment }[] = [
  { label: '⇤', align: 'left' },
  { label: '↔', align: 'center' },
  { label: '⇥', align: 'right' },
  { label: '☰', align: 'justify' },
];

const DEFAULT_COLORS = [
  '#000000', '#5F6368', '#9AA0A6', '#D93025', '#E8710A',
  '#F9AB00', '#1E8E3E', '#1A73E8', '#9334E6', '#D01884',
];

const EMOJIS = [
  '😀', '😂', '😍', '👍', '🙏', '🎉', '🔥', '💯', '✅', '❌',
  '⭐', '❤️', '😎', '🤔', '👀', '🚀', '💡', '📌', '⚠️', '👏',
];

/**
 * A formatting toolbar built entirely in JS on top of the editor's imperative ref: a font
 * dropdown (Normal + H1–H6), inline styles, paragraph alignment, and a color picker. Ships as
 * a convenience — consumers can build their own against the same ref.
 */
export function Toolbar({
  editorRef,
  activeStyles = [],
  activeBlockType = 'p',
  activeAlignment = 'left',
  colors = DEFAULT_COLORS,
  fontSizeUnit = 'px',
  style,
}: ToolbarProps) {
  const [fontOpen, setFontOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  // The px/pt unit is a fixed configuration (prop), not a user-facing toggle.
  const sizeUnit = fontSizeUnit;

  // Optimistic local state so the font label / alignment highlight update the moment the user
  // picks an option. Falls back to the (optional) props, which a consumer can drive from
  // onSelectionChange once that carries block info.
  const [currentBlock, setCurrentBlock] = useState(activeBlockType);
  const [currentAlign, setCurrentAlign] = useState(activeAlignment);
  useEffect(() => setCurrentBlock(activeBlockType), [activeBlockType]);
  useEffect(() => setCurrentAlign(activeAlignment), [activeAlignment]);

  const activeFontLabel =
    BLOCK_OPTIONS.find((o) => o.tag === currentBlock)?.label ?? 'Normal';

  return (
    <View style={[styles.bar, style]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {/* Font / block dropdown */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="font"
          style={styles.dropdown}
          onPress={() => setFontOpen(true)}
        >
          <Text style={styles.dropdownLabel} numberOfLines={1}>{activeFontLabel}</Text>
          <Text style={styles.caret}>▾</Text>
        </TouchableOpacity>

        {/* Font size dropdown */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="font-size"
          style={styles.dropdown}
          onPress={() => setSizeOpen(true)}
        >
          <Text style={styles.dropdownLabel} numberOfLines={1}>{`Size (${sizeUnit})`}</Text>
          <Text style={styles.caret}>▾</Text>
        </TouchableOpacity>

        <Divider />

        {INLINE_BUTTONS.map((b) => (
          <ToolbarButton
            key={b.style}
            label={b.label}
            active={activeStyles.includes(b.style)}
            accessibilityLabel={b.style}
            onPress={() => editorRef.current?.toggleInlineStyle(b.style)}
          />
        ))}

        <Divider />

        {ALIGN_BUTTONS.map((b) => (
          <ToolbarButton
            key={b.align}
            label={b.label}
            active={currentAlign === b.align}
            accessibilityLabel={`align-${b.align}`}
            onPress={() => {
              editorRef.current?.setAlignment(b.align);
              setCurrentAlign(b.align);
            }}
          />
        ))}

        <Divider />

        {/* Color picker trigger */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="text-color"
          style={styles.button}
          onPress={() => setColorOpen(true)}
        >
          <Text style={styles.label}>A</Text>
          <View style={styles.colorUnderline} />
        </TouchableOpacity>

        <Divider />

        <ToolbarButton label="•" active={false} accessibilityLabel="list-bullet" onPress={() => editorRef.current?.toggleList('bullet')} />
        <ToolbarButton label="1." active={false} accessibilityLabel="list-ordered" onPress={() => editorRef.current?.toggleList('ordered')} />
        <ToolbarButton label="☑" active={false} accessibilityLabel="list-check" onPress={() => editorRef.current?.toggleList('check')} />

        <Divider />

        <ToolbarButton label="🔗" active={false} accessibilityLabel="link" onPress={() => setLinkOpen(true)} />
        <ToolbarButton
          label="❝"
          active={currentBlock === 'blockquote'}
          accessibilityLabel="blockquote"
          onPress={() => {
            editorRef.current?.setBlockType('blockquote');
            setCurrentBlock('blockquote');
          }}
        />
        <ToolbarButton label="⇤|" active={false} accessibilityLabel="outdent" onPress={() => editorRef.current?.adjustIndent(-1)} />
        <ToolbarButton label="|⇥" active={false} accessibilityLabel="indent" onPress={() => editorRef.current?.adjustIndent(1)} />
        <ToolbarButton label="😊" active={false} accessibilityLabel="emoji" onPress={() => setEmojiOpen(true)} />
        <ToolbarButton label="▦" active={false} accessibilityLabel="table" onPress={() => setTableOpen(true)} />

        <Divider />

        <ToolbarButton label="↶" active={false} accessibilityLabel="undo" onPress={() => editorRef.current?.undo()} />
        <ToolbarButton label="↷" active={false} accessibilityLabel="redo" onPress={() => editorRef.current?.redo()} />
      </ScrollView>

      {/* Font dropdown menu */}
      <Popover visible={fontOpen} onClose={() => setFontOpen(false)}>
        {BLOCK_OPTIONS.map((o) => (
          <TouchableOpacity
            key={o.tag}
            accessibilityRole="menuitem"
            style={[styles.menuItem, currentBlock === o.tag && styles.menuItemActive]}
            onPress={() => {
              editorRef.current?.setBlockType(o.tag);
              setCurrentBlock(o.tag);
              setFontOpen(false);
            }}
          >
            <Text style={styles.menuLabel}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </Popover>

      {/* Font size menu. The unit (px/pt) is fixed by the fontSizeUnit prop; the document model
          is always stored in px, so a pt selection is converted before being applied. */}
      <Popover visible={sizeOpen} onClose={() => setSizeOpen(false)}>
        {FONT_SIZES.map((s) => (
          <TouchableOpacity
            key={s}
            accessibilityRole="menuitem"
            accessibilityLabel={`size-${s}-${sizeUnit}`}
            style={styles.menuItem}
            onPress={() => {
              const px = sizeUnit === 'pt' ? Math.round(s * PT_TO_PX) : s;
              editorRef.current?.setFontSize(px);
              setSizeOpen(false);
            }}
          >
            <Text style={styles.menuLabel}>{`${s} ${sizeUnit}`}</Text>
          </TouchableOpacity>
        ))}
      </Popover>

      {/* Color swatches */}
      <Popover visible={colorOpen} onClose={() => setColorOpen(false)}>
        <View style={styles.swatchGrid}>
          {colors.map((c) => (
            <TouchableOpacity
              key={c}
              accessibilityRole="button"
              accessibilityLabel={`color-${c}`}
              style={[styles.swatch, { backgroundColor: c }]}
              onPress={() => {
                editorRef.current?.setTextColor(c);
                setColorOpen(false);
              }}
            />
          ))}
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="color-clear"
          style={styles.menuItem}
          onPress={() => {
            editorRef.current?.setTextColor(null);
            setColorOpen(false);
          }}
        >
          <Text style={styles.menuLabel}>Automatic</Text>
        </TouchableOpacity>
      </Popover>

      {/* Emoji picker */}
      <Popover visible={emojiOpen} onClose={() => setEmojiOpen(false)}>
        <View style={styles.emojiGrid}>
          {EMOJIS.map((e) => (
            <TouchableOpacity
              key={e}
              accessibilityRole="button"
              accessibilityLabel={`emoji-${e}`}
              style={styles.emojiCell}
              onPress={() => {
                editorRef.current?.insertText(e);
                setEmojiOpen(false);
              }}
            >
              <Text style={styles.emoji}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Popover>

      {/* Table size picker */}
      <Popover visible={tableOpen} onClose={() => setTableOpen(false)}>
        <TableSizePicker
          onPick={(rows, cols) => {
            editorRef.current?.insertTable(rows, cols);
            setTableOpen(false);
          }}
        />
      </Popover>

      {/* Link input: optional display text + URL */}
      <LinkInput
        visible={linkOpen}
        onClose={() => setLinkOpen(false)}
        onSubmit={(text, url) => {
          const href = url.trim();
          const label = text.trim();
          if (label) {
            // Insert new linked text (e.g. "Google" → https://google.com).
            editorRef.current?.insertLink(label, href);
          } else {
            // No display text: apply/remove the link on the current selection.
            editorRef.current?.setLink(href || null);
          }
          setLinkOpen(false);
        }}
        onRemove={() => {
          editorRef.current?.setLink(null);
          setLinkOpen(false);
        }}
      />
    </View>
  );
}

/**
 * A modal for inserting/editing a link. The optional "Text" field lets the user name the link
 * (e.g. "Google"); when left blank the link is applied to the current selection instead.
 */
function LinkInput({
  visible,
  onClose,
  onSubmit,
  onRemove,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (text: string, url: string) => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const reset = () => {
    setText('');
    setUrl('');
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.inputCard} onPress={() => {}}>
          <Text style={styles.inputTitle}>Link</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Text (e.g. Google)"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <TextInput
            autoFocus
            value={url}
            onChangeText={setUrl}
            placeholder="https://example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[styles.input, styles.inputSpaced]}
          />
          <View style={styles.inputActions}>
            <TouchableOpacity accessibilityRole="button" onPress={() => { reset(); onRemove(); }}>
              <Text style={styles.inputRemove}>Remove</Text>
            </TouchableOpacity>
            <View style={styles.inputActionsRight}>
              <TouchableOpacity accessibilityRole="button" onPress={onClose}>
                <Text style={styles.inputCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" onPress={() => { onSubmit(text, url); reset(); }}>
                <Text style={styles.inputOk}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A grid selector (like Docs/Word) for choosing a table's dimensions before inserting. */
function TableSizePicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const MAX = 5;
  const [hover, setHover] = useState({ rows: 0, cols: 0 });
  return (
    <View style={styles.tablePicker}>
      <Text style={styles.tablePickerLabel}>
        {hover.rows > 0 ? `${hover.rows} × ${hover.cols}` : 'Insert table'}
      </Text>
      <View>
        {Array.from({ length: MAX }, (_r, r) => (
          <View key={r} style={styles.tableRow}>
            {Array.from({ length: MAX }, (_c, c) => {
              const on = r < hover.rows && c < hover.cols;
              return (
                <TouchableOpacity
                  key={c}
                  accessibilityRole="button"
                  accessibilityLabel={`table-${r + 1}x${c + 1}`}
                  style={[styles.tableCell, on && styles.tableCellOn]}
                  onPressIn={() => setHover({ rows: r + 1, cols: c + 1 })}
                  onPress={() => onPick(r + 1, c + 1)}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

function ToolbarButton({
  label,
  active,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  active: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      style={[styles.button, active && styles.buttonActive]}
      onPress={onPress}
    >
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

/** A lightweight popover anchored below the toolbar, dismissed by tapping the backdrop. */
function Popover({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.popover}>{children}</View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
    backgroundColor: '#fff',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    gap: 4,
  },
  dropdownLabel: { fontSize: 14, color: '#333', maxWidth: 110 },
  caret: { fontSize: 12, color: '#666' },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    backgroundColor: '#ccc',
    marginHorizontal: 4,
  },
  button: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonActive: { backgroundColor: '#DCEEFF' },
  label: { fontSize: 16, fontWeight: '600', color: '#333' },
  labelActive: { color: '#1A73E8' },
  colorUnderline: { height: 3, width: 18, backgroundColor: '#D93025', marginTop: 1, borderRadius: 2 },
  backdrop: { flex: 1, backgroundColor: '#00000022' },
  popover: {
    position: 'absolute',
    top: 92,
    left: 12,
    minWidth: 180,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 6,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  menuItem: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6 },
  menuItemActive: { backgroundColor: '#DCEEFF' },
  menuLabel: { fontSize: 15, color: '#333' },
  swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', width: 200, padding: 8, gap: 8 },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: '#0002' },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', width: 220, padding: 8 },
  emojiCell: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22 },
  tablePicker: { padding: 10 },
  tablePickerLabel: { fontSize: 13, color: '#333', marginBottom: 8, textAlign: 'center' },
  tableRow: { flexDirection: 'row' },
  tableCell: {
    width: 24,
    height: 24,
    margin: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#aaa',
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  tableCellOn: { backgroundColor: '#DCEEFF', borderColor: '#1A73E8' },
  inputCard: {
    position: 'absolute',
    top: 120,
    left: 24,
    right: 24,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  inputTitle: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 8 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#aaa',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    color: '#111',
  },
  inputSpaced: { marginTop: 8 },
  inputActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  inputActionsRight: { flexDirection: 'row', gap: 18 },
  inputRemove: { color: '#D93025', fontSize: 15 },
  inputCancel: { color: '#5F6368', fontSize: 15 },
  inputOk: { color: '#1A73E8', fontSize: 15, fontWeight: '600' },
});
