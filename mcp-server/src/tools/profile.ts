import { enneoApi } from "../api.js";
import { text, type Tool } from "./index.js";

export const profileMe: Tool = {
  name: "enneo_profile_me",
  description:
    "Get the current user's profile (id, email, name, role). Useful for verifying the connection and identity after OAuth login.",
  inputSchema: { type: "object", properties: {} },
  handler: async () => {
    const profile = await enneoApi<Record<string, unknown>>("/profile");
    return text(profile);
  },
};
