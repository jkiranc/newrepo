package com.richtexteditor

// A non-visual marker span carrying block-level metadata for one paragraph, so multi-block
// reconstruction can recover each paragraph's tag/list without it being part of the text
// (the parity counterpart of iOS's stamped `rteBlockTag` attributes).
class BlockTagSpan(
  val tag: String,
  val listType: String? = null,
  val listDepth: Int = 0,
  val indentLevel: Int = 0,
  val align: String? = null,
  val checked: Boolean = false,
  val listIndex: Int = 0,
)
