import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RichTextViewer } from 'react-native-fabric-rich-text';

const SAMPLE = `<h1>Preview</h1>
<p>Paste any HTML above. It renders <strong>read-only</strong> with <em>styles</em>,
<u>underline</u>, <span style="color: #d93025">color</span>, and
<a href="https://reactnative.dev">clickable links</a>.</p>
<ul><li>bullet</li><li data-checked="true">done</li></ul>
<blockquote>A block quote.</blockquote>
<table><tr><th>Feature</th><th>Value</th></tr><tr><td>Links</td><td>Tappable</td></tr></table>`;

/**
 * Paste HTML at the top; it renders read-only below via <RichTextViewer> (no editor overhead).
 */
export function PreviewDemo() {
  const [html, setHtml] = useState(SAMPLE);
  return (
    <View style={styles.container}>
      <Text style={styles.caption}>Paste HTML:</Text>
      <TextInput
        multiline
        value={html}
        onChangeText={setHtml}
        placeholder="<p>Your HTML…</p>"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      <Text style={styles.caption}>Rendered (read-only, links tappable):</Text>
      <ScrollView style={styles.preview} contentContainerStyle={styles.previewContent}>
        <RichTextViewer html={html} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  caption: { fontSize: 12, color: '#888', marginTop: 8, marginBottom: 4 },
  input: {
    height: 160,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#aaa',
    borderRadius: 6,
    padding: 8,
    fontFamily: 'Courier',
    fontSize: 12,
    color: '#111',
    textAlignVertical: 'top',
  },
  preview: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: '#eee', borderRadius: 6 },
  previewContent: { padding: 12 },
});
