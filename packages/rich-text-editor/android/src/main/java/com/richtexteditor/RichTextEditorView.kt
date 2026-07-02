package com.richtexteditor

import android.content.Context
import android.text.Editable
import android.text.InputType
import android.text.Spannable
import android.text.TextWatcher
import android.view.Gravity
import android.text.style.AlignmentSpan
import android.text.style.ForegroundColorSpan
import android.text.style.LeadingMarginSpan
import android.text.style.RelativeSizeSpan
import android.text.style.StrikethroughSpan
import android.text.style.StyleSpan
import android.text.style.TypefaceSpan
import android.text.style.URLSpan
import android.text.style.UnderlineSpan
import android.graphics.Typeface
import android.view.MotionEvent
import androidx.appcompat.widget.AppCompatEditText
import org.json.JSONArray
import org.json.JSONObject

// -------------------------------------------------------------------------------------------
// RichTextEditorView
//
// The Android native view. Owns an EditText and the live Editable buffer. Like iOS, it only
// understands the native document model (applied by SpanApplier); HTML/tags live in JS.
//
// Phase 3 brings parity with the iOS Phase-2 engine: toggle bold/italic/underline/strike over
// a selection, or — for a collapsed caret — track "pending styles" that are applied to newly
// typed characters (the Android equivalent of iOS typingAttributes). Blocks/embeds and command
// completeness follow in Phases 4+.
// -------------------------------------------------------------------------------------------
class RichTextEditorView(context: Context) : AppCompatEditText(context) {

  var onDocumentChange: ((String) -> Unit)? = null
  var onSelectionChangeListener: ((String, Int, Int, String) -> Unit)? = null
  var onEmbedPress: ((String, String) -> Unit)? = null

  private var currentBlockTag = "p"
  private var currentBlockId = "b0"
  private var seeded = false
  private var suppressEvents = false

  // Collapsed-caret styling: styles to apply to the next typed characters.
  private val pendingStyles = mutableSetOf<InlineStyle>()
  private var pendingColor: String? = null
  private var lastInsertStart = -1
  private var lastInsertCount = 0

  // AppCompatEditText's constructor calls setText, which fires onSelectionChanged before this
  // class's fields are initialized. Guard callbacks until construction finishes to avoid NPEs.
  private var initialized = false

