import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { createDeveloperWebhook, DEVELOPER_WEBHOOK_EVENTS, listDeveloperWebhooks, withDeveloperApi } from "@/lib/developer-platform";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  url: z.string().url().max(2048),
  events: z.array(z.enum(DEVELOPER_WEBHOOK_EVENTS)).min(1).max(DEVELOPER_WEBHOOK_EVENTS.length),
});

export async function GET(req: NextRequest) {
  return withDeveloperApi(req, "webhooks:manage", "/api/v1/webhooks", async ({ client }) => jsonOk({ data: await listDeveloperWebhooks(client.userId) }));
}

export async function POST(req: NextRequest) {
  return withDeveloperApi(req, "webhooks:manage", "/api/v1/webhooks", async ({ client }) => {
    const current = await listDeveloperWebhooks(client.userId);
    if (current.subscriptions.filter((item) => item.is_active).length >= 10) return jsonError("A maximum of 10 active webhook subscriptions is allowed.", 409);
    const input = schema.parse(await req.json());
    const created = await createDeveloperWebhook({ userId: client.userId, name: input.name, url: input.url, events: input.events });
    return jsonOk({ data: created, warning: "Copy the signing secret now. It will not be shown again." }, 201);
  });
}
