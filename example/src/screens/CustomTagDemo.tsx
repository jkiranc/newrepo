import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  RichTextEditor,
  defaultTagRegistry,
  type RichTextEditorRef,
} from 'react-native-fabric-rich-text';

// ── The extensibility story ────────────────────────────────────────────────────────────────
// Register a brand-new <mention> tag. This is the ENTIRE integration — no native (Swift/Kotlin)
// changes are required. The JS registry maps the tag to/from the native "chip" embed primitive,
// and the native side draws it because it already knows how to draw chips.
defaultTagRegistry.register({
  tag: 'mention',
  category: 'embed',
  toEmbed: (attrs) => ({
    kind: 'chip',
    label: '@' + (attrs['data-label'] ?? attrs['data-id'] ?? ''),
    backgroundColor: '#DCEEFF',
    textColor: '#1A73E8',
    cornerRadius: 8,
    data: { mentionId: attrs['data-id'] ?? '' },
  }),
  fromEmbed: (embed) => ({
    tag: 'mention',
    attrs: {
      'data-id': embed.data.mentionId ?? '',
      'data-label': (embed.label ?? '').replace(/^@/, ''),
    },
    selfClosing: true,
  }),
});

const INITIAL_HTML =
  '<p>Hey <mention data-id="123" data-label="alice">@alice</mention>, take a look at this!</p>';

export function CustomTagDemo() {
  const editorRef = useRef<RichTextEditorRef>(null);
  const [html, setHtml] = useState(INITIAL_HTML);

  return (
    <View style={styles.container}>
      <Text style={styles.explainer}>
        A consumer-registered <Text style={styles.code}>&lt;mention&gt;</Text> tag renders as a
        native chip — with zero native code changes. Tap a chip to fire onEmbedPress.
      </Text>
      <RichTextEditor
        ref={editorRef}
        initialHtml={INITIAL_HTML}
        onChangeHtml={setHtml}
        onEmbedPress={(tag, data) => console.log('embed pressed', tag, data)}
        style={styles.editor}
      />
      <Text style={styles.caption}>Serialized HTML (note the round-tripped custom tag):</Text>
      <ScrollView style={styles.htmlBox}>
        <Text style={styles.htmlText}>{html}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  explainer: { padding: 12, fontSize: 13, color: '#444', lineHeight: 18 },
  code: { fontFamily: 'Courier', color: '#1A73E8' },
  editor: { flex: 1, fontSize: 16 },
  caption: { paddingHorizontal: 12, paddingTop: 8, fontSize: 12, color: '#888' },
  htmlBox: { maxHeight: 140, margin: 12, padding: 8, backgroundColor: '#f5f5f5', borderRadius: 6 },
  htmlText: { fontFamily: 'Courier', fontSize: 12, color: '#333' },
});
