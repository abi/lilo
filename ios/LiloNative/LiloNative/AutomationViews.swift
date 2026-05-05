import SwiftUI

struct AutomationsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var selectedTab: AutomationTab = .active

    private var active: [AutomationJob] {
        model.automationJobs.filter { $0.lastStatus != "error" && $0.nextRunAt != nil }
    }

    private var inactive: [AutomationJob] {
        model.automationJobs.filter { $0.lastStatus != "error" && $0.nextRunAt == nil }
    }

    private var errored: [AutomationJob] {
        model.automationJobs.filter { $0.lastStatus == "error" }
    }

    private var visibleJobs: [AutomationJob] {
        switch selectedTab {
        case .active: active
        case .inactive: inactive
        case .errored: errored
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Automations")
                        .font(.system(.title, design: .rounded).weight(.bold))
                    Text("Scheduled agent prompts that run silently unless they explicitly notify you.")
                        .foregroundStyle(.secondary)
                }

                AutomationChannelCard()

                Picker("Automation status", selection: $selectedTab) {
                    Text("Active \(active.count)").tag(AutomationTab.active)
                    Text("Inactive \(inactive.count)").tag(AutomationTab.inactive)
                    Text("Errored \(errored.count)").tag(AutomationTab.errored)
                }
                .pickerStyle(.segmented)

                let groups = automationGroups(visibleJobs, tab: selectedTab)
                if groups.isEmpty {
                    ContentUnavailableView(emptyTitle, systemImage: "calendar.badge.clock")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 40)
                } else {
                    ForEach(groups) { group in
                        AutomationGroupSection(group: group)
                    }
                }

                if let latestRun = model.automationRuns.first {
                    Text("Latest run: \(latestRun.automationName) · \(latestRun.status) · \(friendlyDate(latestRun.startedAt))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.top, 4)
                }
            }
            .padding()
        }
        .navigationTitle("Automations")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await model.refreshAutomations() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
            }
        }
        .refreshable { await model.refreshAutomations() }
    }

    private var emptyTitle: String {
        switch selectedTab {
        case .active: "No active automations"
        case .inactive: "No inactive automations"
        case .errored: "No errored automations"
        }
    }
}

enum AutomationTab: String, CaseIterable {
    case active
    case inactive
    case errored
}

struct AutomationChannelCard: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Automation notification channel")
                .font(.headline)
            Text("Used only when an automation explicitly sends a user-facing message.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text(model.workspacePreferences.automationOutputChannel ?? "Not configured")
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color(.secondarySystemBackground), in: Capsule())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color(.separator), lineWidth: 0.5)
        }
    }
}

struct AutomationGroupSection: View {
    var group: AutomationGroup

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Text(group.label.uppercased())
                    .font(.caption.weight(.heavy))
                    .foregroundStyle(.primary)
                    .tracking(1.2)
                Text("\(group.jobs.count)")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(Color(.secondarySystemBackground), in: Capsule())
                Rectangle()
                    .fill(Color(.separator))
                    .frame(height: 1)
            }

            ForEach(group.jobs) { job in
                AutomationRow(job: job)
            }
        }
    }
}

struct AutomationRow: View {
    @EnvironmentObject private var model: AppModel
    var job: AutomationJob

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(job.name)
                    .font(.headline)
                    .lineLimit(1)
                Text(job.lastStatus ?? "idle")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(statusColor)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(statusColor.opacity(0.12), in: Capsule())
                Spacer()
                Text(formatLastRun(job.lastRunAt))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Text(scheduleSummary(job))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)

            DisclosureGroup("Prompt") {
                Text(job.prompt)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                    .padding(.top, 4)
            }

            HStack {
                Button("Run now") {
                    Task { await model.runAutomation(job.id) }
                }
                Button(job.enabled ? "Disable" : "Enable") {
                    Task { await model.setAutomation(job, enabled: !job.enabled) }
                }
                Spacer()
                Button("Delete", role: .destructive) {
                    Task { await model.deleteAutomation(job.id) }
                }
            }
            .buttonStyle(.bordered)

            if let lastError = job.lastError {
                Text(lastError)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .lineLimit(3)
            }
        }
        .padding()
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color(.separator), lineWidth: 0.5)
        }
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

