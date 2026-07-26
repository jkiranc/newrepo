# react-native-fabric-rich-text — Project Handoff / Status

A from-scratch **React Native New Architecture (Fabric)** rich-text (WYSIWYG) editor with
**native rendering** (iOS TextKit/UITextView in Swift, Android Spannable/EditText in Kotlin),
an **extensible tag registry**, and full **HTML round-tripping**. Built because existing RN
editors have limited / non-extensible HTML tag support.

> This file is the single source of truth for context. It is meant to replace re-reading the
> whole codebase. Keep it updated as things change.

---

## 1. Repo layout

```
newrepo/
├─ packages/rich-text-editor/        # the library
│  ├─ src/                           # TypeScript (JS layer + codegen spec)
│  ├─ ios/                           # Swift + ObjC++ (Fabric)
│  ├─ android/src/main/java/com/richtexteditor/   # Kotlin (Fabric)
│  └─ README.md
├─ example/                          # RN example app (bundled into the CI APK)
│  ├─ App.tsx
│  └─ src/screens/{BasicDemo,CustomTagDemo}.tsx
├─ .github/workflows/android-apk.yml # CI: builds a sideloadable Android APK artifact
└─ PROJECT_STATUS.md                 # this file
```

- **Working branch:** `claude/new-session-ce1bf9`
- **Package name:** `react-native-fabric-rich-text`

---

## 2. Core architecture (read this first)

### 2.1 Native never sees HTML
The document crosses the Fabric bridge as a **JSON string** (`RichTextDocument`). All HTML/tag
knowledge lives in JS. This is what makes the tag vocabulary extensible without native code.

Pipeline:
```
HTML ⇄ (htmlparser2) ⇄ HtmlNode AST ⇄ (nativeBridge/serializer + TagRegistry) ⇄ RichTextDocument (JSON) ⇄ native spans/attributes
```

### 2.2 Native document model (`src/types/nativeTypes.ts`)
```ts
RichTextDocument = { blocks: BlockNode[] }

BlockNode = {
  id, tag,            // 'p' | 'h1'..'h6' | 'blockquote' | 'li' | 'pre' | custom
  text,               // plain text; embeds marked by U+FFFC (OBJECT_REPLACEMENT_CHAR)
  styleRuns: StyleRun[],
  listType?, listDepth?, listIndex?,   // 'bullet' | 'ordered' | 'check'
  indentLevel?, align?, checked?,
  embeds?: EmbedPlaceholder[], data?,
}

StyleRun = {
  start, length,
  bold?, italic?, underline?, strikethrough?, superscript?, subscript?,
  color?, backgroundColor?, fontSize?, fontFamily?, link?, tag, data?,
}

EmbedPlaceholder = { id, offset, tag, kind: 'image'|'chip'|'table', ..., data }
```

### 2.3 Segmented editor (inline blocks)
`RichTextEditor` is **not** a single native view. It is a container that renders a vertical
stack of **segments**:
- **Text segment** → one native Fabric editor (`TextSegmentEditor` → `RichTextEditorView`),
  holding a run of contiguous non-table blocks (paragraphs, headings, lists, …).
- **Table segment** → a pure-RN editable grid (`EditableTable`).

Tables cannot live inside the single native text view, so they become their own segments
between text segments. One shared **Toolbar** targets whichever text segment is focused
(the "active" segment). `getHTML()` / `onChangeHtml` reassemble all segments back into one
HTML string. `src/html/segments.ts` splits a document into segments and reassembles it.

Key consequence: each text segment reports its own content height (`onContentSizeChange`) so it
auto-grows to fit — no clipping, no nested scrolling.

---

## 3. Features implemented

**Inline styles:** bold, italic, underline, strikethrough, superscript, subscript, text color,
background color, **font size** (px; pt supported via config), **links** (incl. custom display
text via `insertLink`).

**Block types:** paragraph, h1–h6, blockquote, pre/code, **alignment** (left/center/right/
justify), **indent** +/- (round-trips as `margin-left`).

**Lists:** bullet, numbered, checklist (Android has checkbox tap-toggle). Via `toggleList`.

**Editable tables:** type in cells; **insert row above/below**, **insert column left/right**,
**delete row/column**, **header row** & **header column** toggles, **delete table**. The
Column ▾ / Row ▾ control menus appear at the top of a table **only when it's focused**. Cells
stretch to fill width and scroll horizontally when too wide. Round-trips to `<table>` HTML
(first row/col become `<th>`).

**Embeds:** image (async load), chip (e.g. custom `<mention>`), drawn natively; read-only
tables can also be drawn as embeds, but the editable-table segment path is the default now.

