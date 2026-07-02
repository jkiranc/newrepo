package com.richtexteditor

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.text.style.ReplacementSpan
import org.json.JSONObject

// -------------------------------------------------------------------------------------------
// EmbedReplacementSpan
//
// Draws an inline embed (a rounded "chip", e.g. a custom <mention>) directly into the text
// flow — no live child view is mounted. Because the JS registry produces the chip's
// label/colors, a consumer-registered embed tag renders natively with ZERO native changes.
//
// The originating embed (tag + data) is retained so the document can be reconstructed and taps
// resolved from the live buffer. Image embeds are drawn as a placeholder box for now
// (async loading is a follow-up).
// -------------------------------------------------------------------------------------------
class EmbedReplacementSpan(
  val tag: String,
  val kind: String,
  val label: String,
  val dataJson: String,
  private val backgroundColor: Int,
  private val textColor: Int,
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

  companion object {
    /** Build a chip span from an EmbedPlaceholder JSON object (from the document model). */
    fun fromEmbed(embed: JSONObject): EmbedReplacementSpan {
      val label = embed.optString("label", embed.optString("tag"))
      val bg = parseColor(embed.optString("backgroundColor")) ?: Color.parseColor("#DCEEFF")
      val fg = parseColor(embed.optString("textColor")) ?: Color.parseColor("#1A73E8")
      val radius = if (embed.has("cornerRadius")) embed.getDouble("cornerRadius").toFloat() else 12f
      val data = embed.optJSONObject("data") ?: JSONObject()
      return EmbedReplacementSpan(
        tag = embed.optString("tag"),
        kind = embed.optString("kind", "chip"),
        label = label,
        dataJson = data.toString(),
        backgroundColor = bg,
        textColor = fg,
        cornerRadiusPx = radius,
      )
    }

    private fun parseColor(hex: String): Int? =
      if (hex.isEmpty()) null else SpanApplier.parseColor(hex)
  }
}
