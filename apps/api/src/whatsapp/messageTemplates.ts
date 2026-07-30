import { env } from "../config/env";

// Every formatter here produces a plain string meant to be relayed verbatim by the assistant
// (see agent.ts's "display" field convention) and only then passed through chunkForWhatsapp. A
// bare "•" is used for list items rather than "- ", since the assistant's markdown-bullet ban
// only applies to markdown list syntax, not a literal glyph.

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: env.DEFAULT_TIMEZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: env.DEFAULT_TIMEZONE,
  hour: "numeric",
  minute: "2-digit",
});

function formatDateTime(date: Date): string {
  return `${dateFormatter.format(date)}, ${timeFormatter.format(date)}`;
}

export function formatAssignmentList(
  assignments: { title: string; pointsPossible: number | null; deadline: Date }[],
): string {
  if (assignments.length === 0) {
    return "📚 *Open assignments*\n\nNothing open right now — you're all caught up.";
  }

  const lines = assignments.map((a) => {
    const points = a.pointsPossible !== null ? `${a.pointsPossible} pts — ` : "";
    return `• *${a.title}* — ${points}due ${formatDateTime(a.deadline)}`;
  });

  return [
    "📚 *Open assignments*",
    "",
    ...lines,
    "",
    `${assignments.length} assignment${assignments.length === 1 ? "" : "s"} remaining.`,
  ].join("\n");
}

export function formatPlanProposal(
  assignmentTitle: string,
  tasks: { title: string; description: string; estimatedMinutes: number }[],
): string {
  const lines = tasks.map(
    (t, i) => `${i + 1}. *${t.title}* (${t.estimatedMinutes} min) — ${t.description}`,
  );

  return [
    `🗓️ *Proposed plan — "${assignmentTitle}"*`,
    "",
    ...lines,
    "",
    "Want me to schedule these? Reply yes to confirm, or tell me what to change.",
  ].join("\n");
}

export function formatScheduleConfirmation(
  scheduled: { title: string; start: Date }[],
  unscheduledCount: number,
): string {
  if (scheduled.length === 0) {
    return [
      "⚠️ *Couldn't schedule*",
      "",
      "None of the sessions fit in that window — want me to try a wider one?",
    ].join("\n");
  }

  const lines = scheduled.map((s) => `• *${s.title}* — ${formatDateTime(s.start)}`);
  const parts = ["✅ *Schedule created*", "", ...lines];

  if (unscheduledCount > 0) {
    parts.push(
      "",
      `${unscheduledCount} session${unscheduledCount === 1 ? "" : "s"} didn't fit in this window — want me to widen it?`,
    );
  }

  return parts.join("\n");
}

export function formatCancelConfirmation(hadPlan: boolean, cancelledEventCount: number): string {
  if (!hadPlan) {
    return "There's no active plan to cancel.";
  }

  const eventsLine =
    cancelledEventCount > 0
      ? `Cleared the current plan and removed ${cancelledEventCount} calendar event${cancelledEventCount === 1 ? "" : "s"}.`
      : "Cleared the current plan.";

  return ["🗑️ *Plan cancelled*", "", eventsLine].join("\n");
}

export function formatUpdateConfirmation(title: string, changedFields: string[]): string {
  const summary = changedFields.length > 0 ? changedFields.join(" and ") : "the session";
  return ["🔄 *Session updated*", "", `*${title}* — updated ${summary}.`].join("\n");
}

export function formatShiftConfirmation(shiftedCount: number): string {
  if (shiftedCount === 0) {
    return "Nothing to shift — no upcoming scheduled sessions matched.";
  }
  return [
    "🔄 *Schedule updated*",
    "",
    `Moved ${shiftedCount} session${shiftedCount === 1 ? "" : "s"}. Nothing else changed.`,
  ].join("\n");
}

export function formatStatusReport(
  scopeLabel: string,
  scheduled: { title: string; start: Date }[],
  completedCount: number,
  pendingCount: number,
  proposedCount = 0,
): string {
  const lines =
    scheduled.length > 0
      ? scheduled.map((s) => `• *${s.title}* — ${formatDateTime(s.start)}`)
      : ["Nothing scheduled."];

  const summaryLines = [`Completed: ${completedCount}`, `Pending (not yet scheduled): ${pendingCount}`];
  if (proposedCount > 0) {
    summaryLines.push(`Awaiting your confirmation: ${proposedCount}`);
  }

  return [`📈 *Status — ${scopeLabel}*`, "", ...lines, "", ...summaryLines].join("\n");
}

export function formatGrades(
  grades: {
    courseName: string;
    currentScore: number | null;
    currentGrade: string | null;
  }[],
): string {
  if (grades.length === 0) {
    return "📊 *Grades*\n\nNo active courses with grades yet.";
  }

  const lines = grades.map((g) => {
    const label =
      g.currentGrade ?? (g.currentScore !== null ? `${g.currentScore}%` : "no grade yet");
    return `• *${g.courseName}* — ${label}`;
  });

  const numericScores = grades
    .map((g) => g.currentScore)
    .filter((score): score is number => score !== null);
  const averageLine =
    numericScores.length > 0
      ? [
          "",
          `Average: ${(numericScores.reduce((sum, s) => sum + s, 0) / numericScores.length).toFixed(1)}%`,
        ]
      : [];

  return ["📊 *Grades*", "", ...lines, ...averageLine].join("\n");
}

export function formatError(message: string): string {
  return `⚠️ ${message}`;
}
