/**
 * A minimal HTML AST. Intentionally tiny — just enough for the {@link nativeBridge} to walk
 * and translate into a {@link RichTextDocument}. We do NOT build a full DOM (React Native has
 * no `DOMParser`); {@link parseHtml} produces this shape from htmlparser2's SAX callbacks.
 */

export interface HtmlElement {
  type: 'element';
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
}

export interface HtmlText {
  type: 'text';
  text: string;
}

export type HtmlNode = HtmlElement | HtmlText;

export function isElement(node: HtmlNode): node is HtmlElement {
  return node.type === 'element';
}

export function isText(node: HtmlNode): node is HtmlText {
  return node.type === 'text';
}
