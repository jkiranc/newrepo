import React, { useMemo } from 'react';
import {
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { htmlToSegments, type Segment } from '../html/segments';
import { defaultTagRegistry, TagRegistry } from '../registry/TagRegistry';
import type { BlockNode, EmbedPlaceholder, StyleRun } from '../types/nativeTypes';

export interface RichTextViewerProps {
  /** HTML to render read-only. */
  html: string;
  /** The tag registry used to parse the HTML (defaults to the global one). */
  registry?: TagRegistry;
  /** Base font size in points for body text (headings scale from this). */
  baseFontSize?: number;
  /** Called when a link is tapped. Defaults to opening the URL. Return `true` to suppress default. */
  onLinkPress?: (url: string) => boolean | void;
  style?: StyleProp<ViewStyle>;
}

const HEADING_SIZE: Record<string, number> = {
  h1: 1.9,
  h2: 1.6,
  h3: 1.4,
  h4: 1.25,
  h5: 1.1,
  h6: 1.0,
};

const INDENT_STEP = 20;

/**
 * A lightweight, read-only renderer for the editor's HTML. Unlike {@link RichTextEditor} it uses
 * plain RN `<Text>`/`<View>` (no native text view), so it is fast and cheap for display —
 * previews, feeds, messages. Links are tappable; inline styles, headings, lists, blockquotes,
 * alignment, indent, images, chips and tables are all supported.
 */
export function RichTextViewer({
  html,
  registry = defaultTagRegistry,
  baseFontSize = 16,
  onLinkPress,
  style,
}: RichTextViewerProps) {
  const segments = useMemo(() => htmlToSegments(html, registry), [html, registry]);

  const openLink = (url: string) => {
    if (onLinkPress?.(url) === true) return;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={style}>
      {segments.map((seg) =>
        seg.type === 'table' ? (
          <TableView key={seg.id} segment={seg} baseFontSize={baseFontSize} />
        ) : (
          seg.doc.blocks.map((block) => (
            <BlockView
              key={block.id}
              block={block}
              baseFontSize={baseFontSize}
              onLink={openLink}
            />
          ))
        ),
      )}
    </View>
  );
}

/** Find the (coalesced, non-overlapping) run covering a character index. */
function runCovering(runs: StyleRun[], index: number): StyleRun | undefined {
  for (const run of runs) {
    if (run.start <= index && index < run.start + run.length) {
      return run;
    }
  }
  return undefined;
}

function runTextStyle(run: StyleRun | undefined, baseFontSize: number): TextStyle {
  const s: TextStyle = {};
  if (!run) return s;
  if (run.bold) s.fontWeight = '700';
  if (run.italic) s.fontStyle = 'italic';
  const deco: string[] = [];
  if (run.underline || run.link) deco.push('underline');
  if (run.strikethrough) deco.push('line-through');
  if (deco.length) s.textDecorationLine = deco.join(' ') as TextStyle['textDecorationLine'];
  if (run.color) s.color = run.color;
  if (run.link) s.color = s.color ?? '#1A73E8';
  if (run.backgroundColor) s.backgroundColor = run.backgroundColor;
  if (run.fontFamily === 'monospace') s.fontFamily = 'monospace';
  if (run.fontSize) s.fontSize = run.fontSize;
  // RN <Text> can't offset baseline; approximate sub/superscript with a smaller font.
  if (run.superscript || run.subscript) s.fontSize = (run.fontSize ?? baseFontSize) * 0.75;
  return s;
}

/** Render a block's text (with style runs + inline embeds) into an array of <Text>/embeds. */
function renderInline(
  block: BlockNode,
  baseFontSize: number,
  onLink: (url: string) => void,
): React.ReactNode[] {
  const { text, styleRuns } = block;
  const embedByOffset = new Map<number, EmbedPlaceholder>();
  for (const e of block.embeds ?? []) embedByOffset.set(e.offset, e);

  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const embed = embedByOffset.get(i);
    if (embed) {
      out.push(<InlineEmbed key={key++} embed={embed} baseFontSize={baseFontSize} />);
      i += 1;
      continue;
    }
    const run = runCovering(styleRuns, i);
    // Consume the covered run, or (when unstyled) up to the next run/embed — not one char at a time.
    let end: number;
    if (run) {
      end = run.start + run.length;
    } else {
      end = text.length;
      for (const r of styleRuns) {
        if (r.start > i && r.start < end) end = r.start;
      }
    }
    let j = i;
    let str = '';
    while (j < end && !embedByOffset.has(j)) {
      str += text[j];
      j += 1;
    }
    const link = run?.link;
    out.push(
      <Text
        key={key++}
        style={runTextStyle(run, baseFontSize)}
        onPress={link ? () => onLink(link) : undefined}
      >
        {str}
      </Text>,
    );
    i = j;
  }
  return out;
}

