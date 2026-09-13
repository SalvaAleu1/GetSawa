// OpenNext generates this module during `npm run build:cloudflare`.
// @ts-ignore generated module does not exist before the Cloudflare build step
import handler from "./.open-next/worker.js";

type CronJob = {
  schedule: string;
  route: string;
  due(date: Date): boolean;
};

const CRON_JOBS: CronJob[] = [
  { schedule: "17 * * * *", route: "/api/cron/domain-sync", due: (d) => d.getUTCMinutes() === 17 },
  { schedule: "37 * * * *", route: "/api/cron/domain-expiry", due: (d) => d.getUTCMinutes() === 37 },
  { schedule: "*/10 * * * *", route: "/api/cron/provisioning-recovery", due: (d) => d.getUTCMinutes() % 10 === 0 },
  { schedule: "13 * * * *", route: "/api/cron/billing-renewals", due: (d) => d.getUTCMinutes() === 13 },
  { schedule: "*/15 * * * *", route: "/api/cron/payment-reconciliation", due: (d) => d.getUTCMinutes() % 15 === 0 },
  { schedule: "23 6 * * *", route: "/api/cron/renewal-reminders", due: (d) => d.getUTCHours() === 6 && d.getUTCMinutes() === 23 },
  { schedule: "*/5 * * * *", route: "/api/cron/auction-close", due: (d) => d.getUTCMinutes() % 5 === 0 },
  { schedule: "7 */6 * * *", route: "/api/cron/pricing-sync", due: (d) => d.getUTCMinutes() === 7 && d.getUTCHours() % 6 === 0 },
  { schedule: "*/6 * * * *", route: "/api/cron/message-delivery", due: (d) => d.getUTCMinutes() % 6 === 0 },
  { schedule: "9,39 * * * *", route: "/api/cron/developer-webhooks", due: (d) => d.getUTCMinutes() === 9 || d.getUTCMinutes() === 39 },
  { schedule: "41 3 * * *", route: "/api/cron/security-maintenance", due: (d) => d.getUTCHours() === 3 && d.getUTCMinutes() === 41 },
  { schedule: "31 2 * * *", route: "/api/cron/analytics-snapshot", due: (d) => d.getUTCHours() === 2 && d.getUTCMinutes() === 31 },
];

type WorkerEnv = {
  CRON_SECRET?: string;
  APP_ENV?: string;
};

type WorkerContext = { waitUntil(promise: Promise<unknown>): void };

async function runScheduledJob(job: CronJob, scheduledAt: Date, env: WorkerEnv, ctx: WorkerContext) {
  if (!env.CRON_SECRET) throw new Error("CRON_SECRET is not configured for the Cloudflare Worker.");

  const startedAt = new Date();
  let status: "SUCCEEDED" | "FAILED" = "SUCCEEDED";
  let httpStatus: number | null = null;
  let errorMessage: string | null = null;

  try {
    const response = await handler.fetch(
      new Request(new URL(job.route, "https://getsawa.internal"), {
        method: "GET",
        headers: {
          authorization: `Bearer ${env.CRON_SECRET}`,
          "x-getsawa-cron": job.schedule,
        },
      }),
      env,
      ctx,
    );

    httpStatus = response.status;
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      status = "FAILED";
      errorMessage = `HTTP ${response.status}${body ? `: ${body.slice(0, 500)}` : ""}`;
      throw new Error(`[cron] ${job.route} failed with ${errorMessage}`);
    }

    console.log(`[cron] ${job.route} completed for ${scheduledAt.toISOString()}`);
  } catch (error) {
    status = "FAILED";
    errorMessage = error instanceof Error ? error.message.slice(0, 500) : "Scheduled job failed.";
    throw error;
  } finally {
    try {
      await handler.fetch(
        new Request(new URL("/api/internal/observability/job-run", "https://getsawa.internal"), {
          method: "POST",
          headers: {
            authorization: `Bearer ${env.CRON_SECRET}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            cron: job.schedule,
            route: job.route,
            scheduledAt: scheduledAt.toISOString(),
            startedAt: startedAt.toISOString(),
            completedAt: new Date().toISOString(),
            status,
            httpStatus,
            errorMessage,
          }),
        }),
        env,
        ctx,
      );
    } catch (observabilityError) {
      console.error("[observability] failed to persist scheduled job outcome", observabilityError);
    }
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: WorkerContext) {
    const response = await handler.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("x-getsawa-runtime", "cloudflare-worker");
    headers.set("x-getsawa-environment", env.APP_ENV || "unknown");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },

  async scheduled(event: { cron: string; scheduledTime: number }, env: WorkerEnv, ctx: WorkerContext) {
    if (!env.CRON_SECRET) throw new Error("CRON_SECRET is not configured for the Cloudflare Worker.");

    const scheduledAt = new Date(event.scheduledTime);
    const dueJobs = CRON_JOBS.filter((job) => job.due(scheduledAt));
    if (dueJobs.length === 0) return;

    const batch = Promise.allSettled(dueJobs.map((job) => runScheduledJob(job, scheduledAt, env, ctx))).then((results) => {
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length > 0) {
        throw new Error(`${failures.length} of ${results.length} scheduled GetSawa jobs failed.`);
      }
    });

    ctx.waitUntil(batch);
    await batch;
  },
};
