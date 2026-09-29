import fs from "node:fs";

const domain = (process.argv[2] || "cloudsawa.com").trim().toLowerCase();
const expected = "cloudsawa.com";

if (domain !== expected) {
  throw new Error(`CloudSawa launch is configured for ${expected}; refusing to activate ${domain}.`);
}
if (process.env.CONFIRM_CLOUDSAWA_DOMAIN_OWNED !== expected) {
  throw new Error(
    `Domain activation is blocked. After ${expected} has actually been purchased and added to the Cloudflare account, run with CONFIRM_CLOUDSAWA_DOMAIN_OWNED=${expected}.`,
  );
}

const file = "wrangler.jsonc";
const wrangler = JSON.parse(fs.readFileSync(file, "utf8"));

wrangler.name = "cloudsawa";
wrangler.workers_dev = false;
wrangler.routes = [{ pattern: expected, custom_domain: true }];
wrangler.triggers = { crons: ["* * * * *"] };
wrangler.vars = {
  ...(wrangler.vars || {}),
  APP_ENV: "production",
  APP_NAME: "CloudSawa",
  APP_URL: `https://${expected}`,
  WEBSITE_PLATFORM_HOST: expected,
  CLOUDFLARE_WORKER_SERVICE_NAME: "cloudsawa",
};

fs.writeFileSync(file, JSON.stringify(wrangler, null, 2) + "\n");

console.log(`Prepared CloudSawa for final cutover to https://${expected}.`);
console.log("APP_URL and WEBSITE_PLATFORM_HOST were switched to cloudsawa.com. Next: run npm run ops:cutover-config, deploy, then complete the controlled live purchase.");
