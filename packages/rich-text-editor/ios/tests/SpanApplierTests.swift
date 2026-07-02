import XCTest
@testable import RichTextEditor

// Unit tests for the pure StyleRun → NSAttributedString logic. No live UITextView required —
// this is the one piece of native logic worth automated coverage (see CONTRIBUTING.md).
final class SpanApplierTests: XCTestCase {

    private func doc(_ json: String) -> RichTextDocument {
        SpanApplier.decode(json)!
    }

    func testDecodesDocument() {
        let d = doc(#"{"blocks":[{"id":"b0","tag":"p","text":"hi","styleRuns":[]}]}"#)
        XCTAssertEqual(d.blocks.count, 1)
        XCTAssertEqual(d.blocks[0].text, "hi")
    }

    func testAppliesBoldRun() {
        let d = doc(#"{"blocks":[{"id":"b0","tag":"p","text":"ab","styleRuns":[{"start":0,"length":1,"bold":true,"tag":"b"}]}]}"#)
        let s = SpanApplier.attributedString(for: d.blocks[0])
        let font = s.attribute(.font, at: 0, effectiveRange: nil) as? UIFont
        XCTAssertTrue(font!.fontDescriptor.symbolicTraits.contains(.traitBold))
    }

    func testClampsOutOfRangeRun() {
        let d = doc(#"{"blocks":[{"id":"b0","tag":"p","text":"ab","styleRuns":[{"start":0,"length":99,"underline":true,"tag":"u"}]}]}"#)
        // Should not crash even though length exceeds text.
        let s = SpanApplier.attributedString(for: d.blocks[0])
        XCTAssertEqual(s.string, "ab")
    }

    func testParsesHexColors() {
        XCTAssertNotNil(UIColor(hex: "#ff0000"))
        XCTAssertNotNil(UIColor(hex: "#f00"))
        XCTAssertNotNil(UIColor(hex: "#ff0000aa"))
        XCTAssertNil(UIColor(hex: "nope"))
    }
}
