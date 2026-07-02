import { htmlToDocument } from '../html/nativeBridge';
import { defaultTagRegistry } from '../registry/TagRegistry';
import { OBJECT_REPLACEMENT_CHAR } from '../types/nativeTypes';

describe('htmlToDocument', () => {
  it('maps a paragraph with an inline bold run', () => {
    const doc = htmlToDocument('<p>Hello <b>world</b></p>');
    expect(doc.blocks).toHaveLength(1);
    const block = doc.blocks[0];
    expect(block.tag).toBe('p');
    expect(block.text).toBe('Hello world');
    expect(block.styleRuns).toEqual([
      expect.objectContaining({ start: 6, length: 5, bold: true }),
    ]);
  });

  it('merges nested inline tags into a single combined run', () => {
    const doc = htmlToDocument('<p><b><i>x</i></b></p>');
    const run = doc.blocks[0].styleRuns[0];
    expect(run).toMatchObject({ start: 0, length: 1, bold: true, italic: true });
  });

  it('coalesces adjacent identically-styled runs', () => {
    // Two text nodes under one <b> must not fragment into two runs.
    const doc = htmlToDocument('<p><b>ab<i></i>cd</b></p>');
    const boldRuns = doc.blocks[0].styleRuns.filter((r) => r.bold && !r.italic);
    expect(boldRuns).toHaveLength(1);
    expect(boldRuns[0]).toMatchObject({ start: 0, length: 4 });
  });

  it('wraps loose inline content in an implicit paragraph', () => {
    const doc = htmlToDocument('just <b>text</b>');
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0].tag).toBe('p');
    expect(doc.blocks[0].text).toBe('just text');
  });

  it('turns <br> into a newline within a block', () => {
    const doc = htmlToDocument('<p>a<br>b</p>');
    expect(doc.blocks[0].text).toBe('a\nb');
  });

  it('produces separate blocks for headings and paragraphs', () => {
    const doc = htmlToDocument('<h1>Title</h1><p>Body</p>');
    expect(doc.blocks.map((b) => b.tag)).toEqual(['h1', 'p']);
  });

  it('captures link href as a style run', () => {
    const doc = htmlToDocument('<p><a href="https://x.com">link</a></p>');
    expect(doc.blocks[0].styleRuns[0]).toMatchObject({ link: 'https://x.com' });
  });

  it('parses inline CSS on a span', () => {
    const doc = htmlToDocument('<p><span style="color: #ff0000; font-size: 20px">c</span></p>');
    expect(doc.blocks[0].styleRuns[0]).toMatchObject({ color: '#ff0000', fontSize: 20 });
  });

  it('maps list items to blocks with list metadata', () => {
    const doc = htmlToDocument('<ul><li>a</li><li>b</li></ul>');
    expect(doc.blocks).toHaveLength(2);
    expect(doc.blocks[0]).toMatchObject({ tag: 'li', text: 'a', listType: 'bullet', listDepth: 0 });
    expect(doc.blocks[1]).toMatchObject({ tag: 'li', text: 'b' });
  });

  it('numbers ordered-list items', () => {
    const doc = htmlToDocument('<ol><li>a</li><li>b</li></ol>');
    expect(doc.blocks[0]).toMatchObject({ listType: 'ordered', listIndex: 1 });
    expect(doc.blocks[1]).toMatchObject({ listType: 'ordered', listIndex: 2 });
  });

  it('maps an image to an embed placeholder', () => {
    const doc = htmlToDocument('<p><img src="a.png" width="10" height="20"></p>');
    const block = doc.blocks[0];
    expect(block.text).toBe(OBJECT_REPLACEMENT_CHAR);
    expect(block.embeds).toEqual([
      expect.objectContaining({ tag: 'img', kind: 'image', src: 'a.png', width: 10, height: 20, offset: 0 }),
    ]);
  });

  it('treats an unknown inline tag as a transparent container', () => {
    const doc = htmlToDocument('<p><weird>hi</weird></p>');
    expect(doc.blocks[0].text).toBe('hi');
    expect(doc.blocks[0].styleRuns).toHaveLength(0);
  });

  it('maps a registered custom embed tag with no native changes', () => {
    defaultTagRegistry.register({
      tag: 'mention',
      category: 'embed',
      toEmbed: (attrs) => ({
        kind: 'chip',
        label: '@' + (attrs['data-label'] ?? ''),
        data: { mentionId: attrs['data-id'] ?? '' },
      }),
      fromEmbed: (embed) => ({
        tag: 'mention',
        attrs: { 'data-id': embed.data.mentionId, 'data-label': (embed.label ?? '').replace(/^@/, '') },
        selfClosing: true,
      }),
    });
    const doc = htmlToDocument('<p>hi <mention data-id="123" data-label="alice">@alice</mention></p>');
    const block = doc.blocks[0];
    expect(block.text).toBe(`hi ${OBJECT_REPLACEMENT_CHAR}`);
    expect(block.embeds?.[0]).toMatchObject({
      tag: 'mention',
      kind: 'chip',
      label: '@alice',
      data: { mentionId: '123' },
      offset: 3,
    });
    defaultTagRegistry.unregister('mention');
  });
});
