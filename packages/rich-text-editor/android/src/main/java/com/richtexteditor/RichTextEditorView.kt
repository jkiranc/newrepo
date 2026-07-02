package com.richtexteditor

import android.content.Context
import android.text.Editable
import android.text.Spannable
import android.text.TextWatcher
import android.text.style.ForegroundColorSpan
import android.text.style.StrikethroughSpan
import android.text.style.StyleSpan
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
  private var lastInsertStart = -1
  private var lastInsertCount = 0

  init {
    setPadding(24, 24, 24, 24)
    addTextChangedListener(object : TextWatcher {
      override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
      override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
        lastInsertStart = start
        lastInsertCount = count
      }
      override fun afterTextChanged(s: Editable?) {
        if (suppressEvents) return
        applyPendingStyles()
        emitDocumentChange()
      }
    })
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
    currentBlockTag = tag
    emitDocumentChange()
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
    if (suppressEvents) return
    if (selStart == selEnd) {
      // Caret moved: refresh pending styles from what's active just before the caret.
      pendingStyles.clear()
      pendingStyles.addAll(stylesAt(selStart))
    }
    notifySelectionChange(selStart, selEnd)
  }

  // MARK: - Typing inheritance

  private fun applyPendingStyles() {
    val editable = text ?: return
    if (pendingStyles.isEmpty() || lastInsertCount <= 0) return
    val start = lastInsertStart
    val end = minOf(editable.length, start + lastInsertCount)
    if (end <= start) return
    suppressEvents = true
    for (style in pendingStyles) StyleEngine.setStyle(style, true, editable, start, end)
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

  /** Walk spans in the Editable and coalesce contiguous equal-attribute ranges into runs. */
  private fun emitDocumentChange() {
    val editable = text ?: return
    val runs = JSONArray()
    var i = 0
    while (i < editable.length) {
      val next = editable.nextSpanTransition(i, editable.length, Any::class.java)
      val run = runFor(editable, i, next)
      if (run != null) runs.put(run)
      i = next
    }

    val block = JSONObject()
      .put("id", currentBlockId)
      .put("tag", currentBlockTag)
      .put("text", editable.toString())
      .put("styleRuns", runs)

    // Recover embeds from their chip spans so onChangeHtml round-trips custom tags.
    val embeds = JSONArray()
    for (span in editable.getSpans(0, editable.length, EmbedReplacementSpan::class.java)) {
      val at = editable.getSpanStart(span)
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

    val doc = JSONObject().put("blocks", JSONArray().put(block))
    onDocumentChange?.invoke(doc.toString())
  }

  private fun runFor(editable: Editable, start: Int, end: Int): JSONObject? {
    val run = JSONObject().put("start", start).put("length", end - start).put("tag", "span")
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
