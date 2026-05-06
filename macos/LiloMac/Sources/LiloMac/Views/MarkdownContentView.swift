import SwiftUI

struct MarkdownContentView: View {
    var markdown: String

    var body: some View {
        Text(inlineMarkdown(markdown.isEmpty ? " " : markdown))
            .frame(maxWidth: .infinity, alignment: .leading)
            .environment(\.openURL, OpenURLAction { url in
                .systemAction
            })
    }
}

private func inlineMarkdown(_ text: String) -> AttributedString {
    var options = AttributedString.MarkdownParsingOptions()
    options.interpretedSyntax = .inlineOnlyPreservingWhitespace
    return (try? AttributedString(markdown: text, options: options)) ?? AttributedString(text)
}
