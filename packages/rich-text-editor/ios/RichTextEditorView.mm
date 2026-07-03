#import "RichTextEditorView.h"

#import <react/renderer/components/RichTextEditorSpec/ComponentDescriptors.h>
#import <react/renderer/components/RichTextEditorSpec/EventEmitters.h>
#import <react/renderer/components/RichTextEditorSpec/Props.h>
#import <react/renderer/components/RichTextEditorSpec/RCTComponentViewHelpers.h>

#import "RCTFabricComponentsPlugins.h"

// If a Swift bridging header is generated for this pod, it exposes RichTextEditorViewImpl.
#if __has_include("RichTextEditor-Swift.h")
#import "RichTextEditor-Swift.h"
#endif

using namespace facebook::react;

// -----------------------------------------------------------------------------------------
// Fabric shim.
//
// This is intentionally thin. Its only jobs are:
//   1. Conform to RCTComponentViewProtocol / RCTRichTextEditorViewViewProtocol (codegen).
//   2. Translate props/commands into calls on the Swift `RichTextEditorViewImpl`, which does
//      all the real TextKit work (see RichTextEditorView.swift + SpanApplier.swift).
//   3. Translate the Swift impl's callbacks back into Fabric events.
//
// The document itself crosses the bridge as a JSON string (`initialDocumentJson`), so nothing
// here needs to understand HTML or tags — that all lives in JS.
// -----------------------------------------------------------------------------------------
@interface RichTextEditorView () <RCTRichTextEditorViewViewProtocol>
@end

@implementation RichTextEditorView {
  RichTextEditorViewImpl *_impl;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<RichTextEditorViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const RichTextEditorViewProps>();
    _props = defaultProps;

    _impl = [RichTextEditorViewImpl new];

    __weak __typeof(self) weakSelf = self;
    _impl.onDocumentChangeJSON = ^(NSString *json) {
      [weakSelf emitDocumentChange:json];
    };
    _impl.onSelectionChangeBlock = ^(NSString *blockId, NSInteger start, NSInteger end, NSString *styles) {
      [weakSelf emitSelectionChange:blockId start:start end:end styles:styles];
    };
    _impl.onEmbedPressBlock = ^(NSString *tag, NSString *dataJson) {
      [weakSelf emitEmbedPress:tag dataJson:dataJson];
    };

    self.contentView = _impl.textView;
  }
  return self;
}

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
  const auto &newViewProps = *std::static_pointer_cast<const RichTextEditorViewProps>(props);

  NSString *docJson = [NSString stringWithUTF8String:newViewProps.initialDocumentJson.c_str()];
  [_impl applyInitialDocumentJSON:docJson];
  [_impl setEditable:newViewProps.editable];
  [_impl setPlaceholder:[NSString stringWithUTF8String:newViewProps.placeholder.c_str()]];

  [super updateProps:props oldProps:oldProps];
}

// Commands (setDocument / focus / blur / toggleInlineStyle / setBlockType / insertEmbed).
- (void)handleCommand:(const NSString *)commandName args:(const NSArray *)args
{
  RCTRichTextEditorViewHandleCommand(self, commandName, args);
}

- (void)setDocument:(NSString *)documentJson { [_impl setDocumentJSON:documentJson]; }
- (void)focus { [_impl focus]; }
- (void)blur { [_impl blur]; }
- (void)toggleInlineStyle:(NSString *)style { [_impl toggleInlineStyle:style]; }
- (void)setBlockType:(NSString *)tag { [_impl setBlockType:tag]; }
- (void)setAlignment:(NSString *)align { [_impl setAlignment:align]; }
- (void)setTextColor:(NSString *)color { [_impl setTextColor:color]; }
- (void)setLink:(NSString *)url { [_impl setLink:url]; }
- (void)insertLink:(NSString *)text url:(NSString *)url { [_impl insertLink:text url:url]; }
- (void)setFontSize:(NSInteger)size { [_impl setFontSize:size]; }
- (void)adjustIndent:(NSInteger)delta { [_impl adjustIndent:delta]; }
- (void)toggleList:(NSString *)listType { [_impl toggleList:listType]; }
- (void)insertText:(NSString *)text { [_impl insertText:text]; }
- (void)insertEmbed:(NSString *)embedJson { [_impl insertEmbedJSON:embedJson]; }

// Event emitters.
- (void)emitDocumentChange:(NSString *)json
{
  if (_eventEmitter == nullptr) { return; }
  std::static_pointer_cast<const RichTextEditorViewEventEmitter>(_eventEmitter)
      ->onDocumentChange({.documentJson = std::string(json.UTF8String)});
}

- (void)emitSelectionChange:(NSString *)blockId start:(NSInteger)start end:(NSInteger)end styles:(NSString *)styles
{
  if (_eventEmitter == nullptr) { return; }
  std::static_pointer_cast<const RichTextEditorViewEventEmitter>(_eventEmitter)
      ->onSelectionChange({
          .blockId = std::string(blockId.UTF8String),
          .start = static_cast<int>(start),
          .end = static_cast<int>(end),
          .activeStyles = std::string(styles.UTF8String),
      });
}

- (void)emitEmbedPress:(NSString *)tag dataJson:(NSString *)dataJson
{
  if (_eventEmitter == nullptr) { return; }
  std::static_pointer_cast<const RichTextEditorViewEventEmitter>(_eventEmitter)
      ->onEmbedPress({
          .tag = std::string(tag.UTF8String),
          .dataJson = std::string(dataJson.UTF8String),
      });
}

@end

Class<RCTComponentViewProtocol> RichTextEditorViewCls(void)
{
  return RichTextEditorView.class;
}
