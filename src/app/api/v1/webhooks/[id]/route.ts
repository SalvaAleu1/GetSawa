import { NextRequest } from "next/server";
import { jsonOk } from "@/lib/api";
import { deactivateDeveloperWebhook, withDeveloperApi } from "@/lib/developer-platform";

type Context = { params: Promise<{ id: string }> };
export async function DELETE(req: NextRequest, { params }: Context) {
  const { id } = await params;
  return withDeveloperApi(req, "webhooks:manage", "/api/v1/webhooks/:id", async ({ client }) => {
    await deactivateDeveloperWebhook(client.userId, id);
    return jsonOk({ success: true });
  });
}
