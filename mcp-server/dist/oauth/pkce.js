import { randomBytes, createHash } from "node:crypto";
function base64url(buf) {
    return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function generatePkce() {
    const verifier = base64url(randomBytes(32)); // RFC 7636: 43-128 chars
    const challenge = base64url(createHash("sha256").update(verifier).digest());
    return { verifier, challenge };
}
export function generateState() {
    return base64url(randomBytes(16));
}
