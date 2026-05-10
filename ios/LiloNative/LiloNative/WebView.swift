import SwiftUI
import PDFKit
import WebKit

struct WebView: UIViewRepresentable {
    var url: URL

    final class Coordinator {
        var requestedURL: URL?
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.applicationNameForUserAgent = "LiloNative"
        configuration.websiteDataStore = .default()
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard context.coordinator.requestedURL != url else {
            return
        }

        context.coordinator.requestedURL = url
        var request = URLRequest(url: url)
        request.setValue("1", forHTTPHeaderField: "X-Lilo-Native-Viewer")

        let cookies = APIClient.shared.cookies(for: url)
        guard !cookies.isEmpty else {
            webView.load(request)
            return
        }

        let group = DispatchGroup()
        for cookie in cookies {
            group.enter()
            webView.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) {
                group.leave()
            }
        }
        group.notify(queue: .main) {
            guard context.coordinator.requestedURL == url else {
                return
            }
            webView.load(request)
        }
    }
}

struct PDFPreview: UIViewRepresentable {
    var data: Data

    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        view.backgroundColor = .systemBackground
        view.document = PDFDocument(data: data)
        return view
    }

    func updateUIView(_ view: PDFView, context: Context) {
        view.document = PDFDocument(data: data)
    }
}
