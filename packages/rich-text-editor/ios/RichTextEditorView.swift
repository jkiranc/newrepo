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
    @objc public var onLinkPressBlock: ((String, Int, Int) -> Void)?
    @objc public var onContentHeightChange: ((CGFloat) -> Void)?
    private var lastReportedHeight: CGFloat = -1

    private var document = RichTextDocument(blocks: [])
    private var didSeedInitialDocument = false
    private var changeDebounce: DispatchWorkItem?
    // Last non-empty selection, so a toolbar popover that resigns first responder can still
    // target the range the user had highlighted.
    private var lastSelection = NSRange(location: 0, length: 0)

    @objc public override init() {
        textView = UITextView(frame: .zero)
        super.init()
        textView.delegate = self
        textView.font = .systemFont(ofSize: SpanApplier.defaultFontSize)
        textView.textContainerInset = UIEdgeInsets(top: 12, left: 12, bottom: 12, right: 12)

        // Detect taps on embeds (chips/images) so they can report onEmbedPress.
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
        tap.cancelsTouchesInView = false
        textView.addGestureRecognizer(tap)
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
        wireImageCallbacks()
        DispatchQueue.main.async { [weak self] in self?.reportContentHeight() }
    }

    /// Report the intrinsic content height so the JS wrapper can size this segment to fit its
    /// text (each text segment stacks in the container, so a fixed height would clip content).
    @objc public func reportContentHeight() {
        let width = textView.bounds.width
        guard width > 0 else { return }
        let fitted = textView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        let h = ceil(fitted.height)
        if abs(h - lastReportedHeight) > 0.5 {
            lastReportedHeight = h
            onContentHeightChange?(h)
        }
    }

    @objc public func focus() { textView.becomeFirstResponder() }
    @objc public func blur() { textView.resignFirstResponder() }

    @objc public func toggleInlineStyle(_ styleName: String) {
        guard let style = InlineStyle(rawValue: styleName) else { return }
        let selected = textView.selectedRange
        if selected.length > 0 {
            // Toggle across the selection, then re-emit the rebuilt document.
            let mutable = NSMutableAttributedString(attributedString: textView.attributedText ?? NSAttributedString())
            StyleEngine.toggle(style, in: mutable, range: selected)
            textView.attributedText = mutable
            textView.selectedRange = selected
            emitDocumentChange()
        } else {
            // Collapsed caret: flip the pending typing attribute so new text inherits the style.
            let (attrs, _) = StyleEngine.toggledTypingAttributes(textView.typingAttributes, style: style)
            textView.typingAttributes = attrs
        }
        notifySelectionChange()
    }

    @objc public func setBlockType(_ tag: String) {
        guard let current = textView.attributedText else { return }
        let paragraphRange = (current.string as NSString).paragraphRange(for: textView.selectedRange)
        let mutable = NSMutableAttributedString(attributedString: current)
        applyBlockStyle(tag: tag, to: mutable, range: paragraphRange)
        let selection = textView.selectedRange
        textView.attributedText = mutable
        textView.selectedRange = selection
        emitDocumentChange()
        notifySelectionChange()
    }

    /// Re-style a paragraph for a new block tag, preserving inline traits (bold/italic) and the
    /// existing alignment while swapping the base font; stamp the tag so reconstruction recovers it.
    private func applyBlockStyle(tag: String, to string: NSMutableAttributedString, range: NSRange) {
        guard range.length > 0 else { return }
        let baseFont = SpanApplier.font(forTag: tag)
        let align = string.attribute(.rteAlign, at: range.location, effectiveRange: nil) as? String
        let paragraph = SpanApplier.paragraphStyle(forTag: tag, listType: nil, indentLevel: nil, align: align)
        string.enumerateAttribute(.font, in: range) { value, sub, _ in
            let traits = (value as? UIFont)?.fontDescriptor.symbolicTraits ?? []
            var font = baseFont
            if !traits.isEmpty, let descriptor = font.fontDescriptor.withSymbolicTraits(traits) {
                font = UIFont(descriptor: descriptor, size: font.pointSize)
            }
            string.addAttribute(.font, value: font, range: sub)
        }
        string.addAttribute(.paragraphStyle, value: paragraph, range: range)
        string.addAttribute(.rteBlockTag, value: tag, range: range)
    }

    @objc public func setAlignment(_ align: String) {
        guard let current = textView.attributedText else { return }
        let range = (current.string as NSString).paragraphRange(for: textView.selectedRange)
        guard range.length > 0 else { return }
        let mutable = NSMutableAttributedString(attributedString: current)
        let tag = mutable.attribute(.rteBlockTag, at: range.location, effectiveRange: nil) as? String ?? "p"
        let listType = mutable.attribute(.rteListType, at: range.location, effectiveRange: nil) as? String
        let indent = mutable.attribute(.rteIndentLevel, at: range.location, effectiveRange: nil) as? Int
        let paragraph = SpanApplier.paragraphStyle(forTag: tag, listType: listType, indentLevel: indent, align: align)
        mutable.addAttribute(.paragraphStyle, value: paragraph, range: range)
        mutable.addAttribute(.rteAlign, value: align, range: range)
        let selection = textView.selectedRange
        textView.attributedText = mutable
        textView.selectedRange = selection
        emitDocumentChange()
        notifySelectionChange()
    }

    @objc public func setTextColor(_ color: String) {
        var selected = textView.selectedRange
        let length = textView.attributedText?.length ?? 0
        if selected.length == 0, lastSelection.length > 0, NSMaxRange(lastSelection) <= length {
            selected = lastSelection
        }
        if selected.length > 0 {
            let mutable = NSMutableAttributedString(attributedString: textView.attributedText ?? NSAttributedString())
            if color.isEmpty {
                mutable.removeAttribute(.foregroundColor, range: selected)
            } else if let uiColor = UIColor(hex: color) {
                mutable.addAttribute(.foregroundColor, value: uiColor, range: selected)
            }
            textView.attributedText = mutable
            textView.selectedRange = selected
            emitDocumentChange()
        } else {
            var attrs = textView.typingAttributes
            if color.isEmpty {
                attrs.removeValue(forKey: .foregroundColor)
            } else if let uiColor = UIColor(hex: color) {
                attrs[.foregroundColor] = uiColor
            }
            textView.typingAttributes = attrs
        }
        notifySelectionChange()
    }

    @objc public func toggleList(_ listType: String) {
        guard let current = textView.attributedText else { return }
        let range = (current.string as NSString).paragraphRange(for: textView.selectedRange)
        guard range.length > 0 else { return }
        let mutable = NSMutableAttributedString(attributedString: current)
        let currentType = mutable.attribute(.rteListType, at: range.location, effectiveRange: nil) as? String
        let newType: String? = currentType == listType ? nil : listType
        let tag = mutable.attribute(.rteBlockTag, at: range.location, effectiveRange: nil) as? String ?? "p"
        let align = mutable.attribute(.rteAlign, at: range.location, effectiveRange: nil) as? String
        let indent = mutable.attribute(.rteIndentLevel, at: range.location, effectiveRange: nil) as? Int
        let paragraph = SpanApplier.paragraphStyle(forTag: tag, listType: newType, indentLevel: indent, align: align)
        mutable.addAttribute(.paragraphStyle, value: paragraph, range: range)
        if let newType {
            mutable.addAttribute(.rteListType, value: newType, range: range)
            if newType == "check" {
                mutable.addAttribute(.rteChecked, value: false, range: range)
            } else {
                mutable.removeAttribute(.rteChecked, range: range)
            }
        } else {
            mutable.removeAttribute(.rteListType, range: range)
            mutable.removeAttribute(.rteChecked, range: range)
        }
        let selection = textView.selectedRange
        textView.attributedText = mutable
        textView.selectedRange = selection
        emitDocumentChange()
        notifySelectionChange()
    }

    @objc public func setLink(_ url: String) {
        var selected = textView.selectedRange
        let length = textView.attributedText?.length ?? 0
        if selected.length == 0, lastSelection.length > 0, NSMaxRange(lastSelection) <= length {
            selected = lastSelection
        }
        guard selected.length > 0 else { return }
        let mutable = NSMutableAttributedString(attributedString: textView.attributedText ?? NSAttributedString())
        if url.isEmpty {
            mutable.removeAttribute(.link, range: selected)
        } else if let parsed = URL(string: url) {
            mutable.addAttribute(.link, value: parsed, range: selected)
        }
        textView.attributedText = mutable
        textView.selectedRange = selected
        emitDocumentChange()
    }

    @objc public func setFontSize(_ size: Int) {
        var selected = textView.selectedRange
        let length = textView.attributedText?.length ?? 0
        if selected.length == 0, lastSelection.length > 0, NSMaxRange(lastSelection) <= length {
            selected = lastSelection
        }
        if selected.length > 0 {
            let mutable = NSMutableAttributedString(attributedString: textView.attributedText ?? NSAttributedString())
            let tag = mutable.attribute(.rteBlockTag, at: selected.location, effectiveRange: nil) as? String ?? "p"
            let baseSize = SpanApplier.font(forTag: tag).pointSize
            mutable.enumerateAttribute(.font, in: selected) { value, sub, _ in
                let current = (value as? UIFont) ?? UIFont.systemFont(ofSize: baseSize)
                let target = size > 0 ? CGFloat(size) : baseSize
                mutable.addAttribute(.font, value: current.withSize(target), range: sub)
            }
            textView.attributedText = mutable
            textView.selectedRange = selected
            emitDocumentChange()
        } else {
            var attrs = textView.typingAttributes
            let current = (attrs[.font] as? UIFont) ?? UIFont.systemFont(ofSize: SpanApplier.defaultFontSize)
            let target = size > 0 ? CGFloat(size) : SpanApplier.defaultFontSize
            attrs[.font] = current.withSize(target)
            textView.typingAttributes = attrs
        }
        notifySelectionChange()
    }

    @objc public func insertLink(_ text: String, url: String) {
        guard !text.isEmpty else { return }
        var attrs = textView.typingAttributes
        if attrs[.font] == nil {
            attrs[.font] = UIFont.systemFont(ofSize: SpanApplier.defaultFontSize)
        }
        if url.isEmpty {
            attrs.removeValue(forKey: .link)
        } else if let parsed = URL(string: url) {
            attrs[.link] = parsed
        }
        let piece = NSAttributedString(string: text, attributes: attrs)
        let mutable = NSMutableAttributedString(attributedString: textView.attributedText ?? NSAttributedString())
        let loc = min(textView.selectedRange.location, mutable.length)
        mutable.insert(piece, at: loc)
        textView.attributedText = mutable
        textView.selectedRange = NSRange(location: loc + (text as NSString).length, length: 0)
        emitDocumentChange()
    }

    @objc public func adjustIndent(_ delta: Int) {
        guard let current = textView.attributedText else { return }
        let range = (current.string as NSString).paragraphRange(for: textView.selectedRange)
        guard range.length > 0 else { return }
        let mutable = NSMutableAttributedString(attributedString: current)
        let tag = mutable.attribute(.rteBlockTag, at: range.location, effectiveRange: nil) as? String ?? "p"
        let listType = mutable.attribute(.rteListType, at: range.location, effectiveRange: nil) as? String
        let align = mutable.attribute(.rteAlign, at: range.location, effectiveRange: nil) as? String
        let currentIndent = mutable.attribute(.rteIndentLevel, at: range.location, effectiveRange: nil) as? Int ?? 0
        let newIndent = max(0, min(8, currentIndent + delta))
        let paragraph = SpanApplier.paragraphStyle(forTag: tag, listType: listType, indentLevel: newIndent, align: align)
        mutable.addAttribute(.paragraphStyle, value: paragraph, range: range)
        mutable.addAttribute(.rteIndentLevel, value: newIndent, range: range)
        let selection = textView.selectedRange
        textView.attributedText = mutable
        textView.selectedRange = selection
        emitDocumentChange()
    }

    @objc public func insertText(_ text: String) {
        let mutable = NSMutableAttributedString(attributedString: textView.attributedText ?? NSAttributedString())
        let piece = NSAttributedString(string: text, attributes: textView.typingAttributes)
        let loc = min(textView.selectedRange.location, mutable.length)
        mutable.insert(piece, at: loc)
        textView.attributedText = mutable
        textView.selectedRange = NSRange(location: loc + (text as NSString).length, length: 0)
        emitDocumentChange()
    }

    @objc public func insertEmbedJSON(_ json: String) {
        guard let data = json.data(using: .utf8),
              let embed = try? JSONDecoder().decode(EmbedPlaceholder.self, from: data) else { return }
        let attachment = EmbedTextAttachment(embed: embed)
        attachment.onImageLoaded = { [weak self] in self?.invalidateLayout() }

        let piece = NSMutableAttributedString(string: "\u{FFFC}")
        let range = NSRange(location: 0, length: 1)
        piece.addAttribute(.attachment, value: attachment, range: range)
        piece.addAttribute(.font, value: UIFont.systemFont(ofSize: SpanApplier.defaultFontSize), range: range)

        let mutable = NSMutableAttributedString(attributedString: textView.attributedText ?? NSAttributedString())
        let insertAt = min(textView.selectedRange.location, mutable.length)
        mutable.insert(piece, at: insertAt)
        textView.attributedText = mutable
        textView.selectedRange = NSRange(location: insertAt + 1, length: 0)
        emitDocumentChange()
    }

    // MARK: - UITextViewDelegate

    public func textViewDidChange(_ textView: UITextView) {
        scheduleDocumentChange()
        reportContentHeight()
    }

    public func textViewDidChangeSelection(_ textView: UITextView) {
        notifySelectionChange()
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

    /// Split the buffer into paragraphs (on "\n") and reconstruct one block per paragraph,
    /// recovering each block's tag/list from stamped attributes plus its inline runs and embeds.
    private func rebuildDocument() -> RichTextDocument {
        let attributed = textView.attributedText ?? NSAttributedString()
        let nsText = attributed.string as NSString
        let length = attributed.length
        var blocks: [BlockNode] = []
        var paragraphStart = 0
        var index = 0

        func appendParagraph(_ range: NSRange) {
            blocks.append(buildBlock(attributed: attributed, range: range, index: index))
            index += 1
        }

        var searchStart = 0
        while true {
            let searchRange = NSRange(location: searchStart, length: length - searchStart)
            let newline = nsText.range(of: "\n", options: [], range: searchRange)
            if newline.location == NSNotFound {
                appendParagraph(NSRange(location: paragraphStart, length: length - paragraphStart))
                break
            }
            appendParagraph(NSRange(location: paragraphStart, length: newline.location - paragraphStart))
            paragraphStart = newline.location + 1
            searchStart = newline.location + 1
            if searchStart > length { break }
        }
        if blocks.isEmpty {
            blocks.append(BlockNode(id: "b0", tag: "p", text: "", styleRuns: []))
        }
        return RichTextDocument(blocks: blocks)
    }

    private func buildBlock(attributed: NSAttributedString, range: NSRange, index: Int) -> BlockNode {
        let paragraphText = (attributed.string as NSString).substring(with: range)
        var runs: [StyleRun] = []
        var embeds: [EmbedPlaceholder] = []
        var blockTag = "p"
        var listType: String?
        var listDepth: Int?
        var indentLevel: Int?
        var align: String?
        var checked: Bool?

        if range.length > 0 {
            blockTag = attributed.attribute(.rteBlockTag, at: range.location, effectiveRange: nil) as? String ?? "p"
            listType = attributed.attribute(.rteListType, at: range.location, effectiveRange: nil) as? String
            listDepth = attributed.attribute(.rteListDepth, at: range.location, effectiveRange: nil) as? Int
            indentLevel = attributed.attribute(.rteIndentLevel, at: range.location, effectiveRange: nil) as? Int
            align = attributed.attribute(.rteAlign, at: range.location, effectiveRange: nil) as? String
            checked = attributed.attribute(.rteChecked, at: range.location, effectiveRange: nil) as? Bool

            let baseFontSize = SpanApplier.font(forTag: blockTag).pointSize
            attributed.enumerateAttributes(in: range) { attrs, r, _ in
                let rel = NSRange(location: r.location - range.location, length: r.length)
                if let attachment = attrs[.attachment] as? EmbedTextAttachment {
                    var embed = attachment.embed
                    embed.offset = rel.location
                    embeds.append(embed)
                    return
                }
                guard let run = styleRun(from: attrs, range: rel, baseFontSize: baseFontSize) else { return }
                if var last = runs.last, last.start + last.length == run.start, sameStyle(last, run) {
                    last.length += run.length
                    runs[runs.count - 1] = last
                } else {
                    runs.append(run)
                }
            }
        }

        let id = index < document.blocks.count ? document.blocks[index].id : "b\(index)"
        return BlockNode(
            id: id, tag: blockTag, text: paragraphText, styleRuns: runs,
            listType: listType, listDepth: listDepth, indentLevel: indentLevel,
            align: align, checked: checked, embeds: embeds.isEmpty ? nil : embeds
        )
    }

    private func styleRun(from attrs: [NSAttributedString.Key: Any], range: NSRange, baseFontSize: CGFloat) -> StyleRun? {
        var run = StyleRun(start: range.location, length: range.length, tag: "span")
        var styled = false
        if let font = attrs[.font] as? UIFont {
            let traits = font.fontDescriptor.symbolicTraits
            if traits.contains(.traitBold) { run.bold = true; styled = true }
            if traits.contains(.traitItalic) { run.italic = true; styled = true }
            // Emit an explicit size only when it differs from the block's base font (so plain
            // heading text isn't tagged with a redundant size).
            if abs(font.pointSize - baseFontSize) > 0.5 { run.fontSize = Double(font.pointSize); styled = true }
        }
        if attrs[.underlineStyle] != nil { run.underline = true; styled = true }
        if attrs[.strikethroughStyle] != nil { run.strikethrough = true; styled = true }
        if let offset = (attrs[.baselineOffset] as? NSNumber)?.doubleValue, offset != 0 {
            if offset > 0 { run.superscript = true } else { run.`subscript` = true }
            styled = true
        }
        if attrs[.link] != nil, let url = attrs[.link] as? URL { run.link = url.absoluteString; styled = true }
        if let color = attrs[.foregroundColor] as? UIColor, let hex = color.rteHexString {
            run.color = hex; styled = true
        }
        if let bg = attrs[.backgroundColor] as? UIColor, let hex = bg.rteHexString {
            run.backgroundColor = hex; styled = true
        }
        return styled ? run : nil
    }

    private func sameStyle(_ a: StyleRun, _ b: StyleRun) -> Bool {
        a.bold == b.bold && a.italic == b.italic && a.underline == b.underline
            && a.strikethrough == b.strikethrough && a.superscript == b.superscript
            && a.`subscript` == b.`subscript` && a.color == b.color
            && a.backgroundColor == b.backgroundColor && a.link == b.link
            && a.fontSize == b.fontSize
    }

    // MARK: - Selection

    private func notifySelectionChange() {
        let range = textView.selectedRange
        if range.length > 0 {
            lastSelection = range
        }
        onSelectionChangeBlock?(
            currentBlockId(for: range),
            range.location,
            range.location + range.length,
            activeInlineStyles(at: range)
        )
    }

    /// Comma-joined active styles. For a selection, styles active across the whole range; for a
    /// collapsed caret, the pending typing attributes (so the toolbar reflects what you'll type).
    private func activeInlineStyles(at range: NSRange) -> String {
        let styles: [InlineStyle]
        if range.length > 0, let text = textView.attributedText {
            styles = InlineStyle.allCases.filter { StyleEngine.activeStyles(in: text, range: range).contains($0) }
        } else {
            styles = activeTypingStyles()
        }
        return styles.map { $0.rawValue }.joined(separator: ",")
    }

    private func activeTypingStyles() -> [InlineStyle] {
        var result: [InlineStyle] = []
        let attrs = textView.typingAttributes
        if let font = attrs[.font] as? UIFont {
            let traits = font.fontDescriptor.symbolicTraits
            if traits.contains(.traitBold) { result.append(.bold) }
            if traits.contains(.traitItalic) { result.append(.italic) }
        }
        if (attrs[.underlineStyle] as? NSNumber)?.intValue ?? 0 != 0 { result.append(.underline) }
        if (attrs[.strikethroughStyle] as? NSNumber)?.intValue ?? 0 != 0 { result.append(.strikethrough) }
        return result
    }

    private func currentBlockId(for range: NSRange) -> String { document.blocks.first?.id ?? "b0" }

    // MARK: - Embeds

    @objc private func handleTap(_ gesture: UITapGestureRecognizer) {
        let point = gesture.location(in: textView)
        guard let position = textView.closestPosition(to: point) else { return }
        let index = textView.offset(from: textView.beginningOfDocument, to: position)
        guard let text = textView.attributedText, index >= 0, index < text.length else { return }
        if let attachment = text.attribute(.attachment, at: index, effectiveRange: nil) as? EmbedTextAttachment {
            onEmbedPressBlock?(attachment.embed.tag, attachment.dataJSON)
        }
        var linkRange = NSRange(location: 0, length: 0)
        if let link = text.attribute(.link, at: index, effectiveRange: &linkRange) {
            let url = (link as? URL)?.absoluteString ?? (link as? String) ?? ""
            onLinkPressBlock?(url, linkRange.location, linkRange.location + linkRange.length)
        }
    }

    @objc public func setLinkRange(_ start: Int, end: Int, url: String) {
        guard let current = textView.attributedText else { return }
        let length = current.length
        let s = max(0, min(start, length))
        let e = max(0, min(end, length))
        guard e > s else { return }
        let range = NSRange(location: s, length: e - s)
        let mutable = NSMutableAttributedString(attributedString: current)
        if url.isEmpty {
            mutable.removeAttribute(.link, range: range)
        } else if let parsed = URL(string: url) {
            mutable.addAttribute(.link, value: parsed, range: range)
        }
        textView.attributedText = mutable
        emitDocumentChange()
    }

    private func wireImageCallbacks() {
        guard let text = textView.attributedText else { return }
        text.enumerateAttribute(.attachment, in: NSRange(location: 0, length: text.length)) { value, _, _ in
            if let attachment = value as? EmbedTextAttachment {
                attachment.onImageLoaded = { [weak self] in self?.invalidateLayout() }
            }
        }
    }

    /// Force a layout pass so a newly-sized (async-loaded) attachment reflows surrounding text.
    private func invalidateLayout() {
        let selection = textView.selectedRange
        let current = textView.attributedText
        textView.attributedText = current
        textView.selectedRange = selection
    }
}
