package com.richtexteditor

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.EventDispatcher
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.viewmanagers.RichTextEditorViewManagerDelegate
import com.facebook.react.viewmanagers.RichTextEditorViewManagerInterface

// -------------------------------------------------------------------------------------------
// RichTextEditorViewManager
//
// Bridges the Fabric-generated interface/delegate (RichTextEditorViewManager*) to the
// RichTextEditorView. Props and commands are declared in the JS codegen spec
// (src/RichTextEditorNativeComponent.ts); the generated delegate routes them here.
// Events are dispatched back through the Fabric EventDispatcher.
// -------------------------------------------------------------------------------------------
@ReactModule(name = RichTextEditorViewManager.NAME)
class RichTextEditorViewManager :
  SimpleViewManager<RichTextEditorView>(),
  RichTextEditorViewManagerInterface<RichTextEditorView> {

  private val delegate = RichTextEditorViewManagerDelegate(this)

  override fun getDelegate(): ViewManagerDelegate<RichTextEditorView> = delegate

  override fun getName(): String = NAME

  override fun createViewInstance(context: ThemedReactContext): RichTextEditorView {
    val view = RichTextEditorView(context)
    val dispatcher: EventDispatcher? =
      UIManagerHelper.getEventDispatcherForReactTag(context, view.id)

    view.onDocumentChange = { json ->
      dispatcher?.dispatchEvent(DocumentChangeEvent(view.id, json))
    }
    view.onSelectionChangeListener = { blockId, start, end, styles ->
      dispatcher?.dispatchEvent(SelectionChangeEvent(view.id, blockId, start, end, styles))
    }
    view.onEmbedPress = { tag, dataJson ->
      dispatcher?.dispatchEvent(EmbedPressEvent(view.id, tag, dataJson))
    }
    return view
  }

  // Props (names match the codegen spec).
  @ReactProp(name = "initialDocumentJson")
  override fun setInitialDocumentJson(view: RichTextEditorView, value: String?) {
    view.applyInitialDocument(value ?: "")
  }

  @ReactProp(name = "editable", defaultBoolean = true)
  override fun setEditable(view: RichTextEditorView, value: Boolean) {
    view.isEnabled = value
    view.isFocusable = value
    view.isFocusableInTouchMode = value
  }

  @ReactProp(name = "placeholder")
  override fun setPlaceholder(view: RichTextEditorView, value: String?) {
    view.hint = value
  }

  // Commands.
  override fun setDocument(view: RichTextEditorView, documentJson: String?) {
    view.setDocument(documentJson ?: "")
  }

  override fun focus(view: RichTextEditorView) {
    view.requestFocus()
  }

  override fun blur(view: RichTextEditorView) {
    view.clearFocus()
  }

  override fun toggleInlineStyle(view: RichTextEditorView, style: String?) {
    style?.let { view.toggleInlineStyle(it) }
  }

  override fun setBlockType(view: RichTextEditorView, tag: String?) {
    tag?.let { view.setBlockType(it) }
  }

  override fun setAlignment(view: RichTextEditorView, align: String?) {
    align?.let { view.setAlignment(it) }
  }

  override fun setTextColor(view: RichTextEditorView, color: String?) {
    view.setTextColor(color ?: "")
  }

  override fun setLink(view: RichTextEditorView, url: String?) {
    view.setLink(url ?: "")
  }

  override fun adjustIndent(view: RichTextEditorView, delta: Int) {
    view.adjustIndent(delta)
  }

  override fun insertText(view: RichTextEditorView, text: String?) {
    text?.let { view.insertText(it) }
  }

  override fun insertEmbed(view: RichTextEditorView, embedJson: String?) {
    embedJson?.let { view.insertEmbed(it) }
  }

  override fun receiveCommand(view: RichTextEditorView, commandId: String, args: ReadableArray?) {
    delegate.receiveCommand(view, commandId, args)
  }

  companion object {
    const val NAME = "RichTextEditorView"
  }
}
