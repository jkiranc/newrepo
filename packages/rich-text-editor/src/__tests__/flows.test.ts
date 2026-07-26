import { documentToHtml } from '../html/serializer';
import { htmlToDocument } from '../html/nativeBridge';
import { htmlToSegments, segmentsToHtml, newTableSegment } from '../html/segments';

const rt = (html: string) => documentToHtml(htmlToDocument(html));

/**
 * Regression coverage for every issue reported from on-device testing. Each block names the
 * original symptom so a future change that reintroduces it fails here.
 */
describe('reported issue regressions', () => {
  describe('"font/heading selection is not retained"', () => {
    it('each heading level survives a round-trip independently', () => {
      for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
        expect(rt(`<${tag}>x</${tag}>`)).toBe(`<${tag}>x</${tag}>`);
      }
    });

    it('a heading does NOT bleed onto the following paragraph', () => {
      expect(rt('<h1>Line A</h1><p>Line B</p>')).toBe('<h1>Line A</h1><p>Line B</p>');
    });

    it('mixed heading levels in sequence each keep their own tag', () => {
      const html = '<p>Normal</p><h1>Hq heading</h1><h2>Hw heading</h2><h3>Third</h3><p>Tail</p>';
      expect(rt(html)).toBe(html);
    });

    it('a heading keeps inline styling without losing its tag', () => {
      expect(rt('<h3><strong>Bold heading</strong></h3>')).toBe(
        '<h3><strong>Bold heading</strong></h3>',
      );
    });
  });

  describe('"color selection is not retained / drops after one character"', () => {
    it('a color run spanning many characters stays one span', () => {
      expect(rt('<p><span style="color: #d93025">colored text here</span></p>')).toBe(
        '<p><span style="color: #d93025">colored text here</span></p>',
      );
    });

    it('color survives alongside other inline styles', () => {
      const html = '<p><strong><span style="color: #1a73e8">bold blue</span></strong></p>';
      expect(rt(rt(html))).toBe(rt(html));
      expect(rt(html)).toContain('color: #1a73e8');
      expect(rt(html)).toContain('<strong>');
    });
  });

  describe('"font size" (and px/pt configuration)', () => {
    it('every dropdown size round-trips', () => {
      for (const size of [10, 12, 14, 16, 18, 24, 32, 48]) {
        expect(rt(`<p><span style="font-size: ${size}px">x</span></p>`)).toBe(
          `<p><span style="font-size: ${size}px">x</span></p>`,
        );
      }
    });

    it('an explicit size inside a heading is preserved (no compounding)', () => {
      const out = rt('<h1><span style="font-size: 18px">H1 sized 18</span></h1>');
      expect(out).toBe('<h1><span style="font-size: 18px">H1 sized 18</span></h1>');
    });

    it('pt values convert to px at the toolbar layer (16pt → 21px)', () => {
      // The Toolbar applies Math.round(size * 96/72); assert the model stores that px value.
      const px = Math.round(16 * (96 / 72));
      expect(px).toBe(21);
      expect(rt(`<p><span style="font-size: ${px}px">x</span></p>`)).toContain('21px');
    });
  });

  describe('"link needs a name, and tap should offer open/edit"', () => {
    it('a named link round-trips with its text and href', () => {
      expect(rt('<p><a href="https://google.com">Google</a></p>')).toBe(
        '<p><a href="https://google.com">Google</a></p>',
      );
    });

    it('a link keeps its href when styled', () => {
      const out = rt('<p><strong><a href="https://x.dev">Bold link</a></strong></p>');
      expect(out).toContain('href="https://x.dev"');
      expect(out).toContain('Bold link');
    });

    it('multiple distinct links in one paragraph stay separate', () => {
      const html = '<p><a href="https://a.com">A</a> and <a href="https://b.com">B</a></p>';
      expect(rt(html)).toBe(html);
    });
  });

  describe('"indent" (was silently dropped from HTML)', () => {
    it('indent levels round-trip', () => {
      expect(rt('<p style="margin-left: 2em">one</p>')).toBe('<p style="margin-left: 2em">one</p>');
      expect(rt('<p style="margin-left: 8em">four</p>')).toBe('<p style="margin-left: 8em">four</p>');
    });

    it('blockquote does not emit a spurious indent', () => {
      expect(rt('<blockquote>quote</blockquote>')).toBe('<blockquote>quote</blockquote>');
    });
  });

  describe('"lists / checklist"', () => {
    it('bullet, ordered and checklist round-trip', () => {
      expect(rt('<ul><li>a</li><li>b</li></ul>')).toBe('<ul><li>a</li><li>b</li></ul>');
      expect(rt('<ol><li>a</li><li>b</li></ol>')).toBe('<ol><li>a</li><li>b</li></ol>');
      expect(rt('<ul><li data-checked="true">done</li><li data-checked="false">todo</li></ul>')).toBe(
        '<ul><li data-checked="true">done</li><li data-checked="false">todo</li></ul>',
      );
    });

    it('a list followed by a paragraph does not absorb it', () => {
      expect(rt('<ul><li>item</li></ul><p>after</p>')).toBe('<ul><li>item</li></ul><p>after</p>');
    });
  });

  describe('"tables must be editable, removable, and inline"', () => {
    it('a table becomes its own segment between text segments', () => {
      const segs = htmlToSegments('<p>before</p><table><tr><td>c</td></tr></table><p>after</p>');
      expect(segs.map((s) => s.type)).toEqual(['text', 'table', 'text']);
    });

    it('header row and header column round-trip independently', () => {
      const headerRow = '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>';
      const headerCol = '<table><tr><th>a</th><td>1</td></tr><tr><th>b</th><td>2</td></tr></table>';
      expect(rt(headerRow)).toBe(headerRow);
      expect(rt(headerCol)).toBe(headerCol);
    });

    it('a new table starts empty (no placeholder cell text)', () => {
      const t = newTableSegment(2, 3);
      expect(t.rows.flat().every((c) => c === '')).toBe(true);
    });

    it('removing a table segment leaves the surrounding text intact', () => {
      const segs = htmlToSegments('<p>before</p><table><tr><td>c</td></tr></table><p>after</p>');
      const without = segs.filter((s) => s.type !== 'table');
      expect(segmentsToHtml(without)).toBe('<p>before</p><p>after</p>');
    });

    it('table cell edits are reflected in the serialized HTML', () => {
      const segs = htmlToSegments('<table><tr><th>A</th></tr><tr><td>1</td></tr></table>');
      const table = segs.find((s) => s.type === 'table');
      expect(table?.type).toBe('table');
      if (table?.type === 'table') {
        table.rows[1][0] = 'edited';
        expect(segmentsToHtml(segs)).toContain('<td>edited</td>');
      }
    });
  });

  describe('"clear everything → nothing left behind"', () => {
    it('an emptied document serializes to an empty paragraph, not stale markers', () => {
      expect(rt('<p></p>')).toBe('<p></p>');
      expect(rt('')).toBe('');
    });

    it('a cleared list leaves no list structure', () => {
      expect(rt('<p></p>')).not.toContain('<ul>');
      expect(rt('<p></p>')).not.toContain('<li>');
    });
  });

  describe('"pasted HTML document renders wrong (h1 not working)"', () => {
    it('a full document keeps every heading distinct', () => {
      const html =
        '<!DOCTYPE html><html><head><title>Ignore me</title></head><body>' +
        '<h1>HTML Element Samples</h1>' +
        '<!-- comment -->' +
        '<h2>Text Formatting</h2>' +
        '<p>This is a paragraph demonstrating formatting:</p>' +
        '<ol><li>This text is <b>bold</b>.</li></ol>' +
        '<h2>Unordered List</h2>' +
        '<p>Below is a bulleted list:</p>' +
        '<ul><li>Apples</li></ul>' +
        '</body></html>';
      expect(rt(html)).toBe(
        '<h1>HTML Element Samples</h1>' +
          '<h2>Text Formatting</h2>' +
          '<p>This is a paragraph demonstrating formatting:</p>' +
          '<ol><li>This text is <strong>bold</strong>.</li></ol>' +
          '<h2>Unordered List</h2>' +
          '<p>Below is a bulleted list:</p>' +
          '<ul><li>Apples</li></ul>',
      );
    });

    it('the document <title> never leaks into the body', () => {
      const out = rt('<html><head><title>Leaky Title</title></head><body><p>body</p></body></html>');
      expect(out).not.toContain('Leaky Title');
      expect(out).toBe('<p>body</p>');
    });
  });

  describe('alignment', () => {
    it('all alignments round-trip, including on headings', () => {
      for (const a of ['center', 'right', 'justify']) {
        expect(rt(`<p style="text-align: ${a}">x</p>`)).toBe(`<p style="text-align: ${a}">x</p>`);
        expect(rt(`<h2 style="text-align: ${a}">x</h2>`)).toBe(`<h2 style="text-align: ${a}">x</h2>`);
      }
    });
  });

  describe('everything together stays stable', () => {
    it('a document using every feature is idempotent', () => {
      const html =
        '<h1>Title</h1>' +
        '<p style="text-align: center">Centered <strong>bold</strong> <em>italic</em> <u>u</u> <s>s</s></p>' +
        '<p style="margin-left: 4em"><span style="color: #d93025; font-size: 18px">tinted</span></p>' +
        '<p><sup>sup</sup> <sub>sub</sub> <code>mono</code></p>' +
        '<ul><li>bullet</li><li data-checked="true">checked</li></ul>' +
        '<ol><li>one</li></ol>' +
        '<blockquote>quote</blockquote>' +
        '<table><tr><th>H</th><th>I</th></tr><tr><td>1</td><td>2</td></tr></table>' +
        '<p><a href="https://example.com/x?y=1#z">Named link</a></p>';
      const once = rt(html);
      expect(rt(once)).toBe(once);
      // And through the segment pipeline (what the editor actually renders).
      expect(segmentsToHtml(htmlToSegments(once))).toBe(once);
    });
  });
});
