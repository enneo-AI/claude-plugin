import { enneoApi } from "../api.js";
import { text } from "./index.js";
export const profileMe = {
    name: "enneo_profile_me",
    description: "Get the current user's profile (id, email, name, role). Useful for verifying the connection and identity after OAuth login.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
        const profile = await enneoApi("/profile");
        return text(profile);
    },
};