function listMarker(block: BlockNode): string | null {
  switch (block.listType) {
    case 'bullet':
      return '•';
    case 'ordered':
      return `${block.listIndex ?? 1}.`;
    case 'check':
      return block.checked ? '☑' : '☐';
    default:
      return null;
  }
}

function BlockView({
  block,
  baseFontSize,
  onLink,
}: {
  block: BlockNode;
  baseFontSize: number;
  onLink: (url: string) => void;
}) {
  const isHeading = HEADING_SIZE[block.tag] !== undefined;
  const isCode = block.tag === 'pre' || block.tag === 'code';
  const isQuote = block.tag === 'blockquote';
  const isList = block.listType != null && block.listType !== 'none';

  const fontSize = isHeading ? baseFontSize * HEADING_SIZE[block.tag] : baseFontSize;
  const marker = listMarker(block);

  const indent =
    (block.indentLevel ?? 0) * INDENT_STEP + (isQuote ? INDENT_STEP : 0) + (isList ? INDENT_STEP : 0);

  const textStyle: TextStyle = {
    fontSize,
    lineHeight: fontSize * 1.4,
    color: '#111',
    textAlign: block.align === 'justify' ? 'justify' : block.align ?? 'left',
  };
  if (isHeading) textStyle.fontWeight = '700';
  if (isCode) textStyle.fontFamily = 'monospace';

  return (
    <View style={[styles.block, { paddingLeft: indent }, isQuote && styles.quote]}>
      <Text style={textStyle}>
        {marker != null && <Text style={styles.marker}>{marker} </Text>}
        {renderInline(block, baseFontSize, onLink)}
      </Text>
    </View>
  );
}

function InlineEmbed({ embed, baseFontSize }: { embed: EmbedPlaceholder; baseFontSize: number }) {
  if (embed.kind === 'image' && embed.src) {
    return (
      <Image
        source={{ uri: embed.src }}
        style={{ width: embed.width ?? 200, height: embed.height ?? 150 }}
        resizeMode="contain"
      />
    );
  }
  // chip (custom tags like <mention>) — render as a rounded label.
  return (
    <Text
      style={{
        fontSize: baseFontSize,
        color: embed.textColor ?? '#1A73E8',
        backgroundColor: embed.backgroundColor ?? '#E8F0FE',
      }}
    >
      {' '}
      {embed.label ?? embed.tag}{' '}
    </Text>
  );
}

function TableView({ segment, baseFontSize }: { segment: Extract<Segment, { type: 'table' }>; baseFontSize: number }) {
  const { rows, header, headerColumn } = segment;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
      <View style={styles.table}>
        {rows.map((row, r) => (
          <View key={r} style={styles.tableRow}>
            {row.map((cell, c) => {
              const isHeader = (header && r === 0) || (headerColumn && c === 0);
              return (
                <View key={c} style={[styles.tableCell, isHeader && styles.tableHeaderCell]}>
                  <Text style={[{ fontSize: baseFontSize, color: '#111' }, isHeader && styles.tableHeaderText]}>
                    {cell}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  block: { marginVertical: 4 },
  marker: { color: '#333' },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: '#ccc',
    marginLeft: 4,
  },
  tableScroll: { marginVertical: 8 },
  table: { borderTopWidth: StyleSheet.hairlineWidth, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: '#bbb' },
  tableRow: { flexDirection: 'row' },
  tableCell: {
    minWidth: 100,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#bbb',
  },
  tableHeaderCell: { backgroundColor: '#F1F3F4' },
  tableHeaderText: { fontWeight: '700' },
});
