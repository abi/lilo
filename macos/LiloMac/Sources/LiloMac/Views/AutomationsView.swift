import SwiftUI

struct AutomationsView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        List {
            Section("Notification channel") {
                Text(model.workspacePreferences.automationOutputChannel ?? "Not configured")
                    .foregroundStyle(.secondary)
            }
            Section("Jobs") {
                ForEach(model.automationJobs) { job in
                    AutomationRow(job: job)
                }
            }
        }
        .navigationTitle("Automations")
    }
}

struct AutomationRow: View {
    @EnvironmentObject private var model: AppModel
    var job: AutomationJob

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(job.name)
                    .font(.headline)
                    .lineLimit(1)
                Spacer()
                Text(job.lastStatus ?? "idle")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(statusColor)
            }
            Text("\(readableSchedule(job.schedule)) · Next: \(friendlyDate(job.nextRunAt))")
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            DisclosureGroup("Prompt") {
                Text(job.prompt)
                    .textSelection(.enabled)
                    .foregroundStyle(.secondary)
            }
            HStack {
                Button("Run Now") {
                    Task { await model.runAutomation(job.id) }
                }
                Button(job.enabled ? "Disable" : "Enable") {
                    Task { await model.setAutomation(job, enabled: !job.enabled) }
                }
                Button("Delete", role: .destructive) {
                    Task { await model.deleteAutomation(job.id) }
                }
            }
            .buttonStyle(.bordered)
        }
        .padding(.vertical, 6)
    }

    private var statusColor: Color {
        switch job.lastStatus {
        case "success": .green
        case "error": .red
        case "running": .blue
        default: .secondary
        }
    }
}

private func readableSchedule(_ schedule: AutomationSchedule) -> String {
    if schedule.type == "at", let at = schedule.at {
        return friendlyDate(at)
    }
    guard let expression = schedule.expression else { return "No schedule" }
    let parts = expression.split(separator: " ").map(String.init)
    guard parts.count == 5 else { return "Custom schedule: \(expression)" }
    let minute = parts[0]
    let hour = parts[1]
    let dayOfMonth = parts[2]
    let month = parts[3]
    let dayOfWeek = parts[4]
    guard let hourInt = Int(hour), let minuteInt = Int(minute) else {
        if minute.hasPrefix("*/"), hour == "*" { return "Every \(minute.dropFirst(2)) minutes" }
        return "Custom schedule: \(expression)"
    }
    var components = DateComponents()
    components.hour = hourInt
    components.minute = minuteInt
    let time = Calendar.current.date(from: components)?.formatted(date: .omitted, time: .shortened) ?? "\(hour):\(minute)"
    if dayOfMonth == "*" && month == "*" {
        if dayOfWeek == "*" { return "Every day at \(time)" }
        if dayOfWeek == "1-5" { return "Every weekday at \(time)" }
    }
    return "Custom schedule: \(expression)"
}
