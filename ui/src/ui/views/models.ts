import { html, nothing } from "lit";

type ModelProviderConfig = {
  baseUrl: string;
  apiKey?: string;
  api?: string;
  models: Array<{
    id: string;
    name: string;
    reasoning?: boolean;
    input?: string[];
    cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
    contextWindow?: number;
    maxTokens?: number;
  }>;
};

export type ModelsProps = {
  connected: boolean;
  configLoading: boolean;
  configSaving: boolean;
  modelsValidating?: boolean;
  configSnapshot: { hash?: string | null; config?: Record<string, unknown> | null } | null;
  lastError: string | null;
  editingProviderId: string | null;
  onReload: () => void;
  onAddProvider: (params: {
    providerId: string;
    modelId: string;
    modelName: string;
    baseUrl: string;
    apiKey: string;
    setAsDefault: boolean;
  }) => Promise<boolean | void>;
  onUpdateProvider: (
    providerId: string,
    params: {
      modelId: string;
      modelName: string;
      baseUrl: string;
      apiKey: string;
      setAsDefault: boolean;
    },
  ) => Promise<boolean | void>;
  onDeleteProvider: (providerId: string) => Promise<boolean | void>;
  onSetDefaultModel: (providerId: string, modelId: string) => Promise<boolean | void>;
  onStartEditProvider: (providerId: string) => void;
  onCancelEditProvider: () => void;
};

function getProviders(config: Record<string, unknown> | null): Record<string, ModelProviderConfig> {
  if (!config || typeof config !== "object") {
    return {};
  }
  const models = config.models as Record<string, unknown> | undefined;
  const providers = models?.providers;
  if (!providers || typeof providers !== "object") {
    return {};
  }
  return providers as Record<string, ModelProviderConfig>;
}

function getDefaultModelRef(config: Record<string, unknown> | null): string | null {
  if (!config || typeof config !== "object") {
    return null;
  }
  const agents = config.agents as Record<string, unknown> | undefined;
  const defaults = agents?.defaults as Record<string, unknown> | undefined;
  const model = defaults?.model as Record<string, unknown> | undefined;
  const primary = model?.primary;
  return typeof primary === "string" && primary.trim() ? primary.trim() : null;
}

