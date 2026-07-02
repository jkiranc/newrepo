import { TagRegistry } from '../registry/TagRegistry';
import { installBuiltInTags } from '../registry/builtInTags';

describe('TagRegistry', () => {
  it('installs built-in tags', () => {
    const registry = new TagRegistry();
    installBuiltInTags(registry);
    expect(registry.has('b')).toBe(true);
    expect(registry.has('strong')).toBe(true);
    expect(registry.get('b')?.category).toBe('inline');
    expect(registry.get('h1')?.category).toBe('block');
    expect(registry.get('img')?.category).toBe('embed');
  });

  it('registers, gets, and unregisters a custom tag', () => {
    const registry = new TagRegistry();
    registry.register({
      tag: 'highlight',
      category: 'inline',
      toStyleRun: () => ({ backgroundColor: '#ff0' }),
    });
    expect(registry.get('highlight')?.toStyleRun?.({})).toEqual({ backgroundColor: '#ff0' });
    registry.unregister('highlight');
    expect(registry.has('highlight')).toBe(false);
  });

  it('is case-insensitive on tag names', () => {
    const registry = new TagRegistry();
    registry.register({ tag: 'Callout', category: 'block' });
    expect(registry.has('callout')).toBe(true);
    expect(registry.get('CALLOUT')?.tag).toBe('Callout');
  });

  it('lets a consumer override a built-in tag', () => {
    const registry = new TagRegistry();
    installBuiltInTags(registry);
    registry.register({
      tag: 'b',
      category: 'inline',
      toStyleRun: () => ({ bold: true, color: '#f00' }),
    });
    expect(registry.get('b')?.toStyleRun?.({})).toEqual({ bold: true, color: '#f00' });
  });
});
