import UIKit

// -------------------------------------------------------------------------------------------
// RichTextEditorViewImpl
//
// The Swift side of the iOS native view. Owns a UITextView and the live editing buffer. All
// tag/HTML knowledge lives in JS — this class only ever sees the native document model
// (decoded by SpanApplier). Exposed to the ObjC++ Fabric shim (RichTextEditorView.mm).
//
// This is a Phase-2 scaffold: inline style runs are applied and change/selection events are
// emitted. Blocks/embeds/commands are stubbed where noted and filled in over Phases 3–4.
// -------------------------------------------------------------------------------------------
@objc(RichTextEditorViewImpl)
public final class RichTextEditorViewImpl: NSObject, UITextViewDelegate {

    @objc public let textView: UITextView
    @objc public var onDocumentChangeJSON: ((String) -> Void)?
    @objc public var onSelectionChangeBlock: ((String, Int, Int, String) -> Void)?
    @objc public var onEmbedPressBlock: ((String, String) -> Void)?

    private var document = RichTextDocument(blocks: [])
    private var didSeedInitialDocument = false
    private var changeDebounce: DispatchWorkItem?

    @objc public override init() {
        textView = UITextView(frame: .zero)
        super.init()
        textView.delegate = self
        textView.font = .systemFont(ofSize: SpanApplier.defaultFontSize)
        textView.textContainerInset = UIEdgeInsets(top: 12, left: 12, bottom: 12, right: 12)
    }

    // MARK: - Props

    /// Seed the buffer once. Subsequent updates must go through `setDocumentJSON` (a command)
    /// so live typing is never clobbered by prop re-renders.
    @objc public func applyInitialDocumentJSON(_ json: String) {
        guard !didSeedInitialDocument, !json.isEmpty else { return }
        didSeedInitialDocument = true
        setDocumentJSON(json)
    }

    @objc public func setEditable(_ editable: Bool) {
        textView.isEditable = editable
    }

    @objc public func setPlaceholder(_ placeholder: String) {
        // Placeholder rendering is a Phase-5 polish item (UITextView has no native placeholder).
    }

    // MARK: - Commands

    @objc public func setDocumentJSON(_ json: String) {
        guard let decoded = SpanApplier.decode(json) else { return }
        document = decoded
        textView.attributedText = SpanApplier.attributedString(for: decoded)
    }

    @objc public func focus() { textView.becomeFirstResponder() }
    @objc public func blur() { textView.resignFirstResponder() }

    @objc public func toggleInlineStyle(_ style: String) {
        // Phase 2: mutate typingAttributes / selected range, then re-emit onDocumentChange.
        // See docs/architecture.md — coalescing must mirror the JS bridge exactly.
        applyInlineStyleToSelection(style)
        emitDocumentChange()
    }

    @objc public func setBlockType(_ tag: String) {
        // Phase 4a: change the current block's tag and reflow paragraph style.
        emitDocumentChange()
    }

    @objc public func insertEmbedJSON(_ json: String) {
        // Phase 4b: insert an NSTextAttachment at the caret for the decoded embed.
        emitDocumentChange()
    }

    // MARK: - UITextViewDelegate

    public func textViewDidChange(_ textView: UITextView) {
        scheduleDocumentChange()
    }

    public func textViewDidChangeSelection(_ textView: UITextView) {
        let range = textView.selectedRange
        let styles = activeInlineStyles(at: range)
        let blockId = currentBlockId(for: range)
        onSelectionChangeBlock?(blockId, range.location, range.location + range.length, styles)
    }

    // MARK: - Change emission

    private func scheduleDocumentChange() {
        changeDebounce?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.emitDocumentChange() }
        changeDebounce = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.03, execute: work)
    }

    private func emitDocumentChange() {
        let rebuilt = rebuildDocument()
        guard let data = try? JSONEncoder().encode(rebuilt),
              let json = String(data: data, encoding: .utf8) else { return }
        document = rebuilt
        onDocumentChangeJSON?(json)
    }

    // MARK: - Attributed string → document

    /// Walk the attributed string and coalesce contiguous equal-attribute ranges into runs.
    /// Phase 3 fills in full block/list/embed reconstruction; Phase 2 keeps a single block.
    private func rebuildDocument() -> RichTextDocument {
        let attributed = textView.attributedText ?? NSAttributedString()
        let text = attributed.string
        var runs: [StyleRun] = []

        attributed.enumerateAttributes(in: NSRange(location: 0, length: attributed.length)) { attrs, range, _ in
            guard let run = styleRun(from: attrs, range: range) else { return }
            if var last = runs.last, last.start + last.length == run.start, sameStyle(last, run) {
                last.length += run.length
                runs[runs.count - 1] = last
            } else {
                runs.append(run)
            }
        }

        let blockId = document.blocks.first?.id ?? "b0"
        let block = BlockNode(
            id: blockId, tag: document.blocks.first?.tag ?? "p",
            text: text, styleRuns: runs
        )
        return RichTextDocument(blocks: [block])
    }

    private func styleRun(from attrs: [NSAttributedString.Key: Any], range: NSRange) -> StyleRun? {
        var run = StyleRun(start: range.location, length: range.length, tag: "span")
        var styled = false
        if let font = attrs[.font] as? UIFont {
            let traits = font.fontDescriptor.symbolicTraits
            if traits.contains(.traitBold) { run.bold = true; styled = true }
            if traits.contains(.traitItalic) { run.italic = true; styled = true }
        }
        if attrs[.underlineStyle] != nil { run.underline = true; styled = true }
        if attrs[.strikethroughStyle] != nil { run.strikethrough = true; styled = true }
        if attrs[.link] != nil, let url = attrs[.link] as? URL { run.link = url.absoluteString; styled = true }
        return styled ? run : nil
    }

    private func sameStyle(_ a: StyleRun, _ b: StyleRun) -> Bool {
        a.bold == b.bold && a.italic == b.italic && a.underline == b.underline
            && a.strikethrough == b.strikethrough && a.color == b.color
            && a.backgroundColor == b.backgroundColor && a.link == b.link
    }

    // MARK: - Selection helpers (stubs refined in later phases)

    private func applyInlineStyleToSelection(_ style: String) { /* Phase 2 detail */ }
    private func activeInlineStyles(at range: NSRange) -> String { "" }
    private func currentBlockId(for range: NSRange) -> String { document.blocks.first?.id ?? "b0" }
}
