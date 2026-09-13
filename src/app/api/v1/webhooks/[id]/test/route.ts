import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { getIdempotentResult, storeIdempotentResult, testDeveloperWebhook, withDeveloperApi } from "@/lib/developer-platform";

type Context = { params: Promise<{ id: string }> };
export async function POST(req: NextRequest, { params }: Context) {
  const { id } = await params;
  return withDeveloperApi(req, "webhooks:manage", "/api/v1/webhooks/:id/test", async ({ client }) => {
    const key = req.headers.get("idempotency-key")?.trim();
    if (!key) return jsonError("Idempotency-Key header is required for webhook test delivery.", 400);
    const operation = `webhook.test:${id}`;
    const payload = { subscriptionId: id };
    const idem = await getIdempotentResult(client.id, operation, key, payload);
    if (idem.prior) return jsonOk(idem.prior.data, idem.prior.statusCode);
    const result = await testDeveloperWebhook(client.userId, id);
    const data = { data: result };
    await storeIdempotentResult(client.id, operation, key, idem.hash, 200, data);
    return jsonOk(data);
  });
}
