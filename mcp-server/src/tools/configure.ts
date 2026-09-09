import { loadEnv, updateEnv, clearTokens } from "../storage.js";
import { text, type Tool } from "./index.js";

export const configure: Tool = {
  name: "enneo_configure",
  description:
    "Configure the Enneo instance this plugin connects to. Run this before any other tool on first use, or when switching environments.",
  inputSchema: {
    type: "object",
    properties: {
      instance: {
        type: "string",
        description: "Enneo instance hostname, e.g. `demo.enneo.ai` or `customer.enneo.ai`.",
      },
      reset: {
        type: "boolean",
        description: "If true, also clear any cached tokens for this instance.",
        default: false,
      },
    },
    required: ["instance"],
  },
  handler: async (args) => {
    const instance = String(args.instance).replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!/^[a-z0-9.-]+$/i.test(instance)) {
      throw new Error(`Invalid instance hostname: ${instance}`);
    }
    const current = await loadEnv();
    const instanceChanged = current.instance && current.instance !== instance;
    if (args.reset || instanceChanged) {
      await clearTokens();
    }
    await updateEnv({ instance });
    const note = instanceChanged
      ? `Instance changed from ${current.instance} → ${instance}; cached tokens cleared.`
      : `Instance: ${instance}`;
    return text(
      `Configured. ${note}\nCredentials are stored at ~/.enneo/env (mode 600).\n\nSet ENNEO_TOKEN there to an existing API key from Profile Settings → Login → API keys.`,
    );
  },
};
