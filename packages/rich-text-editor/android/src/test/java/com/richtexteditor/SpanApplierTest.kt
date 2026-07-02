package com.richtexteditor

import android.graphics.Color
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import android.graphics.Typeface
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// Unit tests for the pure StyleRun → Spannable logic (Robolectric provides the Android text
// stack). No live EditText required.
@RunWith(RobolectricTestRunner::class)
class SpanApplierTest {

  @Test
  fun buildsPlainText() {
    val json = """{"blocks":[{"id":"b0","tag":"p","text":"hi","styleRuns":[]}]}"""
    val s = SpanApplier.spannableForDocument(json, 1f)
    assertEquals("hi", s.toString())
  }

  @Test
  fun appliesBoldRun() {
    val json = """{"blocks":[{"id":"b0","tag":"p","text":"ab","styleRuns":[{"start":0,"length":1,"bold":true,"tag":"b"}]}]}"""
    val s = SpanApplier.spannableForDocument(json, 1f)
    val spans = s.getSpans(0, 1, StyleSpan::class.java)
    assertTrue(spans.any { it.style == Typeface.BOLD })
  }

  @Test
  fun appliesColorRun() {
    val json = """{"blocks":[{"id":"b0","tag":"p","text":"ab","styleRuns":[{"start":0,"length":2,"color":"#ff0000","tag":"span"}]}]}"""
    val s = SpanApplier.spannableForDocument(json, 1f)
    assertTrue(s.getSpans(0, 2, ForegroundColorSpan::class.java).isNotEmpty())
  }

  @Test
  fun parsesHexColors() {
    assertNotNull(SpanApplier.parseColor("#ff0000"))
    assertNotNull(SpanApplier.parseColor("#f00"))
    assertNotNull(SpanApplier.parseColor("#ff0000aa"))
    assertNull(SpanApplier.parseColor("nope"))
  }
}
