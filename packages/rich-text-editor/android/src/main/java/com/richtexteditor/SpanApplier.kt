package com.richtexteditor

import android.graphics.Color
import android.graphics.Typeface
import android.text.Layout
import android.text.Spannable
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.AbsoluteSizeSpan
import android.text.style.AlignmentSpan
import android.text.style.BackgroundColorSpan
import android.text.style.ForegroundColorSpan
import android.text.style.LeadingMarginSpan
import android.text.style.RelativeSizeSpan
import android.text.style.StrikethroughSpan
import android.text.style.StyleSpan
import android.text.style.SubscriptSpan
import android.text.style.SuperscriptSpan
import android.text.style.TypefaceSpan
import android.text.style.URLSpan
import android.text.style.UnderlineSpan
import org.json.JSONArray
import org.json.JSONObject

// -------------------------------------------------------------------------------------------
// SpanApplier
//
// Pure, view-independent translation of the native document model (JSON) into a
// SpannableStringBuilder. Factored out from the live EditText so it can be unit-tested with
// JUnit/Robolectric. Native never parses HTML — the tag/HTML layer lives entirely in JS.
//
// Mirrors packages/rich-text-editor/src/types/nativeTypes.ts.
// -------------------------------------------------------------------------------------------
object SpanApplier {

  private const val DEFAULT_FONT_SIZE_SP = 16

  /** Build a spannable for a whole document, blocks joined by newlines. */
  fun spannableForDocument(documentJson: String, density: Float): SpannableStringBuilder {
    val builder = SpannableStringBuilder()
    val blocks = JSONObject(documentJson).optJSONArray("blocks") ?: JSONArray()
    for (i in 0 until blocks.length()) {
      if (i > 0) builder.append("\n")
      appendBlock(builder, blocks.getJSONObject(i), density)
    }
    return builder
  }

  private fun appendBlock(builder: SpannableStringBuilder, block: JSONObject, density: Float) {
    val start = builder.length
    builder.append(block.optString("text"))
    val end = builder.length

    val tag = block.optString("tag", "p")
    val listType = if (block.has("listType")) block.optString("listType") else null
    val indentLevel = block.optInt("indentLevel", 0)
    val align = if (block.has("align")) block.optString("align") else null
    styleBlock(builder, start, end, tag, listType, indentLevel, align, density)

    val runs = block.optJSONArray("styleRuns") ?: JSONArray()
    for (i in 0 until runs.length()) {
      applyRun(builder, runs.getJSONObject(i), blockOffset = start, density = density)
    }

    // Embeds: block text already holds a U+FFFC placeholder at each offset; draw a chip over it.
    val embeds = block.optJSONArray("embeds") ?: JSONArray()
    for (i in 0 until embeds.length()) {
      val embed = embeds.getJSONObject(i)
      val at = start + embed.optInt("offset")
      if (at in 0 until builder.length) {
        builder.setSpan(
          EmbedReplacementSpan.fromEmbed(embed),
          at,
          at + 1,
          Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
        )
      }
    }
  }

