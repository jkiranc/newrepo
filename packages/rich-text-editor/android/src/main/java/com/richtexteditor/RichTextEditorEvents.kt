package com.richtexteditor

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

// Fabric events forwarded to the JS `on*` handlers declared in the codegen spec.

class DocumentChangeEvent(viewId: Int, private val json: String) :
  Event<DocumentChangeEvent>(viewId) {
  override fun getEventName() = "onDocumentChange"
  override fun getEventData(): WritableMap =
    Arguments.createMap().apply { putString("documentJson", json) }
}

class SelectionChangeEvent(
  viewId: Int,
  private val blockId: String,
  private val start: Int,
  private val end: Int,
  private val styles: String,
) : Event<SelectionChangeEvent>(viewId) {
  override fun getEventName() = "onSelectionChange"
  override fun getEventData(): WritableMap = Arguments.createMap().apply {
    putString("blockId", blockId)
    putInt("start", start)
    putInt("end", end)
    putString("activeStyles", styles)
  }
}

class EmbedPressEvent(viewId: Int, private val tag: String, private val dataJson: String) :
  Event<EmbedPressEvent>(viewId) {
  override fun getEventName() = "onEmbedPress"
  override fun getEventData(): WritableMap = Arguments.createMap().apply {
    putString("tag", tag)
    putString("dataJson", dataJson)
  }
}
