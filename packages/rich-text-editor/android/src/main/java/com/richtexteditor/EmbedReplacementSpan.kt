package com.richtexteditor

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.text.style.ReplacementSpan
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.ceil

// -------------------------------------------------------------------------------------------
// EmbedReplacementSpan
//
// Draws an inline embed directly into the text flow — no live child view is mounted. Three
// kinds are supported:
//   * "chip"  — a rounded label (e.g. a custom <mention>).
//   * "image" — a placeholder box for now (async loading is a follow-up).
//   * "table" — a read-only grid drawn from the embed's `data.rows` (see Batch C). Because the
//               JS registry produces the embed, a consumer-registered tag renders natively with
//               ZERO native changes.
//
// The originating embed (tag + data) is retained so the document can be reconstructed and taps
// resolved from the live buffer.
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

  // Lazily-parsed table grid (only for kind == "table").
  private val tableRows: List<List<String>> by lazy { parseTableRows(dataJson) }
  private val tableHasHeader: Boolean by lazy {
    runCatching { JSONObject(dataJson).optString("header") == "true" }.getOrDefault(false)
  }

  // Table drawing metrics.
  private val cellPad = 12f
  private val borderColor = Color.parseColor("#CCCCCC")
  private val headerFill = Color.parseColor("#F1F3F4")

  override fun getSize(
    paint: Paint,
    text: CharSequence?,
    start: Int,
    end: Int,
    fm: Paint.FontMetricsInt?,
  ): Int {
    if (kind == "table") {
      val (width, height) = tableSize(paint)
      fm?.let {
        it.ascent = -height
        it.top = -height
        it.descent = 0
        it.bottom = 0
      }
      return width
    }
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
    if (kind == "table") {
      drawTable(canvas, x, top.toFloat(), paint)
      return
    }
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

  // MARK: - Table

  private fun columnWidths(paint: Paint): FloatArray {
    val cols = tableRows.maxOfOrNull { it.size } ?: 0
    val widths = FloatArray(cols)
    for (row in tableRows) {
      for (c in row.indices) {
        widths[c] = maxOf(widths[c], paint.measureText(row[c]))
      }
    }
    for (c in widths.indices) widths[c] = widths[c] + cellPad * 2
    return widths
  }

  private fun rowHeight(paint: Paint): Float {
    val fm = paint.fontMetrics
    return (fm.descent - fm.ascent) + cellPad * 2
  }

  private fun tableSize(paint: Paint): Pair<Int, Int> {
    if (tableRows.isEmpty()) return 0 to 0
    val width = columnWidths(paint).sum()
    val height = rowHeight(paint) * tableRows.size
    return ceil(width).toInt() to ceil(height).toInt()
  }

  private fun drawTable(canvas: Canvas, x: Float, top: Float, paint: Paint) {
    if (tableRows.isEmpty()) return
    val widths = columnWidths(paint)
    val rowH = rowHeight(paint)
    val fm = paint.fontMetrics

    val gridPaint = Paint(paint).apply {
      color = borderColor
      style = Paint.Style.STROKE
      strokeWidth = 1f
    }
    val fillPaint = Paint(paint).apply {
      color = headerFill
      style = Paint.Style.FILL
    }
    val textPaint = Paint(paint).apply { color = Color.parseColor("#222222") }
    val headerPaint = Paint(textPaint).apply { isFakeBoldText = true }

    var cellTop = top
    for ((r, row) in tableRows.withIndex()) {
      var cellLeft = x
      val isHeader = tableHasHeader && r == 0
      for (c in widths.indices) {
        val w = widths[c]
        val rect = RectF(cellLeft, cellTop, cellLeft + w, cellTop + rowH)
        if (isHeader) canvas.drawRect(rect, fillPaint)
        canvas.drawRect(rect, gridPaint)
        val cellText = row.getOrNull(c) ?: ""
        canvas.drawText(
          cellText,
          cellLeft + cellPad,
          cellTop + cellPad - fm.ascent,
          if (isHeader) headerPaint else textPaint,
        )
        cellLeft += w
      }
      cellTop += rowH
    }
  }

  companion object {
    /** Build a span from an EmbedPlaceholder JSON object (from the document model). */
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

    /** Parse `data.rows` (a JSON string of string[][]) into a grid, tolerating malformed input. */
    private fun parseTableRows(dataJson: String): List<List<String>> {
      return runCatching {
        val rowsStr = JSONObject(dataJson).optString("rows")
        val arr = JSONArray(rowsStr)
        (0 until arr.length()).map { r ->
          val row = arr.getJSONArray(r)
          (0 until row.length()).map { c -> row.optString(c) }
        }
      }.getOrDefault(emptyList())
    }
  }
}
