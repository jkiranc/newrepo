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
    var bold: Bool?
    var italic: Bool?
    var underline: Bool?
    var strikethrough: Bool?
    var color: String?
    var backgroundColor: String?
    var fontSize: Double?
    var fontFamily: String?
    var link: String?
    var tag: String
}

struct EmbedPlaceholder: Codable {
    let id: String
    let offset: Int
    let tag: String
    let kind: String            // "image" | "chip"
    var width: Double?
    var height: Double?
    var src: String?
    var label: String?
    var backgroundColor: String?
    var textColor: String?
    var cornerRadius: Double?
    var data: [String: String]
}

struct BlockNode: Codable {
    let id: String
    let tag: String
    let text: String
    let styleRuns: [StyleRun]
    var listType: String?
    var listDepth: Int?
    var listIndex: Int?
    var indentLevel: Int?
    var embeds: [EmbedPlaceholder]?
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
        let baseFont = font(for: block)
        let attributed = NSMutableAttributedString(
            string: block.text,
            attributes: [.font: baseFont, .paragraphStyle: paragraphStyle(for: block)]
        )

        for run in block.styleRuns {
            let range = clampedRange(start: run.start, length: run.length, in: block.text)
            guard range.length > 0 else { continue }
            apply(run: run, to: attributed, range: range, baseFont: baseFont)
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

    private static func font(for block: BlockNode) -> UIFont {
        switch block.tag {
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

    private static func paragraphStyle(for block: BlockNode) -> NSParagraphStyle {
        let style = NSMutableParagraphStyle()
        let indent = CGFloat((block.indentLevel ?? 0) + (block.listType != nil ? 1 : 0)) * 20
        style.firstLineHeadIndent = indent
        style.headIndent = indent
        style.paragraphSpacing = 8
        return style
    }

    private static func clampedRange(start: Int, length: Int, in text: String) -> NSRange {
        let count = (text as NSString).length
        let safeStart = max(0, min(start, count))
        let safeLength = max(0, min(length, count - safeStart))
        return NSRange(location: safeStart, length: safeLength)
    }
}

extension UIColor {
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