  /**
   * Apply block-level styling (heading size, code font, indent) plus a BlockTagSpan marker over
   * `[start, end]`. Reusable by both initial rendering and the view's setBlockType. Headings use
   * only a size span (no bold) so inline bold is never clobbered when the block type changes.
   */
  fun styleBlock(
    builder: Spannable,
    start: Int,
    end: Int,
    tag: String,
    listType: String?,
    indentLevel: Int,
    align: String?,
    density: Float,
  ) {
    if (end < start) return
    val headingScale = when (tag) {
      "h1" -> 1.9f
      "h2" -> 1.6f
      "h3" -> 1.4f
      "h4" -> 1.2f
      "h5" -> 1.1f
      "h6" -> 1.0f
      else -> null
    }
    if (headingScale != null && end > start) {
      builder.setSpan(RelativeSizeSpan(headingScale), start, end, Spanned.SPAN_INCLUSIVE_INCLUSIVE)
    }
    if ((tag == "pre" || tag == "code") && end > start) {
      builder.setSpan(TypefaceSpan("monospace"), start, end, Spanned.SPAN_INCLUSIVE_INCLUSIVE)
    }
    val indentLevels = indentLevel + (if (listType != null && listType != "none") 1 else 0) +
      (if (tag == "blockquote") 1 else 0)
    if (indentLevels > 0 && end > start) {
      val marginPx = (indentLevels * 20 * density).toInt()
      builder.setSpan(LeadingMarginSpan.Standard(marginPx), start, end, Spanned.SPAN_INCLUSIVE_INCLUSIVE)
    }
    // Paragraph alignment. Android's AlignmentSpan has no justify; treat it as normal (left).
    val alignment = when (align) {
      "center" -> Layout.Alignment.ALIGN_CENTER
      "right" -> Layout.Alignment.ALIGN_OPPOSITE
      else -> null
    }
    if (alignment != null && end > start) {
      builder.setSpan(AlignmentSpan.Standard(alignment), start, end, Spanned.SPAN_INCLUSIVE_INCLUSIVE)
    }
    builder.setSpan(
      BlockTagSpan(tag = tag, listType = listType, indentLevel = indentLevel, align = align),
      start,
      end,
      Spanned.SPAN_INCLUSIVE_INCLUSIVE,
    )
  }

  private fun applyRun(builder: SpannableStringBuilder, run: JSONObject, blockOffset: Int, density: Float) {
    val start = blockOffset + run.optInt("start")
    val end = start + run.optInt("length")
    if (end <= start || end > builder.length) return
    val flag = Spanned.SPAN_INCLUSIVE_EXCLUSIVE

    // Separate single-trait spans (never BOLD_ITALIC) so StyleEngine can toggle each
    // independently and split them cleanly on removal. Overlapping spans combine on render.
    if (run.optBoolean("bold")) builder.setSpan(StyleSpan(Typeface.BOLD), start, end, flag)
    if (run.optBoolean("italic")) builder.setSpan(StyleSpan(Typeface.ITALIC), start, end, flag)
    if (run.optBoolean("underline")) builder.setSpan(UnderlineSpan(), start, end, flag)
    if (run.optBoolean("strikethrough")) builder.setSpan(StrikethroughSpan(), start, end, flag)
    if (run.optBoolean("superscript")) builder.setSpan(SuperscriptSpan(), start, end, flag)
    if (run.optBoolean("subscript")) builder.setSpan(SubscriptSpan(), start, end, flag)

    run.optString("color").takeIf { it.isNotEmpty() }?.let { hex ->
      parseColor(hex)?.let { builder.setSpan(ForegroundColorSpan(it), start, end, flag) }
    }
    run.optString("backgroundColor").takeIf { it.isNotEmpty() }?.let { hex ->
      parseColor(hex)?.let { builder.setSpan(BackgroundColorSpan(it), start, end, flag) }
    }
    if (run.has("fontSize")) {
      val px = (run.getDouble("fontSize") * density).toInt()
      builder.setSpan(AbsoluteSizeSpan(px), start, end, flag)
    }
    if (run.optString("fontFamily") == "monospace") {
      builder.setSpan(TypefaceSpan("monospace"), start, end, flag)
    }
    run.optString("link").takeIf { it.isNotEmpty() }?.let {
      builder.setSpan(URLSpan(it), start, end, flag)
    }
  }

  /** Parse `#RGB`, `#RRGGBB`, or `#RRGGBBAA` (Android's Color wants #AARRGGBB). */
  fun parseColor(hex: String): Int? {
    var value = hex.trim()
    if (!value.startsWith("#")) return null
    value = value.substring(1)
    if (value.length == 3) {
      value = value.map { "$it$it" }.joinToString("")
    }
    return try {
      when (value.length) {
        6 -> Color.parseColor("#$value")
        8 -> {
          // Reorder RRGGBBAA -> AARRGGBB.
          val rgb = value.substring(0, 6)
          val alpha = value.substring(6, 8)
          Color.parseColor("#$alpha$rgb")
        }
        else -> null
      }
    } catch (e: IllegalArgumentException) {
      null
    }
  }
}
