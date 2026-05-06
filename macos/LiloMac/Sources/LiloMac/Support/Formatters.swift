import Foundation

func relativeDate(_ isoString: String) -> String {
    guard let date = parseDate(isoString) else { return isoString }
    return date.formatted(.relative(presentation: .named))
}

func friendlyDate(_ value: String?) -> String {
    guard let value, let date = parseDate(value) else { return "Not scheduled" }
    let calendar = Calendar.current
    let time = date.formatted(date: .omitted, time: .shortened)
    if calendar.isDateInToday(date) { return "Today at \(time)" }
    if calendar.isDateInTomorrow(date) { return "Tomorrow at \(time)" }
    return date.formatted(.dateTime.month(.abbreviated).day().hour().minute())
}

func parseDate(_ value: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: value) { return date }
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: value)
}

func displayChatTitle(_ title: String?) -> String {
    let trimmed = (title ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty || trimmed.lowercased() == "(no messages)" {
        return "New chat"
    }
    return trimmed
}

func stripAdditionalContext(from content: String) -> String {
    content.replacing(
        /(?s)\n*<additional_context>.*?<\/additional_context>/,
        with: ""
    )
    .trimmingCharacters(in: .whitespacesAndNewlines)
}
