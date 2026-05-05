import SwiftUI

struct AutomationsView: View {
    @EnvironmentObject private var model: AppModel

    private var active: [AutomationJob] {
        model.automationJobs.filter { $0.enabled && $0.nextRunAt != nil && $0.lastStatus != "error" }
    }

    private var inactive: [AutomationJob] {
        model.automationJobs.filter { !$0.enabled || $0.nextRunAt == nil }
    }

    private var errored: [AutomationJob] {
        model.automationJobs.filter { $0.lastStatus == "error" }
    }

    var body: some View {
        List {
            automationSection("Active", jobs: active)
            automationSection("Errored", jobs: errored)
            automationSection("Inactive", jobs: inactive)

            if !model.automationRuns.isEmpty {
                Section("Latest runs") {
                    ForEach(model.automationRuns.prefix(8)) { run in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(run.automationName)
                                Spacer()
                                Text(run.status)
                                    .foregroundStyle(run.status == "error" ? .red : .secondary)
                            }
                            Text(relativeDate(run.startedAt))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Automations")
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

    @ViewBuilder
    private func automationSection(_ title: String, jobs: [AutomationJob]) -> some View {
        Section("\(title) \(jobs.count)") {
            if jobs.isEmpty {
                Text("No \(title.lowercased()) automations.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(jobs) { job in
                    AutomationRow(job: job)
                }
            }
        }
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
                Spacer()
                Text(job.enabled ? "on" : "off")
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(job.enabled ? Color.green.opacity(0.15) : Color.gray.opacity(0.15), in: Capsule())
            }
            Text(readableSchedule(job))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            DisclosureGroup("Prompt") {
                Text(job.prompt)
                    .font(.body)
                    .textSelection(.enabled)
                    .padding(.vertical, 4)
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
            }
        }
        .padding(.vertical, 6)
    }

    private func readableSchedule(_ job: AutomationJob) -> String {
        if let nextRunAt = job.nextRunAt {
            return "Next \(relativeDate(nextRunAt))"
        }
        if job.schedule.type == "at", let at = job.schedule.at {
            return "Once at \(relativeDate(at))"
        }
        if let expression = job.schedule.expression {
            return "Cron \(expression)" + (job.schedule.timezone.map { " · \($0)" } ?? "")
        }
        return "No schedule"
    }
}