  init {
    setPadding(24, 24, 24, 24)
    // Top-align content (EditText centers vertically when its height exceeds the text) and make
    // it a multi-line editor so Enter inserts newlines and text wraps from the top.
    gravity = Gravity.TOP or Gravity.START
    inputType = InputType.TYPE_CLASS_TEXT or
      InputType.TYPE_TEXT_FLAG_MULTI_LINE or
      InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
    addTextChangedListener(object : TextWatcher {
      override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
      override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
        lastInsertStart = start
        lastInsertCount = count
      }
      override fun afterTextChanged(s: Editable?) {
        if (!initialized || suppressEvents) return
        applyPendingStyles()
        emitDocumentChange()
      }
    })
    initialized = true
  }

  fun applyInitialDocument(json: String) {
    if (seeded || json.isEmpty()) return
    seeded = true
    setDocument(json)
  }

  fun setDocument(json: String) {
    suppressEvents = true
    val doc = JSONObject(json)
    doc.optJSONArray("blocks")?.optJSONObject(0)?.let {
      currentBlockTag = it.optString("tag", "p")
      currentBlockId = it.optString("id", "b0")
    }
    val density = resources.displayMetrics.density
    setText(SpanApplier.spannableForDocument(json, density))
    suppressEvents = false
  }

  fun toggleInlineStyle(styleName: String) {
    val style = InlineStyle.fromWire(styleName) ?: return
    val editable = text ?: return
    val start = selectionStart
    val end = selectionEnd
    if (end > start) {
      StyleEngine.toggle(style, editable, start, end)
      emitDocumentChange()
    } else {
      // Flip the pending style so the next typed characters inherit it.
      if (!pendingStyles.remove(style)) pendingStyles.add(style)
    }
    notifySelectionChange(start, end)
  }

  fun setBlockType(tag: String) {
    val editable = text ?: return
    val (start, end) = currentParagraphRange(editable, selectionStart)
    val existing = editable.getSpans(start, end, BlockTagSpan::class.java).firstOrNull()
    restyleParagraph(start, end, tag, existing?.listType, existing?.indentLevel ?: 0, existing?.align)
  }

  fun setAlignment(align: String) {
    val editable = text ?: return
    val (start, end) = currentParagraphRange(editable, selectionStart)
    val existing = editable.getSpans(start, end, BlockTagSpan::class.java).firstOrNull()
    restyleParagraph(start, end, existing?.tag ?: "p", existing?.listType, existing?.indentLevel ?: 0, align)
  }

  fun setTextColor(color: String) {
    val editable = text ?: return
    val start = selectionStart
    val end = selectionEnd
    if (end > start) {
      suppressEvents = true
      // Remove existing color spans in range, preserving the portions outside it.
      for (span in editable.getSpans(start, end, ForegroundColorSpan::class.java)) {
        val ss = editable.getSpanStart(span)
        val se = editable.getSpanEnd(span)
        val c = span.foregroundColor
        editable.removeSpan(span)
        if (ss < start) editable.setSpan(ForegroundColorSpan(c), ss, start, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        if (se > end) editable.setSpan(ForegroundColorSpan(c), end, se, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
      }
      if (color.isNotEmpty()) {
        SpanApplier.parseColor(color)?.let {
          editable.setSpan(ForegroundColorSpan(it), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
      }
      suppressEvents = false
      emitDocumentChange()
    } else {
      pendingColor = if (color.isEmpty()) null else color
    }
    notifySelectionChange(selectionStart, selectionEnd)
  }

  /** Remove block-level spans over a paragraph and re-apply styling for the given tag/align. */
  private fun restyleParagraph(start: Int, end: Int, tag: String, listType: String?, indentLevel: Int, align: String?) {
    val editable = text ?: return
    suppressEvents = true
    for (span in editable.getSpans(start, end, Any::class.java)) {
      when (span) {
        is RelativeSizeSpan, is TypefaceSpan, is LeadingMarginSpan, is AlignmentSpan, is BlockTagSpan ->
          editable.removeSpan(span)
      }
    }
    SpanApplier.styleBlock(editable, start, end, tag, listType, indentLevel, align, resources.displayMetrics.density)
    suppressEvents = false
    emitDocumentChange()
    notifySelectionChange(selectionStart, selectionEnd)
  }

  private fun currentParagraphRange(editable: Editable, cursor: Int): Pair<Int, Int> {
    var start = cursor.coerceIn(0, editable.length)
    var end = start
    while (start > 0 && editable[start - 1] != '\n') start--
    while (end < editable.length && editable[end] != '\n') end++
    return start to end
  }

  fun insertEmbed(embedJson: String) {
    val editable = text ?: return
    val embed = JSONObject(embedJson)
    val span = EmbedReplacementSpan.fromEmbed(embed)
    val pos = selectionStart.coerceIn(0, editable.length)
    suppressEvents = true
    editable.insert(pos, "￼")
    editable.setSpan(span, pos, pos + 1, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
    setSelection(pos + 1)
    suppressEvents = false
    emitDocumentChange()
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (event.action == MotionEvent.ACTION_UP) {
      val offset = getOffsetForPosition(event.x, event.y)
      val editable = text
      if (editable != null && offset in 0 until editable.length) {
        val spans = editable.getSpans(offset, offset + 1, EmbedReplacementSpan::class.java)
        spans.firstOrNull()?.let { onEmbedPress?.invoke(it.tag, it.dataJson) }
      }
    }
    return super.onTouchEvent(event)
  }

  override fun onSelectionChanged(selStart: Int, selEnd: Int) {
    super.onSelectionChanged(selStart, selEnd)
    // Fires during the superclass constructor (before fields exist) — bail until initialized.
    if (!initialized || suppressEvents) return
    if (selStart == selEnd) {
      // Caret moved: refresh pending styles from what's active just before the caret.
      pendingStyles.clear()
      pendingStyles.addAll(stylesAt(selStart))
      pendingColor = null
    }
    notifySelectionChange(selStart, selEnd)
  }

  // MARK: - Typing inheritance

  private fun applyPendingStyles() {
    val editable = text ?: return
    if ((pendingStyles.isEmpty() && pendingColor == null) || lastInsertCount <= 0) return
    val start = lastInsertStart
    val end = minOf(editable.length, start + lastInsertCount)
    if (end <= start) return
    suppressEvents = true
    for (style in pendingStyles) StyleEngine.setStyle(style, true, editable, start, end)
    pendingColor?.let { hex ->
      SpanApplier.parseColor(hex)?.let {
        editable.setSpan(ForegroundColorSpan(it), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
      }
    }
    suppressEvents = false
    lastInsertCount = 0
  }

  private fun stylesAt(pos: Int): Set<InlineStyle> {
    val editable = text ?: return emptySet()
    if (pos <= 0) return emptySet()
    return StyleEngine.activeStyles(editable, pos - 1, pos)
  }

  // MARK: - Selection reporting

  private fun notifySelectionChange(start: Int, end: Int) {
    onSelectionChangeListener?.invoke(currentBlockId, start, end, activeStylesString(start, end))
  }

  private fun activeStylesString(start: Int, end: Int): String {
    val editable = text ?: return ""
    val active: Set<InlineStyle> =
      if (end > start) StyleEngine.activeStyles(editable, start, end) else pendingStyles.toSet()
    return InlineStyle.values().filter { it in active }.joinToString(",") { it.wireName }
  }

  // MARK: - Editable -> document

  /** Split the buffer into paragraphs (on "\n") and reconstruct one block per paragraph. */
  private fun emitDocumentChange() {
    val editable = text ?: return
    val blocks = JSONArray()
    var paragraphStart = 0
    var index = 0
    var i = 0
    while (i <= editable.length) {
      if (i == editable.length || editable[i] == '\n') {
        blocks.put(buildBlockJson(editable, paragraphStart, i, index))
        index++
        paragraphStart = i + 1
      }
      i++
    }
    val doc = JSONObject().put("blocks", blocks)
    onDocumentChange?.invoke(doc.toString())
  }

  private fun buildBlockJson(editable: Editable, start: Int, end: Int, index: Int): JSONObject {
    val runs = JSONArray()
    var i = start
    while (i < end) {
      val next = editable.nextSpanTransition(i, end, Any::class.java)
      val run = runFor(editable, i, next, start)
      if (run != null) runs.put(run)
      i = next
    }

    var tag = "p"
    var listType: String? = null
    var indentLevel = 0
    var align: String? = null
    if (end > start) {
      editable.getSpans(start, end, BlockTagSpan::class.java).firstOrNull()?.let {
        tag = it.tag
        listType = it.listType
        indentLevel = it.indentLevel
        align = it.align
      }
    }

    val block = JSONObject()
      .put("id", "b$index")
      .put("tag", tag)
      .put("text", editable.subSequence(start, end).toString())
      .put("styleRuns", runs)
    listType?.let { block.put("listType", it).put("listDepth", 0) }
    if (indentLevel > 0) block.put("indentLevel", indentLevel)
    align?.let { block.put("align", it) }

    // Recover embeds from their chip spans (offsets relative to the paragraph).
    val embeds = JSONArray()
    for (span in editable.getSpans(start, end, EmbedReplacementSpan::class.java)) {
      val at = editable.getSpanStart(span) - start
      embeds.put(
        JSONObject()
          .put("id", "e$at")
          .put("offset", at)
          .put("tag", span.tag)
          .put("kind", span.kind)
          .put("label", span.label)
          .put("data", JSONObject(span.dataJson)),
      )
    }
    if (embeds.length() > 0) block.put("embeds", embeds)
    return block
  }

  private fun runFor(editable: Editable, start: Int, end: Int, blockStart: Int): JSONObject? {
    val run = JSONObject().put("start", start - blockStart).put("length", end - start).put("tag", "span")
    var styled = false
    for (span in editable.getSpans(start, end, Any::class.java)) {
      when (span) {
        is StyleSpan -> {
          if (span.style and Typeface.BOLD != 0) { run.put("bold", true); styled = true }
          if (span.style and Typeface.ITALIC != 0) { run.put("italic", true); styled = true }
        }
        is UnderlineSpan -> { run.put("underline", true); styled = true }
        is StrikethroughSpan -> { run.put("strikethrough", true); styled = true }
        is URLSpan -> { run.put("link", span.url); styled = true }
        is ForegroundColorSpan -> {
          run.put("color", String.format("#%06X", 0xFFFFFF and span.foregroundColor)); styled = true
        }
      }
    }
    return if (styled) run else null
  }
}
