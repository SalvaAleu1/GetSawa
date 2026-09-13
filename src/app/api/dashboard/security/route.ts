import { requireUser } from "@/lib/auth";
import { jsonOk, handleError } from "@/lib/api";
import { getCustomerSecurityServices, reconcileSecurityZone } from "@/lib/security-service";
import { getSecurityOperationalState } from "@/lib/security-readiness";

export const dynamic = "force-dynamic";

type SecurityServiceIdentity = { service_instance_id?: unknown };

export async function GET() {
  try {
    const user = await requireUser();
    const provider = await getSecurityOperationalState();
    let services = await getCustomerSecurityServices(user.id);

    if (provider.verified) {
      for (const service of services) {
        const rawId = (service as SecurityServiceIdentity).service_instance_id;
        const id = typeof rawId === "string" ? rawId : "";
        if (id) await reconcileSecurityZone(user.id, id).catch(() => undefined);
      }
      services = await getCustomerSecurityServices(user.id);
    }

    return jsonOk({ provider, services });
  } catch (error) {
    return handleError(error);
  }
}
