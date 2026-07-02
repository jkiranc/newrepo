import UIKit

// -------------------------------------------------------------------------------------------
// EmbedTextAttachment
//
// Draws an inline embed directly into the text flow — no live child view is mounted. A "chip"
// (e.g. a consumer-registered <mention>) is rendered as a rounded label; an "image" is loaded
// asynchronously. Because the JS registry produces the chip's label/colors, a brand-new custom
// tag renders natively with ZERO native changes — this is the package's core differentiator.
//
// The originating EmbedPlaceholder is retained on the attachment so the document can be
// reconstructed (and taps resolved) from the live buffer.
// -------------------------------------------------------------------------------------------
final class EmbedTextAttachment: NSTextAttachment {

    let embed: EmbedPlaceholder
    /// Called when an async image finishes loading, so the view can invalidate layout.
    var onImageLoaded: (() -> Void)?

    init(embed: EmbedPlaceholder) {
        self.embed = embed
        super.init(data: nil, ofType: nil)
        switch embed.kind {
        case "image": renderImage()
        default: renderChip()
        }
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    /// JSON of the embed's `data` map, for onEmbedPress.
    var dataJSON: String {
        guard let data = try? JSONSerialization.data(withJSONObject: embed.data),
              let json = String(data: data, encoding: .utf8) else { return "{}" }
        return json
    }

    // MARK: - Chip

    private func renderChip() {
        let label = embed.label ?? ""
        let font = UIFont.systemFont(ofSize: SpanApplier.defaultFontSize)
        let textColor = UIColor(hex: embed.textColor ?? "") ?? .systemBlue
        let background = UIColor(hex: embed.backgroundColor ?? "") ?? UIColor.systemGray5
        let radius = CGFloat(embed.cornerRadius ?? 8)
        let hPad: CGFloat = 8
        let vPad: CGFloat = 3

        let textSize = (label as NSString).size(withAttributes: [.font: font])
        let size = CGSize(width: ceil(textSize.width) + hPad * 2, height: ceil(textSize.height) + vPad * 2)

        let renderer = UIGraphicsImageRenderer(size: size)
        image = renderer.image { _ in
            let rect = CGRect(origin: .zero, size: size)
            UIBezierPath(roundedRect: rect, cornerRadius: radius).addClip()
            background.setFill()
            UIRectFill(rect)
            (label as NSString).draw(
                at: CGPoint(x: hPad, y: vPad),
                withAttributes: [.font: font, .foregroundColor: textColor]
            )
        }
        // Nudge the baseline so the chip sits inline with surrounding text.
        bounds = CGRect(x: 0, y: font.descender, width: size.width, height: size.height)
    }

    // MARK: - Image

    private func renderImage() {
        if let w = embed.width, let h = embed.height {
            bounds = CGRect(x: 0, y: 0, width: w, height: h)
        }
        guard let src = embed.src, let url = URL(string: src) else { return }
        ImageAttachmentLoader.shared.load(url) { [weak self] loaded in
            guard let self, let loaded else { return }
            self.image = loaded
            if self.embed.width == nil || self.embed.height == nil {
                self.bounds = CGRect(origin: .zero, size: loaded.size)
            }
            self.onImageLoaded?()
        }
    }
}

/// Tiny async image loader with an in-memory cache, used by image embeds.
final class ImageAttachmentLoader {
    static let shared = ImageAttachmentLoader()
    private let cache = NSCache<NSURL, UIImage>()

    func load(_ url: URL, completion: @escaping (UIImage?) -> Void) {
        if let cached = cache.object(forKey: url as NSURL) {
            completion(cached)
            return
        }
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            let image = data.flatMap(UIImage.init(data:))
            if let image { self?.cache.setObject(image, forKey: url as NSURL) }
            DispatchQueue.main.async { completion(image) }
        }.resume()
    }
}
