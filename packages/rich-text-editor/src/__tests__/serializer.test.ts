import { documentToHtml } from '../html/serializer';
import { htmlToDocument } from '../html/nativeBridge';
import { defaultTagRegistry } from '../registry/TagRegistry';

/** Round-trip helper: HTML → document → HTML. */
function roundTrip(html: string): string {
  return documentToHtml(htmlToDocument(html));
}

describe('documentToHtml', () => {
  it('serializes a paragraph with bold', () => {
    expect(roundTrip('<p>Hello <b>world</b></p>')).toBe('<p>Hello <strong>world</strong></p>');
  });

  it('does not fragment a single bold run', () => {
    // The classic degradation to avoid: <b>ab</b> must not become <b>a</b><b>b</b>.
    const html = roundTrip('<p><b>ab</b></p>');
    expect(html).toBe('<p><strong>ab</strong></p>');
  });

  it('does not emit duplicate tags for aliases', () => {
    const html = roundTrip('<p><strong>x</strong></p>');
    expect(html).toBe('<p><strong>x</strong></p>');
  });

  it('nests combined styles deterministically', () => {
    const html = roundTrip('<p><b><i>x</i></b></p>');
    expect(html).toBe('<p><strong><em>x</em></strong></p>');
  });

  it('serializes a link', () => {
    expect(roundTrip('<p><a href="https://x.com">y</a></p>')).toBe(
      '<p><a href="https://x.com">y</a></p>',
    );
  });

  it('serializes headings and paragraphs', () => {
    expect(roundTrip('<h1>T</h1><p>B</p>')).toBe('<h1>T</h1><p>B</p>');
  });

  it('re-groups bullet list items into a <ul>', () => {
    expect(roundTrip('<ul><li>a</li><li>b</li></ul>')).toBe('<ul><li>a</li><li>b</li></ul>');
  });

  it('re-groups ordered list items into an <ol>', () => {
    expect(roundTrip('<ol><li>a</li><li>b</li></ol>')).toBe('<ol><li>a</li><li>b</li></ol>');
  });

  it('serializes an image as a self-closing tag', () => {
    expect(roundTrip('<p><img src="a.png"></p>')).toBe('<p><img src="a.png" /></p>');
  });

  it('escapes special characters in text', () => {
    expect(roundTrip('<p>a &amp; b &lt; c</p>')).toBe('<p>a &amp; b &lt; c</p>');
  });

  it('converts newlines back to <br />', () => {
    expect(roundTrip('<p>a<br>b</p>')).toBe('<p>a<br />b</p>');
  });

  it('round-trips a registered custom embed tag with no native changes', () => {
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
        attrs: {
          'data-id': embed.data.mentionId,
          'data-label': (embed.label ?? '').replace(/^@/, ''),
        },
        selfClosing: true,
      }),
    });
    const html = roundTrip('<p>hi <mention data-id="123" data-label="alice">@alice</mention></p>');
    expect(html).toBe('<p>hi <mention data-id="123" data-label="alice" /></p>');
    defaultTagRegistry.unregister('mention');
  });
});