**Links UX:** tapping a link shows a built-in popover → **Open** (launches URL), **Edit**
(change href), **Remove**. Consumers can override via the `onLinkPress` prop (return `true`).

**Read-only renderer:** `RichTextViewer` (`src/RichTextViewer/RichTextViewer.tsx`) — a
lightweight, **pure-RN** (no native view) component that renders the editor's HTML read-only
with tappable links and full styling (headings, lists, blockquote, alignment, indent, images,
chips, tables). Use it for previews/feeds/messages where editing isn't needed — far cheaper
than mounting the editor. Example: `Preview` tab pastes HTML and renders it below.

**Other:** undo/redo (per text segment, JS snapshot stack), emoji/text insertion.

**Toolbar** (`src/Toolbar/Toolbar.tsx`): font/block dropdown (Normal + H1–H6), font-size
dropdown (unit fixed by `fontSizeUnit` prop = `'px'`|`'pt'`), B/I/U/S/x²/x₂, alignment, color
picker, list buttons, link dialog (Text + URL), blockquote, indent, emoji, table size picker,
undo/redo.

---

## 4. Native bridge surface (codegen spec: `src/RichTextEditorNativeComponent.ts`)

**Commands:** `setDocument`, `focus`, `blur`, `toggleInlineStyle`, `setBlockType`,
`setAlignment`, `setTextColor`, `setLink`, `insertLink`, `setLinkRange`, `setFontSize`,
`adjustIndent`, `toggleList`, `insertText`, `insertEmbed`.

