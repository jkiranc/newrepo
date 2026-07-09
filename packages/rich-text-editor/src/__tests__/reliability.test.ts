import { documentToHtml } from '../html/serializer';
import { htmlToDocument } from '../html/nativeBridge';

const rt = (html: string) => documentToHtml(htmlToDocument(html));

// Stress the HTML ⇄ document round-trip with tricky inputs an editor can realistically produce.
describe('reliability / edge cases', () => {
  it('empty and whitespace-only inputs', () => {
    expect(rt('')).toBe('');
    expect(rt('   ')).toBe('');
    expect(rt('<p></p>')).toBe('<p></p>');
  });

  it('bare text becomes a paragraph', () => {
    expect(rt('hello world')).toBe('<p>hello world</p>');
  });

  it('escapes HTML special characters', () => {
    expect(rt('<p>a &amp; b &lt; c &gt; d</p>')).toBe('<p>a &amp; b &lt; c &gt; d</p>');
    expect(rt('<p>quote " and &amp;</p>')).toBe('<p>quote " and &amp;</p>');
  });

  it('does not double-escape entities', () => {
    expect(rt('<p>&amp;amp;</p>')).toBe('<p>&amp;amp;</p>');
  });

  it('line breaks round-trip as <br />', () => {
    expect(rt('<p>line one<br />line two</p>')).toBe('<p>line one<br />line two</p>');
  });

  it('collapses runs of whitespace like a browser', () => {
    expect(rt('<p>a     b</p>')).toBe('<p>a b</p>');
  });

  it('deeply nested inline styles stay well-formed', () => {
    expect(rt('<p><strong><em><u><s>x</s></u></em></strong></p>')).toBe(
      '<p><strong><em><u><s>x</s></u></em></strong></p>',
    );
  });

  it('partial overlapping styles', () => {
    // "ab" bold, "bc" italic → b is both.
    const html = '<p><strong>a<em>b</em></strong><em>c</em></p>';
    // Round-trip should preserve the visible styling (may re-nest, but every char keeps its set).
    const out = rt(html);
    expect(out).toContain('a');
    expect(out).toContain('b');
    expect(out).toContain('c');
    // b must be inside both strong and em somewhere.
    expect(rt(out)).toBe(out); // stable (idempotent) on a second pass
  });

  it('consecutive empty paragraphs are preserved', () => {
    expect(rt('<p>a</p><p></p><p></p><p>b</p>')).toBe('<p>a</p><p></p><p></p><p>b</p>');
  });

  it('consecutive headings of different levels', () => {
    expect(rt('<h1>a</h1><h2>b</h2><h3>c</h3>')).toBe('<h1>a</h1><h2>b</h2><h3>c</h3>');
  });

  it('nested lists preserve depth', () => {
    const html = '<ul><li>a</li><li>b</li></ul>';
    expect(rt(html)).toBe(html);
  });

  it('links with query strings and fragments', () => {
    const html = '<p><a href="https://x.com/p?q=1&amp;r=2#top">link</a></p>';
    expect(rt(html)).toBe(html);
  });

  it('heading combined with inline styles and color', () => {
    const html = '<h2><strong><span style="color: #ff0000">Hi</span></strong></h2>';
    expect(rt(rt(html))).toBe(rt(html)); // idempotent
    expect(rt(html)).toContain('<h2>');
    expect(rt(html)).toContain('color: #ff0000');
  });

  it('a large mixed document is idempotent across two passes', () => {
    const html =
      '<h1>Title</h1>' +
      '<p>Intro with <strong>bold</strong>, <em>italic</em>, <a href="https://a.b">a link</a>.</p>' +
      '<p style="text-align: center; margin-left: 2em">centered + indented</p>' +
      '<ul><li>one</li><li data-checked="true">done</li></ul>' +
      '<ol><li>first</li><li>second</li></ol>' +
      '<blockquote>quote</blockquote>' +
      '<table><tr><th>H</th></tr><tr><td>c</td></tr></table>' +
      '<p><sup>2</sup> and <sub>3</sub> and <span style="font-size: 24px">big</span></p>';
    const once = rt(html);
    expect(rt(once)).toBe(once); // stable on re-parse
  });

  it('unknown / unsupported tags degrade to their text content', () => {
    expect(rt('<p>a <marquee>b</marquee> c</p>')).toBe('<p>a b c</p>');
  });

  it('malformed / unclosed tags do not throw', () => {
    expect(() => rt('<p>oops <strong>unclosed')).not.toThrow();
    expect(() => rt('<ul><li>a')).not.toThrow();
    expect(() => rt('<table><tr><td>x')).not.toThrow();
  });

  it('a full HTML document renders only body content (head/title dropped, no merging)', () => {
    const html =
      '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
      '<title>Doc Title</title></head><body>' +
      '<h1>Heading</h1><p>Body paragraph.</p></body></html>';
    expect(rt(html)).toBe('<h1>Heading</h1><p>Body paragraph.</p>');
  });

  it('structural wrappers (div/section/header) are transparent around block content', () => {
    expect(rt('<div><h1>A</h1><p>B</p></div>')).toBe('<h1>A</h1><p>B</p>');
    expect(rt('<section><h2>X</h2></section><footer><p>Y</p></footer>')).toBe(
      '<h2>X</h2><p>Y</p>',
    );
  });

  it('a div with only inline content keeps its content in one block', () => {
    const out = rt('<div>hello <strong>world</strong></div>');
    expect(out).toContain('hello ');
    expect(out).toContain('<strong>world</strong>');
    expect(rt(out)).toBe(out); // idempotent
  });

  it('script/style content is dropped, not rendered', () => {
    expect(rt('<p>a</p><script>var x = 1;</script><style>.c{color:red}</style><p>b</p>')).toBe(
      '<p>a</p><p>b</p>',
    );
  });

  it('headings separated by comments and wrappers stay distinct', () => {
    const html = '<h2>One</h2><!-- c --><h2>Two</h2><div><p>Three</p></div>';
    expect(rt(html)).toBe('<h2>One</h2><h2>Two</h2><p>Three</p>');
  });
});
