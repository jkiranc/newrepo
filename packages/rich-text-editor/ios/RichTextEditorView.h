#import <UIKit/UIKit.h>

#ifndef RichTextEditorViewNativeComponent_h
#define RichTextEditorViewNativeComponent_h

NS_ASSUME_NONNULL_BEGIN

// Fabric requires an Objective-C++ view that conforms to RCTComponentViewProtocol. This
// class is a thin shim: it owns the codegen-generated component boilerplate and forwards all
// real editing work to the Swift `RichTextEditorViewImpl` (see RichTextEditorView.mm).
@interface RichTextEditorView : UIView
@end

NS_ASSUME_NONNULL_END

#endif /* RichTextEditorViewNativeComponent_h */
