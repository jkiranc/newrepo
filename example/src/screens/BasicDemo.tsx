import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  RichTextEditor,
  Toolbar,
  type RichTextEditorRef,
  type SelectionChange,
} from 'react-native-fabric-rich-text';

const INITIAL_HTML = `
<h1>Built-in tags</h1>
<p>This editor renders <strong>bold</strong>, <em>italic</em>, <u>underline</u>,
<s>strikethrough</s>, and <a href="https://reactnative.dev">links</a> natively.</p>
<ul><li>bullet one</li><li>bullet two</li></ul>
<ol><li>first</li><li>second</li></ol>
<blockquote>A block quote.</blockquote>
<table>
  <tr><th>Feature</th><th>iOS</th><th>Android</th></tr>
  <tr><td>Bold</td><td>Yes</td><td>Yes</td></tr>
  <tr><td>Tables</td><td>Read-only</td><td>Read-only</td></tr>
</table>
`;

export function BasicDemo() {
  const editorRef = useRef<RichTextEditorRef>(null);
  const [activeStyles, setActiveStyles] = useState<SelectionChange['activeStyles']>([]);
  const [html, setHtml] = useState('');

  return (
    <View style={styles.container}>
      <Toolbar editorRef={editorRef} activeStyles={activeStyles} />
      <RichTextEditor
        ref={editorRef}
        initialHtml={INITIAL_HTML}
        onChangeHtml={setHtml}
        onSelectionChange={(s) => setActiveStyles(s.activeStyles)}
        style={styles.editor}
      />
      <Text style={styles.caption}>Serialized HTML (live):</Text>
      <ScrollView style={styles.htmlBox}>
        <Text style={styles.htmlText}>{html}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  editor: { flex: 1, fontSize: 16 },
  caption: { paddingHorizontal: 12, paddingTop: 8, fontSize: 12, color: '#888' },
  htmlBox: { maxHeight: 140, margin: 12, padding: 8, backgroundColor: '#f5f5f5', borderRadius: 6 },
  htmlText: { fontFamily: 'Courier', fontSize: 12, color: '#333' },
});
