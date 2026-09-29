export async function readJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("application/json")) {
    await response.text().catch(() => "");
    const status = response.status ? ` (HTTP ${response.status})` : "";
    throw new Error(`${fallbackMessage}${status}. The server returned an unexpected response.`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(`${fallbackMessage}. The server returned invalid JSON.`);
  }

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : `${fallbackMessage} (HTTP ${response.status}).`;
    throw new Error(message);
  }

  return data as T;
}
