import fs from "node:fs";

const wrangler = JSON.parse(fs.readFileSync("wrangler.jsonc", "utf8"));
const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
const workerSource = fs.readFileSync("cloudflare-worker.ts", "utf8");

const production = wrangler?.env?.production;
if (!production) throw new Error("wrangler.jsonc is missing env.production.");

const productionRoutes = production.routes || [];
const ownsApex = productionRoutes.some((route) => route?.pattern === "getsawa.app" && route?.custom_domain === true);
if (!ownsApex) throw new Error("Production Cloudflare environment does not declare getsawa.app as a Custom Domain.");
if (production.workers_dev !== false) throw new Error("Production workers.dev must be disabled at cutover.");

const cloudflareCrons = production?.triggers?.crons || [];
if (cloudflareCrons.length !== 12) throw new Error(`Expected 12 Cloudflare production crons, found ${cloudflareCrons.length}.`);
if (new Set(cloudflareCrons).size !== cloudflareCrons.length) throw new Error("Duplicate Cloudflare production cron expressions detected.");

const mappedCrons = [...workerSource.matchAll(/^\s*"([^"]+)":\s*"\/api\/cron\//gm)].map((match) => match[1]);
if (mappedCrons.length !== 12) throw new Error(`Expected 12 cron mappings in cloudflare-worker.ts, found ${mappedCrons.length}.`);
for (const cron of cloudflareCrons) {
  if (!mappedCrons.includes(cron)) throw new Error(`Cloudflare cron is not mapped by the Worker: ${cron}`);
}
for (const cron of mappedCrons) {
  if (!cloudflareCrons.includes(cron)) throw new Error(`Worker cron mapping is not scheduled in production: ${cron}`);
}

const vercelCrons = (vercel.crons || []).map((entry) => `${entry.schedule}|${entry.path}`);
const workerPairs = [...workerSource.matchAll(/^\s*"([^"]+)":\s*"(\/api\/cron\/[^"]+)"/gm)].map((match) => `${match[1]}|${match[2]}`);
for (const entry of vercelCrons) {
  if (!workerPairs.includes(entry)) throw new Error(`Vercel cron has no equivalent Cloudflare mapping: ${entry}`);
}

console.log(`Cutover configuration valid: ${vercelCrons.length} Vercel jobs are covered by ${cloudflareCrons.length} Cloudflare jobs.`);
console.log("Important: this validates configuration only. Disable the live Vercel scheduler before deploying Cloudflare production.");
