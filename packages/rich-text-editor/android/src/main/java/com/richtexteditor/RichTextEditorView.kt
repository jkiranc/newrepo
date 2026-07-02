package com.richtexteditor

import android.content.Context
import android.text.Editable
import android.text.TextWatcher
import android.text.style.ForegroundColorSpan
import android.text.style.StrikethroughSpan
import android.text.style.StyleSpan
import android.text.style.URLSpan
import android.text.style.UnderlineSpan
import android.graphics.Typeface
import androidx.appcompat.widget.AppCompatEditText
import org.json.JSONArray
import org.json.JSONObject

// -------------------------------------------------------------------------------------------
// RichTextEditorView
//
// The Android native view. Owns an EditText and the live Editable buffer. Like iOS, it only
// understands the native document model (applied by SpanApplier) — never HTML/tags.
//
// Phase-3 scaffold: inline style runs render; a change listener reconstructs the document and
// hands it back to the view manager, which forwards it as a Fabric event. Block/embed
// reconstruction and command handling are stubbed where noted for later phases.
// -------------------------------------------------------------------------------------------
class RichTextEditorView(context: Context) : AppCompatEditText(context) {

  var onDocumentChange: ((String) -> Unit)? = null
  var onSelectionChangeListener: ((String, Int, Int, String) -> Unit)? = null
  var onEmbedPress: ((String, String) -> Unit)? = null

  private var currentBlockTag = "p"
  private var currentBlockId = "b0"
  private var seeded = false
  private var suppressEvents = false

  init {
    setPadding(24, 24, 24, 24)
    addTextChangedListener(object : TextWatcher {
      override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
      override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
      override fun afterTextChanged(s: Editable?) {
        if (!suppressEvents) emitDocumentChange()
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

  fun toggleInlineStyle(style: String) {
    // Phase 3: apply/remove the matching span across the current selection, then re-emit.
    emitDocumentChange()
  }

  fun setBlockType(tag: String) {
    currentBlockTag = tag
    emitDocumentChange()
  }

  fun insertEmbed(embedJson: String) {
    // Phase 4b: insert an EmbedReplacementSpan at the cursor for the decoded embed.
    emitDocumentChange()
  }

  override fun onSelectionChanged(selStart: Int, selEnd: Int) {
    super.onSelectionChanged(selStart, selEnd)
    onSelectionChangeListener?.invoke(currentBlockId, selStart, selEnd, activeStyles(selStart, selEnd))
  }

  // MARK: - Editable -> document

  /** Walk spans in the Editable and coalesce contiguous equal-attribute ranges into runs. */
  private fun emitDocumentChange() {
    val editable = text ?: return
    val runs = JSONArray()
    // Simplified reconstruction for the scaffold: collect known inline spans into runs.
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
    val doc = JSONObject().put("blocks", JSONArray().put(block))
    onDocumentChange?.invoke(doc.toString())
  }

  private fun runFor(editable: Editable, start: Int, end: Int): JSONObject? {
    val run = JSONObject().put("start", start).put("length", end - start).put("tag", "span")
    var styled = false
    for (span in editable.getSpans(start, end, Any::class.java)) {
      when (span) {
        is StyleSpan -> when (span.style) {
          Typeface.BOLD -> { run.put("bold", true); styled = true }
          Typeface.ITALIC -> { run.put("italic", true); styled = true }
          Typeface.BOLD_ITALIC -> { run.put("bold", true).put("italic", true); styled = true }
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

  private fun activeStyles(start: Int, end: Int): String {
    val editable = text ?: return ""
    val styles = mutableListOf<String>()
    for (span in editable.getSpans(start, end, Any::class.java)) {
      when (span) {
        is StyleSpan -> when (span.style) {
          Typeface.BOLD -> styles.add("bold")
          Typeface.ITALIC -> styles.add("italic")
          Typeface.BOLD_ITALIC -> { styles.add("bold"); styles.add("italic") }
        }
        is UnderlineSpan -> styles.add("underline")
        is StrikethroughSpan -> styles.add("strikethrough")
      }
    }
    return styles.distinct().joinToString(",")
  }
}
