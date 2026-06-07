import { ApplicantStatus } from "@prisma/client";

export const STATUS_LABELS: Record<ApplicantStatus, string> = {
  APPLIED: "Applied",
  INTERVIEW_SCHEDULED: "Interview Scheduled",
  INTERVIEWED: "Interviewed",
  SELECTED: "Selected",
  WAITLISTED: "Waitlisted",
  REJECTED: "Rejected",
};

export const STATUS_COLORS: Record<ApplicantStatus, { bg: string; text: string }> = {
  APPLIED: { bg: "bg-[#1c2a3a]", text: "text-[#7dd3fc]" },
  INTERVIEW_SCHEDULED: { bg: "bg-[#2a1a3a]", text: "text-[#c4b9ff]" },
  INTERVIEWED: { bg: "bg-[#2a1a3a]", text: "text-[#c4b9ff]" },
  SELECTED: { bg: "bg-[#0a2a18]", text: "text-[#34d399]" },
  WAITLISTED: { bg: "bg-[#2a2a18]", text: "text-[#fde68a]" },
  REJECTED: { bg: "bg-[#3a1818]", text: "text-[#fca5a5]" },
};

export const COLLEGE_COLORS: Record<string, { bg: string; text: string }> = {
  MIT: { bg: "bg-[#3b2f7a]", text: "text-[#c4b9ff]" },
  MSCE: { bg: "bg-[#0a2a1e]", text: "text-[#34d399]" },
  MIC: { bg: "bg-[#2a1a2a]", text: "text-[#f9a8d4]" },
  MSHA: { bg: "bg-[#1a2a0a]", text: "text-[#86efac]" },
};

export const CHART_COLORS = [
  "#7c6af7", "#22c55e", "#f59e0b", "#ef4444",
  "#3b82f6", "#14b8a6", "#ec4899", "#8b5cf6", "#06b6d4",
];

export const AVATAR_COLORS = [
  "#7c6af7", "#22c55e", "#f59e0b", "#3b82f6",
  "#14b8a6", "#ec4899", "#f97316",
];

export const DEPARTMENTS = [
  "Photography",
  "Videography",
  "Art & Graphics",
  "Writing",
  "Business Development and Public Relations",
  "Web and App Development",
  "Human Resources",
  "Editorial",
] as const;

export function getInitials(name: string): string {
  const parts = name.trim().split(" ");
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

export function getAvatarColor(id: string): string {
  const hash = id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function shortRoleName(title: string): string {
  return title
    .replace("Head of ", "")
    .replace("Subhead of ", "Sub: ")
    .replace("Editor-in-Chief", "EIC")
    .replace("Managing Editor", "ME")
    .replace("Business Development and Public Relations", "BDPR")
    .replace("Web and App Development", "Web & App Dev")
    .substring(0, 22);
}
