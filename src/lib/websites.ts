import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/auth";

export async function getOwnedProjectOrThrow(projectId: string, userId: string) {
  const project = await prisma.websiteProject.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== userId) {
    throw new AuthError("Website project not found.", 404);
  }
  return project;
}
