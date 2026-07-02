import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';

import type { RichTextEditorRef } from '../RichTextEditor';
import type { InlineStyleName } from '../types/nativeTypes';

export interface ToolbarProps {
  editorRef: React.RefObject<RichTextEditorRef | null>;
  /** Inline styles currently active at the caret (from `onSelectionChange`), for highlighting. */
  activeStyles?: InlineStyleName[];
  style?: StyleProp<ViewStyle>;
}

interface ButtonSpec {
  label: string;
  style: InlineStyleName;
}

const BUTTONS: ButtonSpec[] = [
  { label: 'B', style: 'bold' },
  { label: 'I', style: 'italic' },
  { label: 'U', style: 'underline' },
  { label: 'S', style: 'strikethrough' },
];

/**
 * A minimal formatting toolbar built entirely in JS on top of the editor's imperative ref.
 * It ships as a convenience; consumers can just as easily build their own against the ref.
 */
export function Toolbar({ editorRef, activeStyles = [], style }: ToolbarProps) {
  return (
    <View style={[styles.bar, style]}>
      {BUTTONS.map((button) => {
        const active = activeStyles.includes(button.style);
        return (
          <TouchableOpacity
            key={button.style}
            accessibilityRole="button"
            accessibilityLabel={button.style}
            accessibilityState={{ selected: active }}
            style={[styles.button, active && styles.buttonActive]}
            onPress={() => editorRef.current?.toggleInlineStyle(button.style)}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{button.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
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
  },
  button: {
    width: 36,
    height: 36,
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
