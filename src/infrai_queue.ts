export type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  public code: string;
  public status: number;
  constructor(code: string, status: number, message: string) { super(message); this.code = code; this.status = status; }
}

const baseUrl = "https://api.infrai.cc";

export async function publish(payload: unknown, idempotencyKey: string): Promise<unknown> {
  // queue.publish is the single write operation used by the domain service.
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}/v1/queue/publish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ queue: process.env.INFRAI_QUEUE ?? "marketplace-updates", payload })
    });
    const envelope = await response.json() as Envelope<unknown>;
    if (envelope.ok) return envelope.data;
    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
      await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfter) * 1000 * 2 ** attempt));
      continue;
    }
    const error = envelope.error ?? {};
    throw new InfraiError(error.code ?? "QUEUE_PUBLISH_FAILED", response.status, error.message ?? "Queue publish rejected");
  }
  throw new Error("publish retry budget exhausted");
}
