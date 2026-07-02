# Manual native testing checklist

Native text editing (typing, IME, cursor, scrolling, embeds) cannot be meaningfully
unit-tested. Run this checklist on both an iOS simulator and an Android emulator at the end
of every phase that touches native code, using the [`example`](../example) app.

## Setup

```sh
cd example
yarn ios       # or: yarn android
```

## Inline styles (Phase 2 / 3)

- [ ] Type plain text; characters appear with correct caret position.
- [ ] Select a range, tap **Bold** → range becomes bold; tap again → un-bolds.
- [ ] Repeat for italic, underline, strikethrough.
- [ ] Toggle bold with no selection, then type → new text is bold (typing attributes).
- [ ] Apply overlapping styles (`bold` over `italic`) → both render.
- [ ] `onChangeHtml` fires with correctly nested/merged tags (no `<b>a</b><b>b</b>` frag).

## Blocks (Phase 4a)

- [ ] Set block to H1/H2/paragraph → sizing and spacing update.
- [ ] Bullet list and ordered list → correct markers and indentation.
- [ ] Blockquote and code block → correct indent/background.

## Embeds (Phase 4b)

- [ ] Insert an image embed → image loads and lays out inline; text reflows around it.
- [ ] Insert a `<mention>` chip → rounded highlighted chip renders inline.
- [ ] Tap a chip → `onEmbedPress` fires with the tag + data.
- [ ] Delete across an embed → embed is removed cleanly.

## Round-trip

- [ ] `setHTML(getHTML())` is stable (no drift after several apply/undo cycles).
- [ ] Custom `<mention>` survives a full HTML → editor → HTML round-trip.

## Robustness

- [ ] IME / predictive text / autocorrect (test CJK input if possible) behaves sanely.
- [ ] Rotate device mid-edit → content and caret preserved.
- [ ] Scroll a long document → smooth, no dropped spans.
