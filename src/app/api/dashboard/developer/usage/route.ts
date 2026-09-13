import { requireUser } from "@/lib/auth";
import { getDeveloperUsage } from "@/lib/developer-platform";
import { jsonOk, handleError } from "@/lib/api";
export const dynamic="force-dynamic";
export async function GET(){try{const user=await requireUser();return jsonOk(await getDeveloperUsage(user.id));}catch(error){return handleError(error);}}
