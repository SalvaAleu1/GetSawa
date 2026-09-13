// OpenNext generates this module during `npm run build:cloudflare`.
// @ts-ignore generated module does not exist before the Cloudflare build step
import handler from "./.open-next/worker.js";

const CRON_ROUTES:Record<string,string>={
 "17 * * * *":"/api/cron/domain-sync",
 "37 * * * *":"/api/cron/domain-expiry",
 "*/10 * * * *":"/api/cron/provisioning-recovery",
 "13 * * * *":"/api/cron/billing-renewals",
 "*/15 * * * *":"/api/cron/payment-reconciliation",
 "23 6 * * *":"/api/cron/renewal-reminders",
 "*/5 * * * *":"/api/cron/auction-close",
 "7 */6 * * *":"/api/cron/pricing-sync",
 "*/6 * * * *":"/api/cron/message-delivery",
 "9,39 * * * *":"/api/cron/developer-webhooks",
 "41 3 * * *":"/api/cron/security-maintenance",
};
type WorkerEnv={CRON_SECRET?:string};
export default{fetch:handler.fetch,async scheduled(event:{cron:string;scheduledTime:number},env:WorkerEnv,ctx:{waitUntil(promise:Promise<unknown>):void}){const route=CRON_ROUTES[event.cron];if(!route){console.warn(`[cron] No GetSawa job is mapped to ${event.cron}`);return;}if(!env.CRON_SECRET)throw new Error("CRON_SECRET is not configured for the Cloudflare Worker.");const request=new Request(new URL(route,"https://getsawa.internal"),{method:"GET",headers:{authorization:`Bearer ${env.CRON_SECRET}`,"x-getsawa-cron":event.cron}});const job=(async()=>{const response=await handler.fetch(request,env,ctx);if(!response.ok){const body=await response.text().catch(()=>"");throw new Error(`[cron] ${route} failed with HTTP ${response.status}${body?`: ${body.slice(0,500)}`:""}`);}console.log(`[cron] ${route} completed at ${new Date(event.scheduledTime).toISOString()}`);})();ctx.waitUntil(job);await job;}};
