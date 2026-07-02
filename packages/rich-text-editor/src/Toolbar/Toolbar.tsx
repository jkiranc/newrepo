import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';

import type { RichTextEditorRef } from '../RichTextEditor';
import type { InlineStyleName } from '../types/nativeTypes';

export interface ToolbarProps {
  editorRef: React.RefObject<RichTextEditorRef | null>;
  /** Inline styles currently active at the caret (from `onSelectionChange`), for highlighting. */
  activeStyles?: InlineStyleName[];
  /** The current block's tag (e.g. 'p' | 'h1' | 'blockquote'), for highlighting. */
  activeBlockType?: string;
  style?: StyleProp<ViewStyle>;
}

interface InlineButton {
  label: string;
  style: InlineStyleName;
}

interface BlockButton {
  label: string;
  tag: string;
}

const INLINE_BUTTONS: InlineButton[] = [
  { label: 'B', style: 'bold' },
  { label: 'I', style: 'italic' },
  { label: 'U', style: 'underline' },
  { label: 'S', style: 'strikethrough' },
];

const BLOCK_BUTTONS: BlockButton[] = [
  { label: 'P', tag: 'p' },
  { label: 'H1', tag: 'h1' },
  { label: 'H2', tag: 'h2' },
  { label: '❝', tag: 'blockquote' },
  { label: '</>', tag: 'pre' },
];

/**
 * A minimal formatting toolbar built entirely in JS on top of the editor's imperative ref.
 * It ships as a convenience; consumers can just as easily build their own against the ref.
 */
export function Toolbar({ editorRef, activeStyles = [], activeBlockType, style }: ToolbarProps) {
  return (
    <View style={[styles.bar, style]}>
      {INLINE_BUTTONS.map((button) => {
        const active = activeStyles.includes(button.style);
        return (
          <ToolbarButton
            key={button.style}
            label={button.label}
            active={active}
            accessibilityLabel={button.style}
            onPress={() => editorRef.current?.toggleInlineStyle(button.style)}
          />
        );
      })}
      <View style={styles.divider} />
      {BLOCK_BUTTONS.map((button) => {
        const active = activeBlockType === button.tag;
        return (
          <ToolbarButton
            key={button.tag}
            label={button.label}
            active={active}
            accessibilityLabel={`block-${button.tag}`}
            onPress={() => editorRef.current?.setBlockType(button.tag)}
          />
        );
      })}
    </View>
  );
}

interface ToolbarButtonProps {
  label: string;
  active: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}

function ToolbarButton({ label, active, accessibilityLabel, onPress }: ToolbarButtonProps) {
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

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
    gap: 4,
    flexWrap: 'wrap',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
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
  buttonActive: {
    backgroundColor: '#DCEEFF',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  labelActive: {
    color: '#1A73E8',
  },
});
