import { Parser } from 'htmlparser2';
import type { HtmlElement, HtmlNode } from './ast';

/**
 * Parse an HTML string into our lightweight {@link HtmlNode} AST.
 *
 * Uses htmlparser2 (pure JS, SAX-style, no DOM dependency) rather than `DOMParser`, which is
 * not available in React Native. Malformed / unbalanced markup is handled gracefully by
 * htmlparser2's error-tolerant tokenizer.
 */
export function parseHtml(html: string): HtmlNode[] {
  const root: HtmlElement = { type: 'element', tag: '#root', attrs: {}, children: [] };
  const stack: HtmlElement[] = [root];

  const parser = new Parser(
    {
      onopentag(name, attrs) {
        const el: HtmlElement = {
          type: 'element',
          tag: name.toLowerCase(),
          attrs: attrs as Record<string, string>,
          children: [],
        };
        stack[stack.length - 1].children.push(el);
        stack.push(el);
      },
      ontext(text) {
        if (text.length === 0) {
          return;
        }
        // htmlparser2 can emit text in several chunks around entities; coalesce adjacent
        // text nodes so downstream sees one contiguous run.
        const siblings = stack[stack.length - 1].children;
        const last = siblings[siblings.length - 1];
        if (last && last.type === 'text') {
          last.text += text;
        } else {
          siblings.push({ type: 'text', text });
        }
      },
      onclosetag() {
        if (stack.length > 1) {
          stack.pop();
        }
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
  );

  parser.write(html);
  parser.end();

  return root.children;
}
