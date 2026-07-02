import type { BlockNode, EmbedPlaceholder, StyleRun } from '../types/nativeTypes';

/**
 * A tag category decides which primitive an element maps to:
 * - `inline`  → contributes a {@link StyleRun} over its text (e.g. `b`, `i`, `a`).
 * - `block`   → starts a new {@link BlockNode} (e.g. `p`, `h1`, `li`).
 * - `embed`   → becomes an {@link EmbedPlaceholder} (e.g. `img`, custom `mention`).
 */
export type TagCategory = 'inline' | 'block' | 'embed';

/** A serialized tag: the tag name plus attributes to emit, produced by the `from*` hooks. */
export interface SerializedTag {
  tag: string;
  attrs: Record<string, string>;
  /** For embeds: emit as a self-closing tag with no children. */
  selfClosing?: boolean;
}

/**
 * Describes how one HTML tag maps to/from the native primitives. This is the extension point:
 * consumers `register()` their own definitions to support arbitrary custom tags without any
 * native code changes.
 */
export interface TagDefinition {
  tag: string;
  category: TagCategory;

  // ── parse: HTML → primitives ──────────────────────────────────────────────
  /** `inline`: the styling this tag contributes to the runs covering its text. */
  toStyleRun?: (attrs: Record<string, string>) => Partial<StyleRun>;
  /** `block`: the block-level properties this tag sets. */
  toBlock?: (attrs: Record<string, string>) => Partial<BlockNode>;
  /** `embed`: the embed this tag becomes. `textContent` is the tag's inner text, if any. */
  toEmbed?: (
    attrs: Record<string, string>,
    textContent: string,
  ) => Partial<EmbedPlaceholder>;

  // ── serialize: primitives → HTML ──────────────────────────────────────────
  fromStyleRun?: (run: StyleRun) => SerializedTag | null;
  fromBlock?: (block: BlockNode) => SerializedTag | null;
  fromEmbed?: (embed: EmbedPlaceholder) => SerializedTag | null;
}

/**
 * Holds the set of known tags. A single default instance ({@link defaultTagRegistry}) is
 * pre-populated with the built-in HTML tags; consumers register additional tags on it.
 */
export class TagRegistry {
  private readonly defs = new Map<string, TagDefinition>();

  register(def: TagDefinition): void {
    this.defs.set(def.tag.toLowerCase(), def);
  }

  /** Register several definitions that share the same behavior (e.g. `b` and `strong`). */
  registerAlias(tags: string[], def: Omit<TagDefinition, 'tag'>): void {
    for (const tag of tags) {
      this.register({ ...def, tag });
    }
  }

  unregister(tag: string): void {
    this.defs.delete(tag.toLowerCase());
  }

  get(tag: string): TagDefinition | undefined {
    return this.defs.get(tag.toLowerCase());
  }

  has(tag: string): boolean {
    return this.defs.has(tag.toLowerCase());
  }

  getAll(): TagDefinition[] {
    return [...this.defs.values()];
  }

  /** Find the block definition whose `fromBlock` claims this block (used by the serializer). */
  serializeBlock(block: BlockNode): SerializedTag | null {
    const def = this.defs.get(block.tag.toLowerCase());
    return def?.fromBlock?.(block) ?? null;
  }

  serializeEmbed(embed: EmbedPlaceholder): SerializedTag | null {
    const def = this.defs.get(embed.tag.toLowerCase());
    return def?.fromEmbed?.(embed) ?? null;
  }
}

/** The registry the editor uses by default. Pre-loaded with built-in tags on import. */
export const defaultTagRegistry = new TagRegistry();
