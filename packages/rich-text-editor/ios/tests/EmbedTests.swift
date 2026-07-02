import XCTest
@testable import RichTextEditor

// Covers embed rendering: the document's U+FFFC placeholder becomes an EmbedTextAttachment
// carrying the originating embed, which is how consumer-registered tags (e.g. <mention>)
// render as native chips and round-trip back.
final class EmbedTests: XCTestCase {

    private let chipDocJSON = """
    {"blocks":[{"id":"b0","tag":"p","text":"hi \u{FFFC}","styleRuns":[],
      "embeds":[{"id":"e0","offset":3,"tag":"mention","kind":"chip","label":"@alice",
                 "backgroundColor":"#DCEEFF","textColor":"#1A73E8","cornerRadius":8,
                 "data":{"mentionId":"123"}}]}]}
    """

    func testChipEmbedBecomesAttachmentAtOffset() {
        let doc = SpanApplier.decode(chipDocJSON)!
        let attributed = SpanApplier.attributedString(for: doc.blocks[0])

        let attachment = attributed.attribute(.attachment, at: 3, effectiveRange: nil) as? EmbedTextAttachment
        XCTAssertNotNil(attachment)
        XCTAssertEqual(attachment?.embed.tag, "mention")
        XCTAssertEqual(attachment?.embed.label, "@alice")
        XCTAssertNotNil(attachment?.image, "chip should render to an image")
    }

    func testAttachmentExposesDataJSON() {
        let doc = SpanApplier.decode(chipDocJSON)!
        let attributed = SpanApplier.attributedString(for: doc.blocks[0])
        let attachment = attributed.attribute(.attachment, at: 3, effectiveRange: nil) as! EmbedTextAttachment
        XCTAssertTrue(attachment.dataJSON.contains("mentionId"))
        XCTAssertTrue(attachment.dataJSON.contains("123"))
    }

    func testNoEmbedsMeansNoAttachment() {
        let doc = SpanApplier.decode(#"{"blocks":[{"id":"b0","tag":"p","text":"plain","styleRuns":[]}]}"#)!
        let attributed = SpanApplier.attributedString(for: doc.blocks[0])
        var found = false
        attributed.enumerateAttribute(.attachment, in: NSRange(location: 0, length: attributed.length)) { v, _, _ in
            if v != nil { found = true }
        }
        XCTAssertFalse(found)
    }
}
