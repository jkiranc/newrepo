package com.richtexteditor

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// Covers embed rendering: the document's U+FFFC placeholder becomes an EmbedReplacementSpan
// carrying the originating embed, which is how consumer-registered tags render as native chips.
@RunWith(RobolectricTestRunner::class)
class EmbedSpanTest {

  private val chipDocJson = """
    {"blocks":[{"id":"b0","tag":"p","text":"hi ￼","styleRuns":[],
      "embeds":[{"id":"e0","offset":3,"tag":"mention","kind":"chip","label":"@alice",
                 "backgroundColor":"#DCEEFF","textColor":"#1A73E8","cornerRadius":8,
                 "data":{"mentionId":"123"}}]}]}
  """.trimIndent()

  @Test
  fun chipEmbedBecomesSpanAtOffset() {
    val s = SpanApplier.spannableForDocument(chipDocJson, 1f)
    val spans = s.getSpans(3, 4, EmbedReplacementSpan::class.java)
    assertEquals(1, spans.size)
    assertEquals("mention", spans[0].tag)
    assertEquals("@alice", spans[0].label)
    assertTrue(spans[0].dataJson.contains("mentionId"))
  }

  @Test
  fun fromEmbedParsesFields() {
    val embed = JSONObject(
      """{"tag":"mention","kind":"chip","label":"@bob","data":{"mentionId":"7"}}""",
    )
    val span = EmbedReplacementSpan.fromEmbed(embed)
    assertEquals("mention", span.tag)
    assertEquals("chip", span.kind)
    assertEquals("@bob", span.label)
    assertTrue(span.dataJson.contains("7"))
  }
}