**Events:** `onDocumentChange`, `onSelectionChange` (carries `blockTag`/`align`/`listType` for the
caret's paragraph so a toolbar reflects real state), `onEmbedPress`, `onContentSizeChange`,
`onLinkPress`.

> Codegen rule: each command's first arg must be written literally as
> `React.ElementRef<HostComponent<NativeProps>>` (no type alias).

---

## 5. Key files by role

**JS / TS**
- `src/RichTextEditor.tsx` — segmented container; public `RichTextEditorRef` + built-in link popover.
- `src/TextSegmentEditor.tsx` — wraps one native `RichTextEditorView`; per-segment undo/redo, auto-height.
- `src/EditableTable/EditableTable.tsx` — editable grid + Column/Row menus.
- `src/Toolbar/Toolbar.tsx` — the toolbar UI.
- `src/RichTextEditorNativeComponent.ts` — Fabric codegen spec (props/commands/events).
- `src/types/nativeTypes.ts` — the document model.
- `src/html/parser.ts`, `ast.ts` — htmlparser2 wrapper + AST.
- `src/html/nativeBridge.ts` — HTML AST → document (astToDocument, coalesceRuns, indent/align parse, table parse).
- `src/html/serializer.ts` — document → HTML (block styles, lists, tables, `rowsToTableHtml`).
- `src/html/segments.ts` — document ⇄ segments (text/table) + reassembly.
- `src/registry/TagRegistry.ts`, `builtInTags.ts` — the extension point + built-in tag defs.
- `src/index.ts` — public exports.

**iOS (Swift + ObjC++)**
- `ios/RichTextEditorView.mm` — thin Fabric shim (props/commands → Swift; callbacks → events).
- `ios/RichTextEditorView.swift` — `RichTextEditorViewImpl`; owns the UITextView, all commands, reconstruction.
- `ios/SpanApplier.swift` — document → NSAttributedString; heading fonts; hex colors; rte* attribute keys.
- `ios/StyleEngine.swift` — inline style toggling.
- `ios/EmbedTextAttachment.swift` — chip/image/table drawing.

**Android (Kotlin)**
- `RichTextEditorView.kt` — the EditText; all commands, reconstruction (`buildBlockJson`), touch handling.
- `RichTextEditorViewManager.kt` — Fabric delegate wiring (props/commands/events).
- `SpanApplier.kt` — document → SpannableStringBuilder; block styling (`styleBlock`).
- `StyleEngine.kt` — inline style spans.
- `BlockTagSpan.kt`, `ListMarkerSpan.kt`, `HeadingSizeSpan.kt`, `EmbedReplacementSpan.kt` — custom spans.
- `RichTextEditorEvents.kt` — Fabric Event classes.

---

## 6. Android reconstruction gotchas (source of most past bugs)

Block type/list/align/indent are stored as **spans** and reconstructed by splitting the buffer
on `\n`. Spans are `SPAN_INCLUSIVE_INCLUSIVE` so typing within a heading extends it — but that
also lets them **bleed across newlines**. Guards (all in `RichTextEditorView.kt`):
- `normalizeBlockSpans()` — clips every block span to the end of the paragraph it starts in
  (run on each edit). Prevents heading/list bleeding onto following lines.
- `buildBlockJson` — a paragraph takes its tag **only** from a block span whose start is inside
  that paragraph (`getSpanStart in start until end`), so a bled span can't relabel a neighbor.
- `stripCollapsedBlockSpans()` — removes zero-length block spans (ghost bullets after Select-All+Delete).
- Headings use `HeadingSizeSpan` (absolute px) not `RelativeSizeSpan` (so explicit font size
  overrides cleanly instead of multiplying).
- `background = null` on the EditText removes the Material underline between stacked segments.
- `onFocusChanged` captures the caret before a toolbar popover steals focus (`toolbarCaret()`/`lastCaret`).

---

## 7. Build & CI

- `.github/workflows/android-apk.yml` builds a **release APK** (JS bundled, debug-keystore
  signed) and uploads it as a workflow **artifact** (download → sideload).
- The workflow generates a host RN app around the package + overlays `example/` (custom
  metro.config for the monorepo).
- **Native code cannot be compiled locally** (no Xcode/Android SDK in the dev env). Verification
  = CI APK build + Jest + `tsc`.
- To test a change on-device via CI: commit → push → wait for the `Android APK` run to go green →
  download the artifact.
- **Local builds:** `scripts/local-android.sh` replicates CI on your machine (generates a host
  RN app, links the library, runs/builds). See `LOCAL_DEV.md` for the full local workflow
  (JS-only checks, dev run with Fast Refresh, and building a sideloadable APK).

---

## 8. Testing

- **92 Jest tests** across: `serializer`, `nativeBridge`, `parser`, `tagRegistry`, `segments`,
  `roundtrip` (`roundtrip.test.ts` validates every toolbar option's HTML round-trip end to end).
- `npx tsc --noEmit` must be clean.
- Run from `packages/rich-text-editor`: `npx tsc --noEmit && npx jest`.

---

## 9. Conventions / standing rules

- **Do NOT push / trigger a CI build until the user explicitly says "push".** Commit locally,
  hold.
- Commits authored & committed as **`Claude <noreply@anthropic.com>`**, SSH-signed by the
  environment signer. (Local `git verify-commit` reports `N` because the signer can't verify and
  the pubkey file is empty — this is expected; GitHub shows them verified.)
- No dark-mode support in the editor.
- Do not put the model identifier in commits/PRs/code.

---

## 10. Known limitations / pending

- **iOS lists** render as indentation only (no bullet/number glyph); **iOS checklist
  tap-toggle** not implemented (Android has both).
- **Undo/redo is per text segment** — undoing does not remove an inserted table, and history is
  not shared across segments.
- **Inline styles carry across paragraph breaks** (e.g. bold continues after Enter). Standard
  behavior, but a "clean new line" option could be added if desired.
- **Open verification:** confirm the heading fix on device — test: type `Line A` → set
  Heading 1 → Enter → type `Line B`; expect `<h1>Line A</h1><p>Line B</p>`.

---

## 11. Recent fix timeline (most recent last)

- Heading size vs. explicit font size compounding (Android) → `HeadingSizeSpan` absolute.
- Read-only tables → editable-table segments (inline-blocks re-architecture, no native change).
- Auto-height (`onContentSizeChange`) so stacked segments don't clip.
- Removed EditText underline; table cells stretch to fill width.
- Ghost list markers after clearing → `stripCollapsedBlockSpans`.
- Directional table inserts + header row/column menus; contextual (focused-only) table controls.
- Heading/list bleeding across paragraphs → `normalizeBlockSpans` + span-origin tag attribution.
- Link tap → Open/Edit/Remove popover (`onLinkPress` + `setLinkRange`); px/pt as `fontSizeUnit` prop.

---

## 12. Extending (tag registry)

```ts
import { defaultTagRegistry } from 'react-native-fabric-rich-text';

defaultTagRegistry.register({
  tag: 'mention',
  category: 'embed',                 // 'inline' | 'block' | 'embed'
  toEmbed: (attrs) => ({ kind: 'chip', label: '@' + attrs['data-label'], data: { id: attrs['data-id'] } }),
  fromEmbed: (embed) => ({ tag: 'mention', attrs: { 'data-id': embed.data.id }, selfClosing: true }),
});
```
`to*` hooks parse HTML → model; `from*` hooks serialize model → HTML. A registered custom tag
renders natively with **zero native changes** (chips/images are drawn from the model).
