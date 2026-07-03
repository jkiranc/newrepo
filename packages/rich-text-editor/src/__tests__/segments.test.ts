import {
  blocksToSegments,
  htmlToSegments,
  newTableSegment,
  segmentsToHtml,
  type Segment,
} from '../html/segments';

describe('segments', () => {
  it('splits text / table / text into three ordered segments', () => {
    const html =
      '<p>Before</p><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table><p>After</p>';
    const segs = htmlToSegments(html);
    expect(segs.map((s) => s.type)).toEqual(['text', 'table', 'text']);
    const table = segs[1];
    expect(table.type).toBe('table');
    if (table.type === 'table') {
      expect(table.rows).toEqual([['A', 'B'], ['1', '2']]);
      expect(table.header).toBe(true);
    }
  });

  it('round-trips segments back to HTML', () => {
    const html =
      '<p>Before</p><table><tr><th>A</th></tr><tr><td>1</td></tr></table><p>After</p>';
    expect(segmentsToHtml(htmlToSegments(html))).toBe(html);
  });

  it('keeps a text segment even when the document is only a table', () => {
    const segs = htmlToSegments('<table><tr><td>x</td></tr></table>');
    expect(segs.some((s) => s.type === 'text')).toBe(true);
    expect(segs.some((s) => s.type === 'table')).toBe(true);
  });

  it('text-only HTML yields a single text segment', () => {
    const segs = htmlToSegments('<p>hello <strong>world</strong></p>');
    expect(segs).toHaveLength(1);
    expect(segs[0].type).toBe('text');
  });

  it('serializes an edited table segment', () => {
    const segs: Segment[] = [
      { type: 'text', id: 't0', doc: { blocks: [] } },
      { type: 'table', id: 'tbl0', rows: [['H'], ['v']], header: true, headerColumn: false },
    ];
    expect(segmentsToHtml(segs)).toBe('<table><tr><th>H</th></tr><tr><td>v</td></tr></table>');
  });

  it('creates an empty table segment (no placeholder text)', () => {
    const t = newTableSegment(2, 3);
    expect(t.rows).toEqual([['', '', ''], ['', '', '']]);
    expect(t.header).toBe(true);
  });

  it('blocksToSegments groups consecutive text blocks together', () => {
    const segs = blocksToSegments([
      { id: 'b0', tag: 'h1', text: 'Title', styleRuns: [] },
      { id: 'b1', tag: 'p', text: 'Body', styleRuns: [] },
    ]);
    expect(segs).toHaveLength(1);
    expect(segs[0].type).toBe('text');
    if (segs[0].type === 'text') {
      expect(segs[0].doc.blocks).toHaveLength(2);
    }
  });
});
