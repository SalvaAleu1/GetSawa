const implemented = {
  domains: ["namesilo"],
  payments: ["paypal"],
  hosting: ["whm"],
  email: ["opensrs"],
  security: ["cloudflare"],
  publishing: ["cloudflare"],
  ai: ["anthropic"],
};

const selections = {
  domains: [process.env.DOMAIN_PROVIDER || "namesilo", process.env.DOMAIN_SECONDARY_PROVIDER],
  payments: [process.env.PAYMENT_PROVIDER || "paypal", process.env.PAYMENT_SECONDARY_PROVIDER],
  hosting: [process.env.HOSTING_PROVIDER || "whm", process.env.HOSTING_SECONDARY_PROVIDER],
  email: [process.env.EMAIL_PROVIDER || "opensrs", process.env.EMAIL_SECONDARY_PROVIDER],
  security: [process.env.SECURITY_PROVIDER || "cloudflare", process.env.SECURITY_SECONDARY_PROVIDER],
  publishing: [process.env.PUBLISHING_PROVIDER || "cloudflare", process.env.PUBLISHING_SECONDARY_PROVIDER],
  ai: [process.env.AI_PROVIDER || "anthropic", process.env.AI_SECONDARY_PROVIDER],
};

const failures = [];
for (const [capability, [rawPrimary, rawSecondary]] of Object.entries(selections)) {
  const primary = String(rawPrimary).trim().toLowerCase();
  const secondary = rawSecondary ? String(rawSecondary).trim().toLowerCase() : "";
  if (!implemented[capability].includes(primary)) failures.push(`${capability}: primary provider ${primary} has no implemented adapter.`);
  if (secondary && !implemented[capability].includes(secondary)) failures.push(`${capability}: secondary provider ${secondary} has no implemented adapter.`);
  if (secondary && secondary === primary) failures.push(`${capability}: primary and secondary providers are identical.`);
}

const automaticCapabilities = new Set(
  (process.env.PROVIDER_AUTOMATIC_FAILOVER_CAPABILITIES || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);
const expandedAutomaticCapabilities = automaticCapabilities.has("*") ? Object.keys(selections) : [...automaticCapabilities];
for (const capability of expandedAutomaticCapabilities) {
  if (!selections[capability]) {
    failures.push(`Unknown automatic-failover capability: ${capability}`);
    continue;
  }
  const [rawPrimary, rawSecondary] = selections[capability];
  const primary = String(rawPrimary).trim().toLowerCase();
  const secondary = rawSecondary ? String(rawSecondary).trim().toLowerCase() : "";
  if (!secondary || secondary === primary) failures.push(`${capability}: automatic failover requires a distinct secondary provider.`);
  if (!implemented[capability].includes(primary) || !implemented[capability].includes(secondary)) failures.push(`${capability}: automatic failover requires two implemented adapters.`);
}
if (expandedAutomaticCapabilities.length > 0 && !process.env.PROVIDER_FAILOVER_APPROVAL_ID?.trim()) {
  failures.push("PROVIDER_FAILOVER_APPROVAL_ID is required when automatic failover is requested.");
}

const currencies = (process.env.GETSAWA_SUPPORTED_CURRENCIES || "USD").split(",").map((v) => v.trim().toUpperCase()).filter(Boolean);
const locales = (process.env.GETSAWA_SUPPORTED_LOCALES || "en").split(",").map((v) => v.trim()).filter(Boolean);
if (!currencies.includes("USD")) failures.push("USD must remain supported until a reviewed base-currency migration is completed.");
if (!locales.includes("en")) failures.push("English (en) must remain supported while it is the canonical legal/product language.");
for (const currency of currencies) if (!/^[A-Z]{3}$/.test(currency)) failures.push(`Invalid ISO-style currency code: ${currency}`);
for (const locale of locales) if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)) failures.push(`Invalid locale tag: ${locale}`);

if (failures.length) {
  console.error("GETSAWA PROVIDER RESILIENCE: BLOCKED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("GETSAWA PROVIDER RESILIENCE: SAFE CONFIGURATION");
console.log("No unimplemented provider or unsafe automatic failover is selected.");
