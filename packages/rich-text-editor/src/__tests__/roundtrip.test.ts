import { documentToHtml } from '../html/serializer';
import { htmlToDocument } from '../html/nativeBridge';

/** HTML → document → HTML. This is the exact path getHTML() takes for stored content. */
function rt(html: string): string {
  return documentToHtml(htmlToDocument(html));
}

// Every toolbar option, validated end-to-end through the HTML ⇄ document round-trip.
describe('round-trip validation of all toolbar options', () => {
  describe('inline styles', () => {
    it.each([
      ['<p><b>x</b></p>', '<p><strong>x</strong></p>'],
      ['<p><strong>x</strong></p>', '<p><strong>x</strong></p>'],
      ['<p><i>x</i></p>', '<p><em>x</em></p>'],
      ['<p><em>x</em></p>', '<p><em>x</em></p>'],
      ['<p><u>x</u></p>', '<p><u>x</u></p>'],
      ['<p><s>x</s></p>', '<p><s>x</s></p>'],
      ['<p><del>x</del></p>', '<p><s>x</s></p>'],
      ['<p><sup>x</sup></p>', '<p><sup>x</sup></p>'],
      ['<p><sub>x</sub></p>', '<p><sub>x</sub></p>'],
    ])('%s → %s', (input, expected) => {
      expect(rt(input)).toBe(expected);
    });

    it('nests combined styles deterministically', () => {
      expect(rt('<p><b><i>x</i></b></p>')).toBe('<p><strong><em>x</em></strong></p>');
      expect(rt('<p><b><u><i>x</i></u></b></p>')).toBe(
        '<p><strong><em><u>x</u></em></strong></p>',
      );
    });
  });

  describe('color, background, font', () => {
    it.each([
      ['<p><span style="color: #ff0000">x</span></p>'],
      ['<p><span style="background-color: #ffff00">x</span></p>'],
      ['<p><span style="font-size: 18px">x</span></p>'],
      ['<p><span style="font-size: 32px">x</span></p>'],
    ])('%s round-trips', (input) => {
      expect(rt(input)).toBe(input);
    });

    it('normalizes a monospace span to the semantic <code> tag', () => {
      expect(rt('<p><span style="font-family: monospace">x</span></p>')).toBe('<p><code>x</code></p>');
      expect(rt('<p><code>x</code></p>')).toBe('<p><code>x</code></p>');
    });

    it('combines color + size in one span', () => {
      expect(rt('<p><span style="color: #1a73e8; font-size: 24px">x</span></p>')).toBe(
        '<p><span style="color: #1a73e8; font-size: 24px">x</span></p>',
      );
    });
  });

  describe('links', () => {
    it('round-trips a link', () => {
      expect(rt('<p><a href="https://example.com">Google</a></p>')).toBe(
        '<p><a href="https://example.com">Google</a></p>',
      );
    });
  });

  describe('block types', () => {
    it.each([
      ['<h1>x</h1>'],
      ['<h2>x</h2>'],
      ['<h3>x</h3>'],
      ['<h4>x</h4>'],
      ['<h5>x</h5>'],
      ['<h6>x</h6>'],
      ['<blockquote>x</blockquote>'],
      ['<p>x</p>'],
    ])('%s round-trips', (input) => {
      expect(rt(input)).toBe(input);
    });
  });

  describe('alignment', () => {
    it.each([
      ['<p style="text-align: center">x</p>'],
      ['<p style="text-align: right">x</p>'],
      ['<p style="text-align: justify">x</p>'],
      ['<h2 style="text-align: center">x</h2>'],
    ])('%s round-trips', (input) => {
      expect(rt(input)).toBe(input);
    });
  });

  describe('indent', () => {
    it('round-trips a single indent level', () => {
      expect(rt('<p style="margin-left: 2em">x</p>')).toBe('<p style="margin-left: 2em">x</p>');
    });
    it('round-trips deeper indent', () => {
      expect(rt('<p style="margin-left: 6em">x</p>')).toBe('<p style="margin-left: 6em">x</p>');
    });
    it('parses px indent into levels', () => {
      // 40px / 20 = level 2 → 4em on the way out.
      expect(rt('<p style="margin-left: 40px">x</p>')).toBe('<p style="margin-left: 4em">x</p>');
    });
    it('combines alignment + indent', () => {
      expect(rt('<p style="text-align: center; margin-left: 2em">x</p>')).toBe(
        '<p style="text-align: center; margin-left: 2em">x</p>',
      );
    });
  });

  describe('lists', () => {
    it.each([
      ['<ul><li>a</li><li>b</li></ul>'],
      ['<ol><li>a</li><li>b</li></ol>'],
      ['<ul><li data-checked="true">a</li><li data-checked="false">b</li></ul>'],
    ])('%s round-trips', (input) => {
      expect(rt(input)).toBe(input);
    });
  });

  describe('tables', () => {
    it('round-trips a header table', () => {
      const html =
        '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>';
      expect(rt(html)).toBe(html);
    });
  });

  describe('mixed document', () => {
    it('round-trips a document exercising many features at once', () => {
      const html =
        '<h1>Title</h1>' +
        '<p style="text-align: center">A <strong>bold</strong> and <em>italic</em> line.</p>' +
        '<p style="margin-left: 2em"><span style="color: #d93025; font-size: 18px">tinted</span></p>' +
        '<ul><li>one</li><li>two</li></ul>' +
        '<ol><li>first</li></ol>' +
        '<blockquote>quote</blockquote>' +
        '<table><tr><th>H</th></tr><tr><td>c</td></tr></table>' +
        '<p><a href="https://x.com">link</a></p>';
      expect(rt(html)).toBe(html);
    });
  });
});
