import type { ConfigState } from "./config.ts";
import { patchConfig } from "./config.ts";

export type AddProviderParams = {
  providerId: string;
  modelId: string;
  modelName: string;
  baseUrl: string;
  apiKey: string;
  setAsDefault: boolean;
};

async function validateProvider(
  state: ConfigState,
  params: { baseUrl: string; modelId: string; apiKey: string },
): Promise<string | null> {
  if (!state.client || !state.connected) {
    return "Not connected";
  }
  try {
    await state.client.request("models.validate", {
      baseUrl: params.baseUrl.trim(),
      modelId: params.modelId.trim(),
      apiKey: params.apiKey.trim() || undefined,
    });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function addModelsProvider(
  state: ConfigState,
  params: AddProviderParams,
): Promise<boolean> {
  const { providerId, modelId, modelName, baseUrl, apiKey, setAsDefault } = params;
  const trimmedId = providerId.trim();
  const trimmedModelId = modelId.trim();
  const trimmedBaseUrl = baseUrl.trim();
  if (!trimmedId || !trimmedModelId || !trimmedBaseUrl) {
    return false;
  }

  state.configSaving = true;
  state.modelsValidating = true;
  state.lastError = null;

  const validateError = await validateProvider(state, {
    baseUrl: trimmedBaseUrl,
    modelId: trimmedModelId,
    apiKey: apiKey.trim(),
  });
  if (validateError) {
    state.configSaving = false;
    state.modelsValidating = false;
    state.lastError = validateError;
    return false;
  }

  state.modelsValidating = false;

  const providerConfig: Record<string, unknown> = {
    baseUrl: trimmedBaseUrl,
    api: "openai-completions",
    models: [
      {
        id: trimmedModelId,
        name: (modelName || trimmedModelId).trim(),
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
      },
    ],
  };
  if (apiKey.trim()) {
    providerConfig.apiKey = apiKey.trim();
  }

  const patch: Record<string, unknown> = {
    models: {
      mode: "merge",
      providers: {
        [trimmedId]: providerConfig,
      },
    },
  };

  if (setAsDefault) {
    patch.agents = {
      defaults: {
        model: { primary: `${trimmedId}/${trimmedModelId}` },
      },
    };
  }

  return patchConfig(state, patch);
}

export async function updateModelsProvider(
  state: ConfigState,
  providerId: string,
  params: Omit<AddProviderParams, "providerId">,
): Promise<boolean> {
  const { modelId, modelName, baseUrl, apiKey, setAsDefault } = params;
  const trimmedModelId = modelId.trim();
  const trimmedBaseUrl = baseUrl.trim();
  const trimmedProviderId = providerId.trim();
  if (!trimmedProviderId || !trimmedModelId || !trimmedBaseUrl) {
    return false;
  }

  state.configSaving = true;
  state.modelsValidating = true;
  state.lastError = null;

  const validateError = await validateProvider(state, {
    baseUrl: trimmedBaseUrl,
    modelId: trimmedModelId,
    apiKey: apiKey.trim(),
  });
  if (validateError) {
    state.configSaving = false;
    state.modelsValidating = false;
    state.lastError = validateError;
    return false;
  }

  state.modelsValidating = false;

  const providerConfig: Record<string, unknown> = {
    baseUrl: trimmedBaseUrl,
    api: "openai-completions",
    models: [
      {
        id: trimmedModelId,
        name: (modelName || trimmedModelId).trim(),
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
      },
    ],
  };
  if (apiKey.trim()) {
    providerConfig.apiKey = apiKey.trim();
  }

  const patch: Record<string, unknown> = {
    models: {
      mode: "merge",
      providers: {
        [trimmedProviderId]: providerConfig,
      },
    },
  };

  if (setAsDefault) {
    patch.agents = {
      defaults: {
        model: { primary: `${trimmedProviderId}/${trimmedModelId}` },
      },
    };
  }

  return patchConfig(state, patch);
}

export async function setDefaultModelProvider(
  state: ConfigState,
  providerId: string,
  modelId: string,
): Promise<boolean> {
  const trimmedId = providerId.trim();
  const trimmedModelId = modelId.trim();
  if (!trimmedId || !trimmedModelId) {
    return false;
  }
  const patch: Record<string, unknown> = {
    agents: {
      defaults: {
        model: { primary: `${trimmedId}/${trimmedModelId}` },
      },
    },
  };
  return patchConfig(state, patch);
}

export async function deleteModelsProvider(
  state: ConfigState,
  providerId: string,
): Promise<boolean> {
  const trimmedId = providerId.trim();
  if (!trimmedId) {
    return false;
  }
  const patch: Record<string, unknown> = {
    models: {
      mode: "merge",
      providers: {
        [trimmedId]: null,
      },
    },
  };
  return patchConfig(state, patch);
}
