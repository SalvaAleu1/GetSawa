import crypto from "crypto";
import { prisma } from "@/lib/prisma";

function cleanMessage(value: string) {
  return value.replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[redacted]").replace(/[\r\n\t]+/g, " ").slice(0, 500);
}

export async function recordApplicationError(error: unknown, context?: { route?: string; requestId?: string; metadata?: Record<string, unknown> }) {
  const name = error instanceof Error ? error.name || "Error" : "UnknownError";
  const rawMessage = error instanceof Error ? error.message : String(error ?? "Unknown application error");
  const message = cleanMessage(rawMessage || "Unknown application error");
  const fingerprint = crypto.createHash("sha256").update(`${name}:${message}`).digest("hex");
  try {
    await prisma.$executeRaw`
      INSERT INTO "application_error_events" ("id","fingerprint","error_name","message","route","request_id","metadata")
      VALUES (${crypto.randomUUID()},${fingerprint},${name},${message},${context?.route ?? null},${context?.requestId ?? null},${JSON.stringify(context?.metadata ?? {})}::jsonb)
    `;
  } catch (recordingError) {
    console.error("[observability] application error recording failed", recordingError);
  }
}

export async function recordScheduledJobRun(input: {
  cron: string;
  route: string;
  scheduledAt: Date;
  startedAt: Date;
  completedAt: Date;
  status: "SUCCEEDED" | "FAILED";
  httpStatus?: number | null;
  errorMessage?: string | null;
}) {
  const durationMs = Math.max(0, input.completedAt.getTime() - input.startedAt.getTime());
  await prisma.$executeRaw`
    INSERT INTO "scheduled_job_runs" ("id","cron","route","scheduled_at","started_at","completed_at","duration_ms","status","http_status","error_message")
    VALUES (${crypto.randomUUID()},${input.cron},${input.route},${input.scheduledAt},${input.startedAt},${input.completedAt},${durationMs},${input.status},${input.httpStatus ?? null},${input.errorMessage ? cleanMessage(input.errorMessage) : null})
  `;
}
