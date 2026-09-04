import { getCurrentUser } from "@/lib/auth";
import { jsonOk } from "@/lib/api";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonOk({ user: null });
  return jsonOk({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isAdmin: Boolean(user.adminRole),
      adminRole: user.adminRole,
    },
  });
}
