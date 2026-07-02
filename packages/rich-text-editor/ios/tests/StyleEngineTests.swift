import XCTest
@testable import RichTextEditor

// Unit tests for the pure inline-formatting logic — no live UITextView. These cover the core
// Phase 2 behavior (toggle add/remove, mixed-selection detection, active-style reporting).
final class StyleEngineTests: XCTestCase {

    private func make(_ text: String) -> NSMutableAttributedString {
        NSMutableAttributedString(
            string: text,
            attributes: [.font: UIFont.systemFont(ofSize: 16)]
        )
    }

    private func fullRange(_ s: NSAttributedString) -> NSRange {
        NSRange(location: 0, length: s.length)
    }

    func testToggleBoldAddsThenRemoves() {
        let s = make("hello")
        let range = fullRange(s)

        XCTAssertFalse(StyleEngine.isActive(.bold, in: s, range: range))
        let added = StyleEngine.toggle(.bold, in: s, range: range)
        XCTAssertTrue(added)
        XCTAssertTrue(StyleEngine.isActive(.bold, in: s, range: range))

        let removed = StyleEngine.toggle(.bold, in: s, range: range)
        XCTAssertFalse(removed)
        XCTAssertFalse(StyleEngine.isActive(.bold, in: s, range: range))
    }

    func testIsActiveRequiresWholeRange() {
        let s = make("hello")
        // Bold only the first two characters.
        StyleEngine.setStyle(.bold, enabled: true, in: s, range: NSRange(location: 0, length: 2))
        XCTAssertTrue(StyleEngine.isActive(.bold, in: s, range: NSRange(location: 0, length: 2)))
        // The full range is only partially bold → not active.
        XCTAssertFalse(StyleEngine.isActive(.bold, in: s, range: fullRange(s)))
    }

    func testTogglingPartiallyStyledRangeMakesItFullyStyled() {
        let s = make("hello")
        StyleEngine.setStyle(.bold, enabled: true, in: s, range: NSRange(location: 0, length: 2))
        // Not fully active → toggle should ADD across the whole range.
        StyleEngine.toggle(.bold, in: s, range: fullRange(s))
        XCTAssertTrue(StyleEngine.isActive(.bold, in: s, range: fullRange(s)))
    }

    func testUnderlineAndStrikethroughToggle() {
        let s = make("hi")
        let range = fullRange(s)
        StyleEngine.toggle(.underline, in: s, range: range)
        StyleEngine.toggle(.strikethrough, in: s, range: range)
        XCTAssertTrue(StyleEngine.isActive(.underline, in: s, range: range))
        XCTAssertTrue(StyleEngine.isActive(.strikethrough, in: s, range: range))
        XCTAssertEqual(StyleEngine.activeStyles(in: s, range: range), [.underline, .strikethrough])
    }

    func testBoldAndItalicCombine() {
        let s = make("x")
        let range = fullRange(s)
        StyleEngine.toggle(.bold, in: s, range: range)
        StyleEngine.toggle(.italic, in: s, range: range)
        let font = s.attribute(.font, at: 0, effectiveRange: nil) as! UIFont
        XCTAssertTrue(font.fontDescriptor.symbolicTraits.contains(.traitBold))
        XCTAssertTrue(font.fontDescriptor.symbolicTraits.contains(.traitItalic))
    }

    func testEmptyRangeIsNeverActive() {
        let s = make("hello")
        XCTAssertFalse(StyleEngine.isActive(.bold, in: s, range: NSRange(location: 2, length: 0)))
    }

    func testToggledTypingAttributesFlipsBold() {
        let base: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: 16)]
        let (on, enabledOn) = StyleEngine.toggledTypingAttributes(base, style: .bold)
        XCTAssertTrue(enabledOn)
        XCTAssertTrue((on[.font] as! UIFont).fontDescriptor.symbolicTraits.contains(.traitBold))

        let (off, enabledOff) = StyleEngine.toggledTypingAttributes(on, style: .bold)
        XCTAssertFalse(enabledOff)
        XCTAssertFalse((off[.font] as! UIFont).fontDescriptor.symbolicTraits.contains(.traitBold))
    }
}
