import UIKit

// -------------------------------------------------------------------------------------------
// SpanApplier
//
// Pure, view-independent translation of the native document model (StyleRun / BlockNode /
// EmbedPlaceholder) into an NSAttributedString. Factored out from the live UITextView so it
// can be unit-tested with XCTest (see ios/tests) without any rendering.
//
// NOTE: These structs mirror packages/rich-text-editor/src/types/nativeTypes.ts. The document
// arrives as JSON over the Fabric bridge; native never parses HTML.
// -------------------------------------------------------------------------------------------

struct StyleRun: Codable {
    let start: Int
    let length: Int
    var bold: Bool? = nil
    var italic: Bool? = nil
    var underline: Bool? = nil
    var strikethrough: Bool? = nil
    var superscript: Bool? = nil
    var `subscript`: Bool? = nil
    var color: String? = nil
    var backgroundColor: String? = nil
    var fontSize: Double? = nil
    var fontFamily: String? = nil
    var link: String? = nil
    var tag: String
}

struct EmbedPlaceholder: Codable {
    let id: String
    var offset: Int
    let tag: String
    let kind: String            // "image" | "chip"
    var width: Double? = nil
    var height: Double? = nil
    var src: String? = nil
    var label: String? = nil
    var backgroundColor: String? = nil
    var textColor: String? = nil
    var cornerRadius: Double? = nil
    var data: [String: String] = [:]
}

struct BlockNode: Codable {
    let id: String
    let tag: String
    let text: String
    let styleRuns: [StyleRun]
    var listType: String? = nil
    var listDepth: Int? = nil
    var listIndex: Int? = nil
    var indentLevel: Int? = nil
    var align: String? = nil
    var checked: Bool? = nil
    var embeds: [EmbedPlaceholder]? = nil
}

struct RichTextDocument: Codable {
    let blocks: [BlockNode]
}

enum SpanApplier {

    static let defaultFontSize: CGFloat = 16

    static func decode(_ json: String) -> RichTextDocument? {
        guard let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(RichTextDocument.self, from: data)
    }

    /// Build a single attributed string for an entire document (blocks joined by newlines).
    static func attributedString(for document: RichTextDocument) -> NSAttributedString {
        let result = NSMutableAttributedString()
        for (index, block) in document.blocks.enumerated() {
            if index > 0 {
                result.append(NSAttributedString(string: "\n"))
            }
            result.append(attributedString(for: block))
        }
        return result
    }

    /// Build the attributed string for a single block, applying its style runs.
    static func attributedString(for block: BlockNode) -> NSAttributedString {
        let baseFont = font(forTag: block.tag)
        let paragraph = paragraphStyle(forTag: block.tag, listType: block.listType, indentLevel: block.indentLevel, align: block.align)
        let attributed = NSMutableAttributedString(
            string: block.text,
            attributes: [.font: baseFont, .paragraphStyle: paragraph]
        )

        for run in block.styleRuns {
            let range = clampedRange(start: run.start, length: run.length, in: block.text)
            guard range.length > 0 else { continue }
            apply(run: run, to: attributed, range: range, baseFont: baseFont)
        }

        // Embeds: the block text already contains a U+FFFC placeholder at each embed offset;
        // attach a native-drawn chip/image over that single character (no text shifting).
        for embed in block.embeds ?? [] {
            let range = clampedRange(start: embed.offset, length: 1, in: block.text)
            guard range.length == 1 else { continue }
            attributed.addAttribute(.attachment, value: EmbedTextAttachment(embed: embed), range: range)
        }

        // Stamp block-level metadata across the paragraph so multi-block reconstruction can
        // recover each paragraph's tag/list without it being part of the visible text.
        if attributed.length > 0 {
            let whole = NSRange(location: 0, length: attributed.length)
            attributed.addAttribute(.rteBlockTag, value: block.tag, range: whole)
            if let listType = block.listType, listType != "none" {
                attributed.addAttribute(.rteListType, value: listType, range: whole)
                attributed.addAttribute(.rteListDepth, value: block.listDepth ?? 0, range: whole)
            }
            if let indent = block.indentLevel {
                attributed.addAttribute(.rteIndentLevel, value: indent, range: whole)
            }
            if let align = block.align {
                attributed.addAttribute(.rteAlign, value: align, range: whole)
            }
            if let checked = block.checked {
                attributed.addAttribute(.rteChecked, value: checked, range: whole)
            }
        }
        return attributed
    }

    // MARK: - Run application

