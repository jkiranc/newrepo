import { parseHtml } from '../html/parser';
import { isElement, isText, type HtmlElement } from '../html/ast';

describe('parseHtml', () => {
  it('parses a simple paragraph with a nested tag', () => {
    const nodes = parseHtml('<p>Hello <b>world</b></p>');
    expect(nodes).toHaveLength(1);
    const p = nodes[0] as HtmlElement;
    expect(isElement(p)).toBe(true);
    expect(p.tag).toBe('p');
    expect(p.children).toHaveLength(2);
    expect(isText(p.children[0])).toBe(true);
    const b = p.children[1] as HtmlElement;
    expect(b.tag).toBe('b');
    expect(b.children[0]).toEqual({ type: 'text', text: 'world' });
  });

  it('lowercases tags and attribute names', () => {
    const nodes = parseHtml('<P STYLE="color: red">x</P>');
    const p = nodes[0] as HtmlElement;
    expect(p.tag).toBe('p');
    expect(p.attrs.style).toBe('color: red');
  });

  it('decodes entities', () => {
    const nodes = parseHtml('<p>a &amp; b &lt; c</p>');
    const p = nodes[0] as HtmlElement;
    expect(p.children[0]).toEqual({ type: 'text', text: 'a & b < c' });
  });

  it('tolerates unbalanced markup without throwing', () => {
    expect(() => parseHtml('<p>oops <b>bold')).not.toThrow();
    const nodes = parseHtml('<p>oops <b>bold');
    const p = nodes[0] as HtmlElement;
    expect(p.tag).toBe('p');
  });

  it('captures attributes on a custom tag', () => {
    const nodes = parseHtml('<mention data-id="123" data-label="alice">@alice</mention>');
    const mention = nodes[0] as HtmlElement;
    expect(mention.tag).toBe('mention');
    expect(mention.attrs).toEqual({ 'data-id': '123', 'data-label': 'alice' });
  });
});
