import fs from "node:fs";

const wrangler = JSON.parse(fs.readFileSync("wrangler.jsonc", "utf8"));
const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
const workerSource = fs.readFileSync("cloudflare-worker.ts", "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(wrangler.name === "cloudsawa", "Wrangler Worker name must be cloudsawa.");
assert(wrangler.vars?.APP_NAME === "CloudSawa", "APP_NAME must be CloudSawa.");
assert(wrangler.vars?.CLOUDFLARE_WORKER_SERVICE_NAME === "cloudsawa", "Worker service variable must be cloudsawa.");

const staging = wrangler.env?.staging;
assert(staging, "wrangler.jsonc must retain a pre-domain staging environment.");
assert(staging.name === "cloudsawa-staging", "Staging Worker name must be cloudsawa-staging.");
assert(staging.workers_dev === true, "Staging must remain on workers.dev.");
assert((staging.routes || []).length === 0, "Staging must not bind a custom domain before launch.");
assert((staging.triggers?.crons || []).length === 0, "Staging must not schedule production jobs.");

const jobs = [...workerSource.matchAll(/\{\s*schedule:\s*"([^"]+)"\s*,\s*route:\s*"([^"]+)"/g)]
  .map((match) => ({ schedule: match[1], route: match[2] }));
assert(jobs.length === 12, `Expected 12 CloudSawa internal scheduled jobs, found ${jobs.length}.`);

const vercelCrons = vercel.crons || [];
for (const entry of vercelCrons) {
  assert(
    jobs.some((job) => job.schedule === entry.schedule && job.route === entry.path),
    `Legacy Vercel cron has no CloudSawa Worker equivalent: ${entry.schedule}|${entry.path}`,
  );
}

const routes = wrangler.routes || [];
const crons = wrangler.triggers?.crons || [];
const ownsApex = routes.some((route) => route?.pattern === "cloudsawa.com" && route?.custom_domain === true);

if (!routes.length) {
  assert(wrangler.workers_dev === true, "Pre-domain CloudSawa must keep workers.dev enabled.");
  assert(wrangler.vars?.APP_ENV === "preview", "Pre-domain APP_ENV must be preview.");
  assert(crons.length === 0, "Pre-domain preview must not run production scheduled jobs.");
  console.log("CloudSawa pre-domain configuration valid: workers.dev enabled, custom domain absent, production scheduler disabled.");
} else {
  assert(ownsApex, "Production cutover must bind cloudsawa.com as the Cloudflare Worker custom domain.");
  assert(wrangler.workers_dev === false, "Production cutover must disable workers.dev.");
  assert(wrangler.vars?.APP_ENV === "production", "Production cutover APP_ENV must be production.");
  assert(crons.length === 1 && crons[0] === "* * * * *", "Production must use one minute-level Cloudflare trigger; the Worker dispatches all 12 jobs internally.");
  console.log("CloudSawa production cutover configuration valid: cloudsawa.com bound and the consolidated scheduler enabled.");
}