struct AutomationGroup: Identifiable {
    var id: String
    var label: String
    var jobs: [AutomationJob]
}

private func automationGroups(_ jobs: [AutomationJob], tab: AutomationTab) -> [AutomationGroup] {
    let sorted = jobs.sorted {
        let left = $0.nextRunAt.flatMap(parseDate)?.timeIntervalSince1970 ?? .infinity
        let right = $1.nextRunAt.flatMap(parseDate)?.timeIntervalSince1970 ?? .infinity
        if left != right { return left < right }
        return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
    }
    var groups: [String: AutomationGroup] = [:]
    for job in sorted {
        let bucket = bucketFor(job, tab: tab)
        groups[bucket.id, default: AutomationGroup(id: bucket.id, label: bucket.label, jobs: [])].jobs.append(job)
    }
    let order = ["overdue", "this-morning", "this-afternoon", "tonight", "tomorrow", "this-week", "next-week", "later", "inactive", "errored"]
    return groups.values.sorted {
        (order.firstIndex(of: $0.id) ?? 99) < (order.firstIndex(of: $1.id) ?? 99)
    }
}

private func bucketFor(_ job: AutomationJob, tab: AutomationTab) -> (id: String, label: String) {
    if tab == .inactive { return ("inactive", "Inactive") }
    if tab == .errored { return ("errored", "Errored") }
    guard let nextRunAt = job.nextRunAt.flatMap(parseDate) else { return ("inactive", "Inactive") }
    let now = Date()
    if nextRunAt < now { return ("overdue", "Overdue") }
    let calendar = Calendar.current
    if calendar.isDateInToday(nextRunAt) {
        let hour = calendar.component(.hour, from: nextRunAt)
        if hour < 12 { return ("this-morning", "This morning") }
        if hour < 17 { return ("this-afternoon", "This afternoon") }
        return ("tonight", "Tonight")
    }
    if calendar.isDateInTomorrow(nextRunAt) { return ("tomorrow", "Tomorrow") }
    let week = calendar.dateInterval(of: .weekOfYear, for: now)
    if let end = week?.end, nextRunAt < end { return ("this-week", "This week") }
    if let end = week?.end, let nextEnd = calendar.date(byAdding: .day, value: 7, to: end), nextRunAt < nextEnd {
        return ("next-week", "Next week")
    }
    return ("later", "Later")
}

private func scheduleSummary(_ job: AutomationJob) -> String {
    let schedule = readableSchedule(job.schedule)
    return "\(schedule) · Next: \(friendlyDate(job.nextRunAt))"
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
    if minute == "*" && hour == "*" && dayOfMonth == "*" && month == "*" && dayOfWeek == "*" {
        return "Every minute"
    }
    if minute.hasPrefix("*/"), hour == "*", dayOfMonth == "*", month == "*", dayOfWeek == "*" {
        return "Every \(minute.dropFirst(2)) minutes"
    }
    guard let hourInt = Int(hour), let minuteInt = Int(minute) else {
        return "Custom schedule: \(expression)"
    }
    var components = DateComponents()
    components.hour = hourInt
    components.minute = minuteInt
    let time = Calendar.current.date(from: components)?.formatted(date: .omitted, time: .shortened) ?? "\(hour):\(minute)"
    if dayOfMonth == "*" && month == "*" {
        if dayOfWeek == "*" { return "Every day at \(time)" }
        if dayOfWeek == "1-5" { return "Every weekday at \(time)" }
        return "Every \(dayOfWeek) at \(time)"
    }
    return "Custom schedule: \(expression)"
}

private func friendlyDate(_ value: String?) -> String {
    guard let value, let date = parseDate(value) else { return "Not scheduled" }
    let calendar = Calendar.current
    let time = date.formatted(date: .omitted, time: .shortened)
    if calendar.isDateInToday(date) { return "Today at \(time)" }
    if calendar.isDateInTomorrow(date) { return "Tomorrow at \(time)" }
    return date.formatted(.dateTime.month(.abbreviated).day().hour().minute())
}

private func formatLastRun(_ value: String?) -> String {
    guard let value else { return "Last: Not run" }
    return "Last: \(friendlyDate(value))"
}

private func parseDate(_ value: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: value) { return date }
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: value)
}
