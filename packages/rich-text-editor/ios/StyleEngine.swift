import UIKit

// -------------------------------------------------------------------------------------------
// StyleEngine
//
// Pure, view-independent inline-formatting logic. Everything here operates on an
// NSAttributedString / NSMutableAttributedString and a range — no UITextView — so it is fully
// unit-testable with XCTest (see ios/tests/StyleEngineTests.swift). The live view
// (RichTextEditorViewImpl) is a thin wrapper that feeds it the current buffer and selection.
//
// Only the four boolean inline styles are toggleable (bold/italic/underline/strikethrough);
// color/link/size arrive via the document, not user toggles.
// -------------------------------------------------------------------------------------------
enum InlineStyle: String, CaseIterable {
    case bold, italic, underline, strikethrough, superscript, `subscript`
}

enum StyleEngine {

    /// True if `style` is applied across the ENTIRE range (used to decide toggle direction:
    /// fully-applied → remove, otherwise → add). An empty range returns false.
    static func isActive(_ style: InlineStyle, in string: NSAttributedString, range: NSRange) -> Bool {
        guard range.length > 0 else { return false }
        var active = true
        switch style {
        case .bold, .italic:
            let trait: UIFontDescriptor.SymbolicTraits = style == .bold ? .traitBold : .traitItalic
            string.enumerateAttribute(.font, in: range) { value, _, stop in
                let font = value as? UIFont
                if font == nil || !font!.fontDescriptor.symbolicTraits.contains(trait) {
                    active = false
                    stop.pointee = true
                }
            }
        case .underline, .strikethrough:
            let key: NSAttributedString.Key = style == .underline ? .underlineStyle : .strikethroughStyle
            string.enumerateAttribute(key, in: range) { value, _, stop in
                let raw = (value as? NSNumber)?.intValue ?? 0
                if raw == 0 {
                    active = false
                    stop.pointee = true
                }
            }
        case .superscript, .subscript:
            let wantPositive = style == .superscript
            string.enumerateAttribute(.baselineOffset, in: range) { value, _, stop in
                let offset = (value as? NSNumber)?.doubleValue ?? 0
                let ok = wantPositive ? offset > 0 : offset < 0
                if !ok {
                    active = false
                    stop.pointee = true
                }
            }
        }
        return active
    }

    /// The set of styles active across the entire range (for toolbar highlighting).
    static func activeStyles(in string: NSAttributedString, range: NSRange) -> Set<InlineStyle> {
        var result = Set<InlineStyle>()
        for style in InlineStyle.allCases where isActive(style, in: string, range: range) {
            result.insert(style)
        }
        return result
    }

    /// Toggle `style` across `range`, in place. Returns the new active state (true = now on).
    @discardableResult
    static func toggle(_ style: InlineStyle, in string: NSMutableAttributedString, range: NSRange) -> Bool {
        let shouldAdd = !isActive(style, in: string, range: range)
        setStyle(style, enabled: shouldAdd, in: string, range: range)
        return shouldAdd
    }

    /// Apply or remove `style` across `range`, in place.
    static func setStyle(_ style: InlineStyle, enabled: Bool, in string: NSMutableAttributedString, range: NSRange) {
        guard range.length > 0 else { return }
        switch style {
        case .bold, .italic:
            let trait: UIFontDescriptor.SymbolicTraits = style == .bold ? .traitBold : .traitItalic
            // Recompute each run's font because fonts can differ across the range.
            string.enumerateAttribute(.font, in: range) { value, subRange, _ in
                let base = (value as? UIFont) ?? UIFont.systemFont(ofSize: SpanApplier.defaultFontSize)
                var traits = base.fontDescriptor.symbolicTraits
                if enabled { traits.insert(trait) } else { traits.remove(trait) }
                let descriptor = base.fontDescriptor.withSymbolicTraits(traits) ?? base.fontDescriptor
                string.addAttribute(.font, value: UIFont(descriptor: descriptor, size: base.pointSize), range: subRange)
            }
        case .underline, .strikethrough:
            let key: NSAttributedString.Key = style == .underline ? .underlineStyle : .strikethroughStyle
            if enabled {
                string.addAttribute(key, value: NSUnderlineStyle.single.rawValue, range: range)
            } else {
                string.removeAttribute(key, range: range)
            }
        case .superscript, .subscript:
            if enabled {
                let factor: CGFloat = style == .superscript ? 0.35 : -0.25
                string.enumerateAttribute(.font, in: range) { value, subRange, _ in
                    let size = (value as? UIFont)?.pointSize ?? SpanApplier.defaultFontSize
                    string.addAttribute(.baselineOffset, value: size * factor, range: subRange)
                }
            } else {
                string.removeAttribute(.baselineOffset, range: range)
            }
        }
    }

    /// Update a set of typing attributes (for a collapsed caret) to reflect a toggled style,
    /// so the next typed characters inherit it. Returns the new attributes and active state.
    static func toggledTypingAttributes(
        _ attributes: [NSAttributedString.Key: Any],
        style: InlineStyle
    ) -> (attributes: [NSAttributedString.Key: Any], enabled: Bool) {
        var attrs = attributes
        switch style {
        case .bold, .italic:
            let trait: UIFontDescriptor.SymbolicTraits = style == .bold ? .traitBold : .traitItalic
            let base = (attrs[.font] as? UIFont) ?? UIFont.systemFont(ofSize: SpanApplier.defaultFontSize)
            var traits = base.fontDescriptor.symbolicTraits
            let enabled = !traits.contains(trait)
            if enabled { traits.insert(trait) } else { traits.remove(trait) }
            let descriptor = base.fontDescriptor.withSymbolicTraits(traits) ?? base.fontDescriptor
            attrs[.font] = UIFont(descriptor: descriptor, size: base.pointSize)
            return (attrs, enabled)
        case .underline, .strikethrough:
            let key: NSAttributedString.Key = style == .underline ? .underlineStyle : .strikethroughStyle
            let current = (attrs[key] as? NSNumber)?.intValue ?? 0
            let enabled = current == 0
            if enabled {
                attrs[key] = NSUnderlineStyle.single.rawValue
            } else {
                attrs.removeValue(forKey: key)
            }
            return (attrs, enabled)
        case .superscript, .subscript:
            let wantPositive = style == .superscript
            let current = (attrs[.baselineOffset] as? NSNumber)?.doubleValue ?? 0
            let isOn = wantPositive ? current > 0 : current < 0
            if isOn {
                attrs.removeValue(forKey: .baselineOffset)
                return (attrs, false)
            }
            let size = (attrs[.font] as? UIFont)?.pointSize ?? SpanApplier.defaultFontSize
            attrs[.baselineOffset] = size * (wantPositive ? 0.35 : -0.25)
            return (attrs, true)
        }
    }
}
