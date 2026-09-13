import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const evidencePath = process.env.LAUNCH_EVIDENCE_FILE || ".ops/launch-evidence.json";
const failures = [];
const requiredFiles = [
  "docs/PHASE26_VERIFICATION.md",
  "docs/PHASE27_VERIFICATION.md",
  "docs/PHASE28_VERIFICATION.md",
  "docs/PHASE29_VERIFICATION.md",
  "docs/PHASE30_VERIFICATION.md",
  "docs/PHASE31_VERIFICATION.md",
  "docs/operations/DISASTER_RECOVERY.md",
  "docs/operations/VERCEL_TO_CLOUDFLARE_CUTOVER.md",
  "docs/operations/PROVIDER_ACCEPTANCE.md",
  "docs/operations/PRODUCTION_MONITORING.md",
  "docs/operations/PROVIDER_RESILIENCE.md",
  "docs/operations/MARKET_EXPANSION.md",
  "docs/operations/PROVIDER_ONBOARDING_CHECKLIST.md",
  "src/lib/providers/provider-routing.ts",
  "src/app/support/page.tsx",
  "src/app/legal/terms/page.tsx",
  "src/app/legal/privacy/page.tsx",
  "src/app/legal/refund/page.tsx",
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) failures.push(`Missing repository launch artifact: ${file}`);
}

for (const file of ["src/app/legal/terms/page.tsx", "src/app/legal/privacy/page.tsx", "src/app/legal/refund/page.tsx"]) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  if (/operational draft|before public launch|should be reviewed by qualified legal counsel/i.test(text)) {
    failures.push(`Customer-facing legal page contains internal launch-review wording: ${file}`);
  }
}

const cutover = spawnSync(process.execPath, ["scripts/ops/check-cutover-config.mjs"], { encoding: "utf8" });
if (cutover.status !== 0) failures.push(`Cutover configuration check failed: ${(cutover.stderr || cutover.stdout || "unknown error").trim()}`);

const resilience = spawnSync(process.execPath, ["scripts/ops/check-provider-resilience.mjs"], { encoding: "utf8", env: process.env });
if (resilience.status !== 0) failures.push(`Provider resilience configuration check failed: ${(resilience.stderr || resilience.stdout || "unknown error").trim()}`);

if (!fs.existsSync(evidencePath)) {
  failures.push(`Launch evidence file is missing: ${evidencePath}. Copy docs/operations/LAUNCH_EVIDENCE.template.json to the ignored .ops directory and attach real evidence.`);
} else {
  let evidence;
  try {
    evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  } catch (error) {
    failures.push(`Launch evidence is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (evidence) {
    const release = evidence.release || {};
    for (const field of ["commit", "operator", "reviewer", "approvedAt"]) {
      if (typeof release[field] !== "string" || !release[field].trim()) failures.push(`release.${field} is required.`);
    }

    const requiredGates = [
      "phase26_runtime_quality",
      "phase27_restore_drill",
      "phase28_staging_cloudflare",
      "phase29_production_cutover",
      "database_migrations",
      "security_review",
      "legal_approval",
      "support_readiness",
      "monitoring_alerts",
      "operator_handover",
    ];
    for (const key of requiredGates) validateGate(evidence.gates?.[key], `gates.${key}`);

    const requiredProviders = ["namesilo", "paypal", "cloudflare", "smtp"];
    for (const key of requiredProviders) {
      const provider = evidence.providers?.[key];
      if (!provider || provider.enabled !== true) failures.push(`providers.${key} must be launch-enabled and verified.`);
      else validateGate(provider, `providers.${key}`);
    }

    for (const [key, provider] of Object.entries(evidence.providers || {})) {
      if (provider && provider.enabled === true) validateGate(provider, `providers.${key}`);
    }
  }
}

function validateGate(gate, label) {
  if (!gate || gate.passed !== true) failures.push(`${label}.passed must be true.`);
  if (!gate || typeof gate.evidence !== "string" || !gate.evidence.trim()) failures.push(`${label}.evidence must reference reviewed evidence.`);
}

if (failures.length) {
  console.error("GETSAWA LAUNCH STATUS: BLOCKED");
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("GETSAWA LAUNCH STATUS: APPROVED BY RECORDED EVIDENCE");
console.log(`Evidence file: ${path.resolve(evidencePath)}`);
