import type { Model } from "@mariozechner/pi-ai";
/**
 * Validates an OpenAI-compatible model provider by sending a minimal
 * chat completions probe. Used before saving provider config.
 */
import { completeSimple } from "@mariozechner/pi-ai";
import { MissingEnvVarError, resolveConfigEnvVars } from "../../config/env-substitution.js";

const VALIDATE_TIMEOUT_MS = 15_000;

function resolveApiKey(raw: string | undefined): string {
  if (!raw || !raw.trim()) {
    return "";
  }
  const trimmed = raw.trim();
  if (!trimmed.includes("$")) {
    return trimmed;
  }
  try {
    const resolved = resolveConfigEnvVars({ apiKey: trimmed }, process.env) as {
      apiKey?: string;
    };
    return typeof resolved?.apiKey === "string" ? resolved.apiKey : "";
  } catch (err) {
    if (err instanceof MissingEnvVarError) {
      throw new Error(`Missing env var "${err.varName}" in API key`, { cause: err });
    }
    throw err;
  }
}

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/\/+$/, "");
}

export type ValidateModelParams = {
  baseUrl: string;
  modelId: string;
  apiKey?: string;
};

export type ValidateModelResult = { ok: true } | { ok: false; error: string };

export async function validateModelProvider(
  params: ValidateModelParams,
): Promise<ValidateModelResult> {
  const baseUrl = normalizeBaseUrl(params.baseUrl);
  const modelId = (params.modelId ?? "").trim();
  if (!baseUrl || !modelId) {
    return { ok: false, error: "baseUrl and modelId are required" };
  }

  let apiKey = "";
  try {
    apiKey = resolveApiKey(params.apiKey);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const model: Model<"openai-completions"> = {
    id: modelId,
    name: modelId,
    api: "openai-completions",
    provider: "_validate",
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 64,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);

  try {
    await completeSimple(
      model,
      {
        messages: [
          {
            role: "user",
            content: "Reply with OK.",
            timestamp: Date.now(),
          },
        ],
      },
      {
        apiKey: apiKey || undefined,
        maxTokens: 16,
        temperature: 0,
        signal: controller.signal,
      },
    );
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Normalize common errors for user display
    if (message.includes("401") || message.toLowerCase().includes("unauthorized")) {
      return { ok: false, error: "Invalid API key or unauthorized" };
    }
    if (message.includes("404") || message.toLowerCase().includes("not found")) {
      return { ok: false, error: "Model or endpoint not found" };
    }
    if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
      return { ok: false, error: "Cannot connect to base URL" };
    }
    if (message.includes("abort") || message.includes("timeout")) {
      return { ok: false, error: "Connection timed out" };
    }
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}
