package com.richtexteditor

import android.text.style.AbsoluteSizeSpan

// -------------------------------------------------------------------------------------------
// HeadingSizeSpan
//
// The block-level base size for a heading (h1–h6), expressed as an ABSOLUTE size in px. Using
// an absolute size (rather than a RelativeSizeSpan multiplier) means an explicit inline
// font-size, applied as a plain AbsoluteSizeSpan over the same text, cleanly overrides the
// heading size instead of multiplying with it (18px × 1.9 ≈ 34px was the old bug).
//
// It is a distinct subclass so document reconstruction (runFor) can tell a heading's base size
// apart from a user-set inline font-size and avoid emitting a redundant <span font-size> run.
// -------------------------------------------------------------------------------------------
class HeadingSizeSpan(sizePx: Int) : AbsoluteSizeSpan(sizePx)
