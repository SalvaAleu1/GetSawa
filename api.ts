import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { ProviderNotConfiguredError } from "@/lib/providers/domains/DomainProvider";
import { ZodError } from "zod";

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function jsonOk(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Wraps a route handler so every error path returns a clean, safe JSON
 * response instead of an unhandled 500 with a stack trace leaking to the
 * client.
 */
export function withApiErrors(handler: () => Promise<NextResponse>) {
  return async () => {
    try {
      return await handler();
    } catch (err) {
      return handleError(err);
    }
  };
}

export function handleError(err: unknown) {
  if (err instanceof AuthError) {
    return jsonError(err.message, err.status);
  }
  if (err instanceof ProviderNotConfiguredError) {
    return jsonError(err.message, 503, { code: "PROVIDER_NOT_CONFIGURED" });
  }
  if (err instanceof ZodError) {
    return jsonError("Invalid request.", 422, { issues: err.issues });
  }
  console.error(err);
  return jsonError("Something went wrong. Please try again.", 500);
}
