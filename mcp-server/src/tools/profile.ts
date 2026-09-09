import { enneoApi } from "../api.js";
import { text, type Tool } from "./index.js";

export const profileMe: Tool = {
  name: "enneo_profile_me",
  description:
    "Get the current user's profile: `id`, `permissions`, the resolved `settings` object (skills, backlog tag restrictions, role, routing status) and the tickets they currently hold open. The response carries no email address. Useful for verifying the connection and identity.",
  inputSchema: { type: "object", properties: {} },
  handler: async () => {
    const profile = await enneoApi<Record<string, unknown>>("/profile");
    return text(profile);
  },
};
