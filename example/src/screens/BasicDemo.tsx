import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  RichTextEditor,
  Toolbar,
  type RichTextEditorRef,
  type SelectionChange,
} from 'react-native-fabric-rich-text';

/** Indent an HTML string so each tag sits on its own line — just for the live preview. */
function prettyHtml(html: string): string {
  if (!html) return '';
  const tokens = html.replace(/>\s*</g, '>\n<').split('\n');
  const voidTag = /^<(br|img|hr|input|meta|link)[\s/>]/i;
  let indent = 0;
  const out: string[] = [];
  for (const raw of tokens) {
    const t = raw.trim();
    if (!t) continue;
    const isClosing = /^<\//.test(t);
    const isTag = /^</.test(t);
    const selfContained = isTag && /<\/[a-zA-Z]/.test(t); // opens and closes on one line
    const selfClosing = /\/>$/.test(t) || voidTag.test(t);
    if (isClosing) indent = Math.max(0, indent - 1);
    out.push('  '.repeat(indent) + t);
    if (isTag && !isClosing && !selfClosing && !selfContained) indent += 1;
  }
  return out.join('\n');
}

export function BasicDemo() {
  const editorRef = useRef<RichTextEditorRef>(null);
  const [activeStyles, setActiveStyles] = useState<SelectionChange['activeStyles']>([]);
  const [blockTag, setBlockTag] = useState('p');
  const [align, setAlign] = useState<SelectionChange['align']>('left');
  const [html, setHtml] = useState('');

  return (
    <View style={styles.container}>
      <Toolbar
        editorRef={editorRef}
        activeStyles={activeStyles}
        activeBlockType={blockTag}
        activeAlignment={align}
      />
      <ScrollView style={styles.editorScroll} keyboardShouldPersistTaps="handled">
        <RichTextEditor
          ref={editorRef}
          placeholder="Start typing…"
          onChangeHtml={setHtml}
          onSelectionChange={(s) => {
            setActiveStyles(s.activeStyles);
            setBlockTag(s.blockTag);
            setAlign(s.align);
          }}
          style={styles.editor}
        />
      </ScrollView>
      <Text style={styles.caption}>Serialized HTML (live):</Text>
      <ScrollView style={styles.htmlBox} nestedScrollEnabled>
        <ScrollView horizontal>
          <Text style={styles.htmlText}>{prettyHtml(html) || '(empty)'}</Text>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  editorScroll: { flex: 1 },
  editor: { fontSize: 16 },
  caption: { paddingHorizontal: 12, paddingTop: 8, fontSize: 12, color: '#888' },
  htmlBox: {
    maxHeight: 220,
    margin: 12,
    padding: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
  },
  htmlText: { fontFamily: 'Courier', fontSize: 12, color: '#333', lineHeight: 18 },
});
