package com.richtexteditor

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.text.style.ReplacementSpan

// -------------------------------------------------------------------------------------------
// EmbedReplacementSpan
//
// Draws an inline embed (a rounded "chip", e.g. a custom <mention>) directly into the text
// flow — no live child view is mounted. This is what makes consumer-registered embed tags
// render natively without any native code changes (the JS registry produces the chip's
// label/colors; this span just paints them). Phase 4b.
//
// Image embeds use a separate async-loading span (Phase 4b) not shown here.
// -------------------------------------------------------------------------------------------
class EmbedReplacementSpan(
  private val label: String,
  private val backgroundColor: Int = Color.parseColor("#DCEEFF"),
  private val textColor: Int = Color.parseColor("#1A73E8"),
  private val cornerRadiusPx: Float = 12f,
  private val horizontalPaddingPx: Float = 16f,
) : ReplacementSpan() {

  override fun getSize(
    paint: Paint,
    text: CharSequence?,
    start: Int,
    end: Int,
    fm: Paint.FontMetricsInt?,
  ): Int {
    val width = paint.measureText(label)
    return (width + horizontalPaddingPx * 2).toInt()
  }

  override fun draw(
    canvas: Canvas,
    text: CharSequence?,
    start: Int,
    end: Int,
    x: Float,
    top: Int,
    y: Int,
    bottom: Int,
    paint: Paint,
  ) {
    val width = paint.measureText(label) + horizontalPaddingPx * 2
    val rect = RectF(x, top.toFloat(), x + width, bottom.toFloat())

    val fillPaint = Paint(paint).apply {
      color = backgroundColor
      style = Paint.Style.FILL
    }
    canvas.drawRoundRect(rect, cornerRadiusPx, cornerRadiusPx, fillPaint)

    val labelPaint = Paint(paint).apply { color = textColor }
    canvas.drawText(label, x + horizontalPaddingPx, y.toFloat(), labelPaint)
  }
}
