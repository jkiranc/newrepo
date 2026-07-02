package com.richtexteditor

import android.graphics.Typeface
import android.text.Spannable
import android.text.Spanned
import android.text.style.CharacterStyle
import android.text.style.StrikethroughSpan
import android.text.style.StyleSpan
import android.text.style.UnderlineSpan

// -------------------------------------------------------------------------------------------
// StyleEngine (Android)
//
// Pure, view-independent inline-formatting logic over a Spannable — the parity counterpart of
// ios/StyleEngine.swift. Testable with Robolectric (see src/test/.../StyleEngineTest.kt)
// without a live EditText.
//
// Design note: bold and italic are represented as SEPARATE single-trait StyleSpans (never a
// combined BOLD_ITALIC span). Overlapping StyleSpans combine when rendered, and keeping them
// separate makes independent toggling (and span-splitting on removal) tractable. SpanApplier
// follows the same convention so the two stay consistent.
// -------------------------------------------------------------------------------------------
enum class InlineStyle(val wireName: String) {
  BOLD("bold"),
  ITALIC("italic"),
  UNDERLINE("underline"),
  STRIKETHROUGH("strikethrough");

  companion object {
    fun fromWire(name: String): InlineStyle? = values().firstOrNull { it.wireName == name }
  }
}

object StyleEngine {

  /** True if `style` covers the ENTIRE range (decides toggle direction). Empty range = false. */
  fun isActive(style: InlineStyle, text: Spanned, start: Int, end: Int): Boolean {
    if (end <= start) return false
    val covered = BooleanArray(end - start)
    for (span in matchingSpans(style, text, start, end)) {
      val s = maxOf(start, text.getSpanStart(span))
      val e = minOf(end, text.getSpanEnd(span))
      for (i in s until e) covered[i - start] = true
    }
    return covered.all { it }
  }

  /** Styles active across the entire range (for toolbar highlighting). */
  fun activeStyles(text: Spanned, start: Int, end: Int): Set<InlineStyle> =
    InlineStyle.values().filterTo(mutableSetOf()) { isActive(it, text, start, end) }

  /** Toggle `style` across `[start, end)` in place. Returns the new active state. */
  fun toggle(style: InlineStyle, text: Spannable, start: Int, end: Int): Boolean {
    val shouldAdd = !isActive(style, text, start, end)
    setStyle(style, shouldAdd, text, start, end)
    return shouldAdd
  }

  /** Apply or remove `style` across `[start, end)`, splitting existing spans as needed. */
  fun setStyle(style: InlineStyle, enabled: Boolean, text: Spannable, start: Int, end: Int) {
    if (end <= start) return
    // Remove matching spans in range, preserving the portions that extend outside it.
    for (span in matchingSpans(style, text, start, end)) {
      val spanStart = text.getSpanStart(span)
      val spanEnd = text.getSpanEnd(span)
      text.removeSpan(span)
      if (spanStart < start) {
        text.setSpan(newSpan(style), spanStart, start, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
      }
      if (spanEnd > end) {
        text.setSpan(newSpan(style), end, spanEnd, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
      }
    }
    if (enabled) {
      text.setSpan(newSpan(style), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
    }
  }

  private fun matchingSpans(style: InlineStyle, text: Spanned, start: Int, end: Int): List<CharacterStyle> {
    val spans = text.getSpans(start, end, CharacterStyle::class.java)
    return spans.filter { matches(style, it) }
  }

  private fun matches(style: InlineStyle, span: CharacterStyle): Boolean = when (style) {
    InlineStyle.BOLD -> span is StyleSpan && (span.style and Typeface.BOLD) != 0
    InlineStyle.ITALIC -> span is StyleSpan && (span.style and Typeface.ITALIC) != 0
    InlineStyle.UNDERLINE -> span is UnderlineSpan
    InlineStyle.STRIKETHROUGH -> span is StrikethroughSpan
  }

  private fun newSpan(style: InlineStyle): CharacterStyle = when (style) {
    InlineStyle.BOLD -> StyleSpan(Typeface.BOLD)
    InlineStyle.ITALIC -> StyleSpan(Typeface.ITALIC)
    InlineStyle.UNDERLINE -> UnderlineSpan()
    InlineStyle.STRIKETHROUGH -> StrikethroughSpan()
  }
}