export function renderModels(props: ModelsProps) {
  const config = props.configSnapshot?.config ?? null;
  const providers = getProviders(config);
  const defaultModelRef = getDefaultModelRef(config);
  const providerEntries = Object.entries(providers).filter(
    (p): p is [string, ModelProviderConfig] =>
      p[1] != null && typeof p[1] === "object" && Array.isArray(p[1].models),
  );

  return html`
    <div class="models-view">
      <div class="models-actions">
        <button
          class="btn btn--secondary"
          ?disabled=${!props.connected || props.configLoading}
          @click=${() => props.onReload()}
        >
          ${props.configLoading ? "Loading..." : "Reload"}
        </button>
      </div>

      ${
        props.lastError
          ? html`<div class="models-error" role="alert">${props.lastError}</div>`
          : nothing
      }

      <div class="models-section">
        <h3 class="models-section-title">Configured providers</h3>
        ${
          providerEntries.length === 0
            ? html`
                <p class="muted">No custom model providers yet. Add one below.</p>
              `
            : html`
              <ul class="models-list">
                ${providerEntries.map(([providerId, provider]) => {
                  const isEditing = props.editingProviderId === providerId;
                  const firstModel = provider.models[0];
                  return html`
                    <li class="models-list-item">
                      <div class="models-list-item__header">
                        <span class="mono">${providerId}</span>
                        <span class="muted">${provider.baseUrl}</span>
                        ${
                          !isEditing
                            ? html`
                              <div class="models-list-item__actions">
                                <button
                                  class="btn btn--sm btn--secondary"
                                  ?disabled=${!props.connected || props.configSaving || props.modelsValidating}
                                  @click=${() => props.onStartEditProvider(providerId)}
                                >
                                  Edit
                                </button>
                                <button
                                  class="btn btn--sm btn--secondary"
                                  ?disabled=${!props.connected || props.configSaving || props.modelsValidating}
                                  @click=${async () => {
                                    if (confirm(`Remove provider "${providerId}"?`)) {
                                      await props.onDeleteProvider(providerId);
                                    }
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            `
                            : nothing
                        }
                      </div>
                      ${
                        !isEditing
                          ? html`
                            <div class="models-list-item__models">
                              ${provider.models.map((m) => {
                                const modelRef = `${providerId}/${m.id}`;
                                const isDefault = defaultModelRef === modelRef;
                                return html`
                                    <span class="pill mono models-list-item__model">
                                      ${m.id}
                                      ${
                                        isDefault
                                          ? html`
                                              <span class="pill pill--ok" style="margin-left: 4px">Default</span>
                                            `
                                          : html`
                                            <button
                                              class="btn btn--sm btn--secondary models-set-default"
                                              ?disabled=${!props.connected || props.configSaving || props.modelsValidating}
                                              @click=${() =>
                                                props.onSetDefaultModel(providerId, m.id)}
                                              title="Set as default model"
                                            >
                                              Set default
                                            </button>
                                          `
                                      }
                                    </span>
                                  `;
                              })}
                            </div>
                          `
                          : nothing
                      }
                      ${
                        isEditing
                          ? html`
                            <form
                              class="form-grid models-edit-form"
                              @submit=${async (e: Event) => {
                                e.preventDefault();
                                const form = e.target as HTMLFormElement;
                                const modelId = (
                                  form.querySelector('[name="editModelId"]') as HTMLInputElement
                                )?.value?.trim();
                                const modelName = (
                                  form.querySelector('[name="editModelName"]') as HTMLInputElement
                                )?.value?.trim();
                                const baseUrl = (
                                  form.querySelector('[name="editBaseUrl"]') as HTMLInputElement
                                )?.value?.trim();
                                const apiKey =
                                  (
                                    form.querySelector('[name="editApiKey"]') as HTMLInputElement
                                  )?.value?.trim() ?? "";
                                const setAsDefault =
                                  (
                                    form.querySelector(
                                      '[name="editSetAsDefault"]',
                                    ) as HTMLInputElement
                                  )?.checked ?? false;
                                if (!modelId || !baseUrl) {
                                  return;
                                }
                                await props.onUpdateProvider(providerId, {
                                  modelId,
                                  modelName: modelName || modelId,
                                  baseUrl,
                                  apiKey,
                                  setAsDefault,
                                });
                              }}
                            >
                              <label class="field">
                                <span>Model ID</span>
                                <input
                                  name="editModelId"
                                  type="text"
                                  value=${firstModel?.id ?? ""}
                                  required
                                  ?disabled=${!props.connected || props.configSaving || props.modelsValidating}
                                />
                              </label>
                              <label class="field">
                                <span>Model name (display)</span>
                                <input
                                  name="editModelName"
                                  type="text"
                                  value=${firstModel?.name ?? firstModel?.id ?? ""}
                                  ?disabled=${!props.connected || props.configSaving || props.modelsValidating}
                                />
                              </label>
                              <label class="field">
                                <span>Base URL</span>
                                <input
                                  name="editBaseUrl"
                                  type="url"
                                  value=${provider.baseUrl ?? ""}
                                  required
                                  ?disabled=${!props.connected || props.configSaving || props.modelsValidating}
                                />
                              </label>
                              <label class="field">
                                <span>API Key (optional)</span>
                                <input
                                  name="editApiKey"
                                  type="text"
                                  value=${provider.apiKey ?? ""}
                                  ?disabled=${!props.connected || props.configSaving || props.modelsValidating}
                                  autocomplete="off"
                                />
                              </label>
                              <label class="field checkbox">
                                <input
                                  name="editSetAsDefault"
                                  type="checkbox"
                                  ?disabled=${!props.connected || props.configSaving || props.modelsValidating}
                                />
                                <span>Set as default model</span>
                              </label>
                              <div class="field models-edit-buttons">
                                <button
                                  type="submit"
                                  class="btn"
                                  ?disabled=${!props.connected || props.configSaving || props.modelsValidating}
                                >
                                  ${props.modelsValidating ? "Validating..." : props.configSaving ? "Saving..." : "Save"}
                                </button>
                                <button
                                  type="button"
                                  class="btn btn--secondary"
                                  ?disabled=${props.configSaving}
                                  @click=${() => props.onCancelEditProvider()}
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          `
                          : nothing
                      }
                    </li>
                  `;
                })}
              </ul>
            `
        }
      </div>

      <div class="models-section">
        <h3 class="models-section-title">Add model provider</h3>
        <p class="muted" style="margin-bottom: 12px">
          Add a custom OpenAI-compatible model (e.g. GLM-5). Config is saved to
          ~/.openclaw/openclaw.json and loaded on next visit.
        </p>
        <form
          class="form-grid"
          @submit=${async (e: Event) => {
            e.preventDefault();
            const form = e.target as HTMLFormElement;
            const providerId = (
              form.querySelector('[name="providerId"]') as HTMLInputElement
            )?.value?.trim();
            const modelId = (
              form.querySelector('[name="modelId"]') as HTMLInputElement
            )?.value?.trim();
            const modelName = (
              form.querySelector('[name="modelName"]') as HTMLInputElement
            )?.value?.trim();
            const baseUrl = (
              form.querySelector('[name="baseUrl"]') as HTMLInputElement
            )?.value?.trim();
            const apiKey =
              (form.querySelector('[name="apiKey"]') as HTMLInputElement)?.value?.trim() ?? "";
            const setAsDefault =
              (form.querySelector('[name="setAsDefault"]') as HTMLInputElement)?.checked ?? false;
            if (!providerId || !modelId || !baseUrl) {
              return;
            }
            await props.onAddProvider({
              providerId,
              modelId,
              modelName: modelName || modelId,
              baseUrl,
              apiKey,
              setAsDefault,
            });
          }}
        >
          <label class="field">
            <span>Provider ID</span>
            <input
              name="providerId"
              type="text"
              placeholder="glm5"
              required
              ?disabled=${!props.connected || props.configSaving || props.modelsValidating}
            />
            <span class="field-hint">e.g. glm5, zhipu. Used as models.providers.{'{'}id{'}'}.</span>
          </label>
          <label class="field">
            <span>Model ID</span>
            <input
              name="modelId"
              type="text"
              placeholder="glm-5"
              required
              ?disabled=${!props.connected || props.configSaving || props.modelsValidating}
            />
            <span class="field-hint">API model name, e.g. glm-5</span>
          </label>
          <label class="field">
            <span>Model name (display)</span>
            <input
              name="modelName"
              type="text"
              placeholder="GLM-5"
              ?disabled=${!props.connected || props.configSaving || props.modelsValidating}
            />
            <span class="field-hint">Optional. Falls back to Model ID.</span>
          </label>
          <label class="field">
            <span>Base URL</span>
            <input
              name="baseUrl"
              type="url"
              placeholder="https://open.bigmodel.cn/api/paas/v4"
              required
              ?disabled=${!props.connected || props.configSaving || props.modelsValidating}
            />
            <span class="field-hint">OpenAI-compatible chat completions endpoint base</span>
          </label>
          <label class="field">
            <span>API Key (optional)</span>
            <input
              name="apiKey"
              type="password"
              placeholder="\${ZHIPU_API_KEY}"
              ?disabled=${!props.connected || props.configSaving || props.modelsValidating}
              autocomplete="off"
            />
            <span class="field-hint">Raw key or \${ENV_VAR} for env var</span>
          </label>
          <label class="field checkbox">
            <input name="setAsDefault" type="checkbox" ?disabled=${!props.connected || props.configSaving || props.modelsValidating} />
            <span>Set as default model</span>
          </label>
          <div class="field">
            <button
              type="submit"
              class="btn"
              ?disabled=${!props.connected || props.configSaving || props.modelsValidating}
            >
              ${props.modelsValidating ? "Validating..." : props.configSaving ? "Saving..." : "Add provider"}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}
