package com.richtexteditor

import android.graphics.Canvas
import android.graphics.Paint
import android.text.Layout
import android.text.style.LeadingMarginSpan

/**
 * Draws a list marker (bullet, ordered number, or checkbox) in the paragraph's leading margin
 * and reserves space for it. Used for bullet / ordered / check list items.
 */
class ListMarkerSpan(
  private val listType: String,
  private val index: Int,
  private val checked: Boolean,
  private val gapPx: Int,
) : LeadingMarginSpan {

  override fun getLeadingMargin(first: Boolean): Int = gapPx

  override fun drawLeadingMargin(
    c: Canvas,
    p: Paint,
    x: Int,
    dir: Int,
    top: Int,
    baseline: Int,
    bottom: Int,
    text: CharSequence?,
    start: Int,
    end: Int,
    first: Boolean,
    layout: Layout?,
  ) {
    // Only render the marker on the first visual line of the paragraph.
    if (!first) return
    val marker = when (listType) {
      "ordered" -> "${if (index > 0) index else 1}."
      "check" -> if (checked) "☑" else "☐" // ☑ / ☐
      else -> "•" // •
    }
    c.drawText(marker, (x + dir * 4).toFloat(), baseline.toFloat(), p)
  }
}
