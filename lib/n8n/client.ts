type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type PostJsonOptions = {
  url: string;
  token?: string;
  body: JsonValue;
  timeoutMs?: number;
  retries?: number;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRIES = 1;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WebhookError extends Error {
  public readonly status: number;
  public readonly responseBody: string;

  constructor(message: string, status: number, responseBody: string) {
    super(message);
    this.name = "WebhookError";
    this.status = status;
    this.responseBody = responseBody;
  }
}

export async function postWebhookJson<T>(
  options: PostJsonOptions,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(options.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        },
        body: JSON.stringify(options.body),
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        throw new WebhookError(
          `webhook request failed with status ${response.status}`,
          response.status,
          text,
        );
      }

      return JSON.parse(text) as T;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(250 * (attempt + 1));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("unknown webhook invocation error");
}
