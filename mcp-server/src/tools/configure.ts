import { updateEnv, clearTokens } from "../storage.js";
import { text, type Tool } from "./index.js";

export const configure: Tool = {
  name: "enneo_configure",
  description:
    "Configure the Enneo instance this plugin connects to. Run this before any other tool on first use, or when switching environments. No token needed — the next tool call will open a browser for OAuth login.",
  inputSchema: {
    type: "object",
    properties: {
      instance: {
        type: "string",
        description: "Enneo instance hostname, e.g. `demo.enneo.ai` or `customer.enneo.ai`.",
      },
      reset: {
        type: "boolean",
        description: "If true, also clear any cached OAuth tokens for this instance.",
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
    if (args.reset) {
      await clearTokens();
    }
    await updateEnv({ instance });
    return text(
      `Configured. Instance: ${instance}\nCredentials will be stored at ~/.enneo/env (mode 600).\n\nThe next authenticated tool call will open a browser for OAuth login.`,
    );
  },
};
