package com.richtexteditor

import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.style.StyleSpan
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// Parity counterpart of ios/tests/StyleEngineTests.swift — the pure toggle/active-state logic
// over a Spannable, exercised with Robolectric (no live EditText).
@RunWith(RobolectricTestRunner::class)
class StyleEngineTest {

  private fun span(text: String) = SpannableStringBuilder(text)

  @Test
  fun toggleBoldAddsThenRemoves() {
    val s = span("hello")
    assertFalse(StyleEngine.isActive(InlineStyle.BOLD, s, 0, s.length))

    assertTrue(StyleEngine.toggle(InlineStyle.BOLD, s, 0, s.length))
    assertTrue(StyleEngine.isActive(InlineStyle.BOLD, s, 0, s.length))

    assertFalse(StyleEngine.toggle(InlineStyle.BOLD, s, 0, s.length))
    assertFalse(StyleEngine.isActive(InlineStyle.BOLD, s, 0, s.length))
  }

  @Test
  fun isActiveRequiresWholeRange() {
    val s = span("hello")
    StyleEngine.setStyle(InlineStyle.BOLD, true, s, 0, 2)
    assertTrue(StyleEngine.isActive(InlineStyle.BOLD, s, 0, 2))
    assertFalse(StyleEngine.isActive(InlineStyle.BOLD, s, 0, s.length))
  }

  @Test
  fun togglingPartialRangeMakesItFullyStyled() {
    val s = span("hello")
    StyleEngine.setStyle(InlineStyle.BOLD, true, s, 0, 2)
    StyleEngine.toggle(InlineStyle.BOLD, s, 0, s.length)
    assertTrue(StyleEngine.isActive(InlineStyle.BOLD, s, 0, s.length))
  }

  @Test
  fun removingSubRangeSplitsExistingSpan() {
    val s = span("abcde")
    StyleEngine.setStyle(InlineStyle.BOLD, true, s, 0, 5)
    // Remove bold from the middle character.
    StyleEngine.setStyle(InlineStyle.BOLD, false, s, 2, 3)
    assertTrue(StyleEngine.isActive(InlineStyle.BOLD, s, 0, 2))
    assertFalse(StyleEngine.isActive(InlineStyle.BOLD, s, 2, 3))
    assertTrue(StyleEngine.isActive(InlineStyle.BOLD, s, 3, 5))
  }

  @Test
  fun boldAndItalicCombineAsSeparateSpans() {
    val s = span("x")
    StyleEngine.toggle(InlineStyle.BOLD, s, 0, 1)
    StyleEngine.toggle(InlineStyle.ITALIC, s, 0, 1)
    val styleSpans = s.getSpans(0, 1, StyleSpan::class.java)
    assertTrue(styleSpans.any { it.style == Typeface.BOLD })
    assertTrue(styleSpans.any { it.style == Typeface.ITALIC })
    assertEquals(
      setOf(InlineStyle.BOLD, InlineStyle.ITALIC),
      StyleEngine.activeStyles(s, 0, 1),
    )
  }

  @Test
  fun underlineAndStrikethroughToggle() {
    val s = span("hi")
    StyleEngine.toggle(InlineStyle.UNDERLINE, s, 0, s.length)
    StyleEngine.toggle(InlineStyle.STRIKETHROUGH, s, 0, s.length)
    assertTrue(StyleEngine.isActive(InlineStyle.UNDERLINE, s, 0, s.length))
    assertTrue(StyleEngine.isActive(InlineStyle.STRIKETHROUGH, s, 0, s.length))
  }

  @Test
  fun emptyRangeIsNeverActive() {
    val s = span("hello")
    assertFalse(StyleEngine.isActive(InlineStyle.BOLD, s, 2, 2))
  }
}
