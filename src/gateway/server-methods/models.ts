import type { GatewayRequestHandlers } from "./types.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateModelsListParams,
  validateModelsValidateParams,
} from "../protocol/index.js";
import { validateModelProvider } from "./models-validate.js";

export const modelsHandlers: GatewayRequestHandlers = {
  "models.validate": async ({ params, respond }) => {
    if (!validateModelsValidateParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid models.validate params: ${formatValidationErrors(validateModelsValidateParams.errors)}`,
        ),
      );
      return;
    }
    const { baseUrl, modelId, apiKey } = params;
    const result = await validateModelProvider({ baseUrl, modelId, apiKey });
    if (result.ok) {
      respond(true, result, undefined);
    } else {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, result.error));
    }
  },
  "models.list": async ({ params, respond, context }) => {
    if (!validateModelsListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid models.list params: ${formatValidationErrors(validateModelsListParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const models = await context.loadGatewayModelCatalog();
      respond(true, { models }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
