import { loadEnv, saveEnv, normalizeInstance } from "../storage.js";
import { text, type Tool } from "./index.js";

export const configure: Tool = {
  name: "enneo_configure",
  description:
    "Configure the active Enneo instance. Reuses the profile API key saved in ~/.enneo/env for this instance. Switching instances clears the saved key; enter the matching key locally in that file before making API calls.",
  inputSchema: {
    type: "object",
    properties: {
      instance: {
        type: "string",
        description: "Enneo instance hostname, e.g. `demo.enneo.ai` or `customer.enneo.ai`.",
      },
      reset: {
        type: "boolean",
        description: "If true, clear the locally saved API key. This does not revoke the key in Enneo.",
        default: false,
      },
    },
    required: ["instance"],
  },
  handler: async (args) => {
    if (typeof args.instance !== "string") throw new Error("An instance hostname is required.");
    const instance = normalizeInstance(args.instance);
    const current = await loadEnv();
    let sameInstance = false;
    try {
      sameInstance = !!current.instance && normalizeInstance(current.instance) === instance;
    } catch {
      // An invalid saved hostname must not retain its key.
    }
    const token = !args.reset && sameInstance ? current.access_token : undefined;
    await saveEnv({ instance, access_token: token });
    const note = token
      ? "Saved API key retained."
      : "No API key saved. Open Profile Settings → Login → API keys and enter a matching key locally as ENNEO_TOKEN in ~/.enneo/env. Do not paste the key into chat.";
    return text(
      `Configured instance: ${instance}. ${note}\nCredentials: ~/.enneo/env (mode 600).`,
    );
  },
};