    private static func apply(run: StyleRun, to string: NSMutableAttributedString, range: NSRange, baseFont: UIFont) {
        var traits: UIFontDescriptor.SymbolicTraits = []
        if run.bold == true { traits.insert(.traitBold) }
        if run.italic == true { traits.insert(.traitItalic) }

        var font = baseFont
        if let size = run.fontSize { font = font.withSize(CGFloat(size)) }
        if run.fontFamily == "monospace" {
            font = UIFont.monospacedSystemFont(ofSize: font.pointSize, weight: .regular)
        } else if let family = run.fontFamily, let custom = UIFont(name: family, size: font.pointSize) {
            font = custom
        }
        if !traits.isEmpty, let descriptor = font.fontDescriptor.withSymbolicTraits(traits) {
            font = UIFont(descriptor: descriptor, size: font.pointSize)
        }
        string.addAttribute(.font, value: font, range: range)

        if run.underline == true {
            string.addAttribute(.underlineStyle, value: NSUnderlineStyle.single.rawValue, range: range)
        }
        if run.strikethrough == true {
            string.addAttribute(.strikethroughStyle, value: NSUnderlineStyle.single.rawValue, range: range)
        }
        if run.superscript == true {
            string.addAttribute(.baselineOffset, value: font.pointSize * 0.35, range: range)
        } else if run.`subscript` == true {
            string.addAttribute(.baselineOffset, value: -font.pointSize * 0.25, range: range)
        }
        if let color = run.color, let uiColor = UIColor(hex: color) {
            string.addAttribute(.foregroundColor, value: uiColor, range: range)
        }
        if let bg = run.backgroundColor, let uiColor = UIColor(hex: bg) {
            string.addAttribute(.backgroundColor, value: uiColor, range: range)
        }
        if let link = run.link, let url = URL(string: link) {
            string.addAttribute(.link, value: url, range: range)
        }
    }

    // MARK: - Block styling

    /// The base font for a block tag (headings, code). Exposed so the view can re-apply it when
    /// `setBlockType` changes the current paragraph.
    static func font(forTag tag: String) -> UIFont {
        switch tag {
        case "h1": return .boldSystemFont(ofSize: 30)
        case "h2": return .boldSystemFont(ofSize: 26)
        case "h3": return .boldSystemFont(ofSize: 22)
        case "h4": return .boldSystemFont(ofSize: 20)
        case "h5": return .boldSystemFont(ofSize: 18)
        case "h6": return .boldSystemFont(ofSize: 16)
        case "pre", "code": return .monospacedSystemFont(ofSize: defaultFontSize, weight: .regular)
        default: return .systemFont(ofSize: defaultFontSize)
        }
    }

    static func paragraphStyle(forTag tag: String, listType: String?, indentLevel: Int?, align: String? = nil) -> NSParagraphStyle {
        let style = NSMutableParagraphStyle()
        let listIndent = (listType != nil && listType != "none") ? 1 : 0
        let blockquoteIndent = tag == "blockquote" ? 1 : 0
        let indent = CGFloat((indentLevel ?? 0) + listIndent + blockquoteIndent) * 20
        style.firstLineHeadIndent = indent
        style.headIndent = indent
        style.paragraphSpacing = 8
        switch align {
        case "center": style.alignment = .center
        case "right": style.alignment = .right
        case "justify": style.alignment = .justified
        default: style.alignment = .natural
        }
        return style
    }

    private static func clampedRange(start: Int, length: Int, in text: String) -> NSRange {
        let count = (text as NSString).length
        let safeStart = max(0, min(start, count))
        let safeLength = max(0, min(length, count - safeStart))
        return NSRange(location: safeStart, length: safeLength)
    }
}

extension NSAttributedString.Key {
    /// Block-level metadata stamped across each paragraph so multi-block reconstruction can
    /// recover per-paragraph tag/list info without it being part of the visible text.
    static let rteBlockTag = NSAttributedString.Key("rteBlockTag")
    static let rteListType = NSAttributedString.Key("rteListType")
    static let rteListDepth = NSAttributedString.Key("rteListDepth")
    static let rteIndentLevel = NSAttributedString.Key("rteIndentLevel")
    static let rteAlign = NSAttributedString.Key("rteAlign")
    static let rteChecked = NSAttributedString.Key("rteChecked")
}

extension UIColor {
    /// `#RRGGBB` for this color (used to round-trip text color back to HTML), or nil if it has
    /// no RGB representation.
    var rteHexString: String? {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard getRed(&r, green: &g, blue: &b, alpha: &a) else { return nil }
        let ri = Int(round(r * 255)), gi = Int(round(g * 255)), bi = Int(round(b * 255))
        return String(format: "#%02X%02X%02X", ri, gi, bi)
    }

    /// Parse `#RGB`, `#RRGGBB`, or `#RRGGBBAA`.
    convenience init?(hex: String) {
        var hex = hex.trimmingCharacters(in: .whitespaces)
        if hex.hasPrefix("#") { hex.removeFirst() }
        if hex.count == 3 {
            hex = hex.map { "\($0)\($0)" }.joined()
        }
        guard let value = UInt64(hex, radix: 16) else { return nil }
        let r, g, b, a: CGFloat
        switch hex.count {
        case 6:
            r = CGFloat((value & 0xFF0000) >> 16) / 255
            g = CGFloat((value & 0x00FF00) >> 8) / 255
            b = CGFloat(value & 0x0000FF) / 255
            a = 1
        case 8:
            r = CGFloat((value & 0xFF000000) >> 24) / 255
            g = CGFloat((value & 0x00FF0000) >> 16) / 255
            b = CGFloat((value & 0x0000FF00) >> 8) / 255
            a = CGFloat(value & 0x000000FF) / 255
        default:
            return nil
        }
        self.init(red: r, green: g, blue: b, alpha: a)
    }
}
