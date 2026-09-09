import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverRoot = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(join(serverRoot, "../.mcp.json"), "utf8"));
const bundledEntry = manifest["enneo-claude"].args[0].replace("${CLAUDE_PLUGIN_ROOT}/", "");
assert.equal(bundledEntry, "mcp-server/bundle/index.js");
const key = (payload) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.test-signature`;
const env = (instance, token) => `export ENNEO_INSTANCE="${instance}"\nexport ENNEO_TOKEN="${token}"\n`;

async function fixture(t, savedEnv, options = {}) {
  const home = await mkdtemp(join(tmpdir(), "enneo-claude-auth-test-"));
  const envFile = join(home, ".enneo", "env");
  const log = join(home, "fetch.jsonl");
  await mkdir(join(home, ".enneo"), { mode: 0o700 });
  if (savedEnv !== undefined) await writeFile(envFile, savedEnv, { mode: 0o600 });
  const isolatedEntry = join(home, "plugin", bundledEntry);
  await mkdir(join(home, "plugin", "mcp-server", "bundle"), { recursive: true });
  await copyFile(join(serverRoot, "..", bundledEntry), isolatedEntry);
  await writeFile(join(home, "plugin", "package.json"), '{"type":"module"}');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", join(serverRoot, "test/fixtures/fake-fetch.mjs"), isolatedEntry],
    cwd: home,
    env: { HOME: home, USERPROFILE: home, ENNEO_TEST_FETCH_LOG: log, ...options },
    stderr: "pipe",
  });
  const client = new Client({ name: "auth-regression", version: "1.0.0" });
  t.after(async () => {
    await client.close();
    await rm(home, { recursive: true, force: true });
  });
  await client.connect(transport);
  return {
    home,
    client,
    call: (name, args = {}) => client.callTool({ name, arguments: args }),
    readEnv: () => readFile(envFile, "utf8"),
    writeEnv: (value) => writeFile(envFile, value, { mode: 0o600 }),
    mode: async () => (await stat(envFile)).mode & 0o777,
    calls: async () => {
      const data = await readFile(log, "utf8").catch((error) => {
        if (error.code === "ENOENT") return "";
        throw error;
      });
      return data.trim() ? data.trim().split("\n").map(JSON.parse) : [];
    },
  };
}

function errorText(result) {
  assert.equal(result.isError, true);
  return result.content.map((entry) => entry.text).join("\n");
}

test("distributed tools fail before network when the instance or key is missing", async (t) => {
  const f = await fixture(t);
  const names = (await f.client.listTools()).tools.map((tool) => tool.name);
  assert.deepEqual(names, ["enneo_configure", "enneo_profile_me", "enneo_ticket_get", "enneo_ticket_search"]);
  assert.match(errorText(await f.call("enneo_profile_me")), /enneo_configure/);
  await f.call("enneo_configure", { instance: "alpha.enneo.test" });
  const message = errorText(await f.call("enneo_profile_me"));
  assert.match(message, /Profile Settings → Login → API keys/);
  assert.match(message, /~\/.enneo\/env/);
  assert.deepEqual(await f.calls(), []);
  assert.equal(await f.mode(), 0o600);
});

for (const [label, token, metadata] of [
  ["known expiry", key({ userId: 42, exp: 4102444800 }), ""],
  ["no exp claim", key({ userId: 42 }), ""],
  ["unknown expiry and stale legacy metadata", key({ userId: 42, exp: "unknown" }), 'export ENNEO_TOKEN_EXPIRES_AT="1"\nexport ENNEO_REFRESH_TOKEN="unused-test-refresh"\n'],
]) {
  test(`reuses the saved key with ${label} on repeated calls`, async (t) => {
    const saved = env("alpha.enneo.test", token) + metadata;
    const f = await fixture(t, saved);
    for (let i = 0; i < 2; i++) assert.notEqual((await f.call("enneo_profile_me")).isError, true);
    assert.deepEqual(await f.calls(), Array(2).fill({
      url: "https://alpha.enneo.test/api/mind/profile",
      method: "GET",
      authorization: `Bearer ${token}`,
    }));
    assert.equal(await f.readEnv(), saved);
  });
}

test("401 returns the failure without discovery, renewal, retries or a credential write", async (t) => {
  const saved = env("alpha.enneo.test", key({ userId: 42 }));
  const f = await fixture(t, saved, { ENNEO_TEST_API_STATUS: "401" });
  assert.match(errorText(await f.call("enneo_profile_me")), /401/);
  assert.equal((await f.calls()).length, 1);
  assert.equal(await f.readEnv(), saved);
});

test("switch and reset clear credentials while same-origin configure retains the key", async (t) => {
  const alphaKey = key({ userId: 1 });
  const betaKey = key({ userId: 2 });
  const f = await fixture(t, env("alpha.enneo.test", alphaKey));
  await f.call("enneo_configure", { instance: "https://ALPHA.enneo.test/" });
  assert.notEqual((await f.call("enneo_profile_me")).isError, true);
  await f.call("enneo_configure", { instance: "beta.enneo.test" });
  assert.match(errorText(await f.call("enneo_profile_me")), /No API key/);
  assert.doesNotMatch(await f.readEnv(), /ENNEO_TOKEN/);
  await f.writeEnv(env("beta.enneo.test", betaKey));
  assert.notEqual((await f.call("enneo_profile_me")).isError, true);
  await f.call("enneo_configure", { instance: "beta.enneo.test", reset: true });
  assert.match(errorText(await f.call("enneo_profile_me")), /No API key/);
  await f.call("enneo_configure", { instance: "alpha.enneo.test" });
  assert.match(errorText(await f.call("enneo_profile_me")), /No API key/);
  assert.deepEqual((await f.calls()).map(({ url, authorization }) => [url, authorization]), [
    ["https://alpha.enneo.test/api/mind/profile", `Bearer ${alphaKey}`],
    ["https://beta.enneo.test/api/mind/profile", `Bearer ${betaKey}`],
  ]);
  assert.equal(await f.mode(), 0o600);
});

test("a concurrent config change cannot mix one instance with the other key", async (t) => {
  const alphaKey = key({ userId: 1 });
  const betaKey = key({ userId: 2 });
  const f = await fixture(t, env("alpha.enneo.test", alphaKey), {
    ENNEO_TEST_SWAP_ENV: env("beta.enneo.test", betaKey),
  });
  await f.call("enneo_profile_me");
  await f.call("enneo_profile_me");
  assert.deepEqual((await f.calls()).map(({ url, authorization }) => [url, authorization]), [
    ["https://alpha.enneo.test/api/mind/profile", `Bearer ${alphaKey}`],
    ["https://beta.enneo.test/api/mind/profile", `Bearer ${betaKey}`],
  ]);
});

test("configure recovers malformed and missing saved hosts without adopting their keys", async (t) => {
  const f = await fixture(t, env("alpha.enneo.test/path", key({ userId: 1 })));
  assert.match(errorText(await f.call("enneo_profile_me")), /Invalid instance hostname/);
  assert.notEqual((await f.call("enneo_configure", { instance: "alpha.enneo.test" })).isError, true);
  assert.match(errorText(await f.call("enneo_profile_me")), /No API key/);
  await f.writeEnv('export ENNEO_TOKEN="orphan-test-key"\n');
  await f.call("enneo_configure", { instance: "alpha.enneo.test" });
  assert.match(errorText(await f.call("enneo_profile_me")), /No API key/);
  assert.deepEqual(await f.calls(), []);
});

test("documented migration reuses only the selected origin's key without displaying it", async (t) => {
  const alphaKey = key({ userId: 1 });
  const f = await fixture(t);
  const cache = JSON.stringify({
    "https://demo.enneo.ai": { token: alphaKey },
    "https://beta.enneo.test": { token: key({ userId: 2 }) },
  });
  const cacheFile = join(f.home, ".enneo", "browser-tokens.json");
  await writeFile(cacheFile, cache, { mode: 0o600 });
  const skill = await readFile(join(serverRoot, "../skills/browser-jwt/SKILL.md"), "utf8");
  const script = skill.split("## Reuse a legacy browser cache")[1].split("```bash\n")[1].split("```")[0];
  const run = (source) => promisify(execFile)("/bin/bash", ["--noprofile", "--norc", "-c", source], {
    env: { PATH: process.env.PATH, HOME: f.home },
    cwd: serverRoot,
  });
  const { stdout, stderr } = await run(script);
  assert.equal(stdout, "");
  assert.equal(stderr, "");
  assert.notEqual((await f.call("enneo_profile_me")).isError, true);
  assert.deepEqual(await f.calls(), [{
    url: "https://demo.enneo.ai/api/mind/profile", method: "GET", authorization: `Bearer ${alphaKey}`,
  }]);
  assert.equal(await f.mode(), 0o600);
  assert.equal(await readFile(cacheFile, "utf8"), cache);
  const saved = await f.readEnv();
  const missing = await run(script.replace('ORIGIN="https://demo.enneo.ai"', 'ORIGIN="https://missing.enneo.test"'));
  assert.equal(missing.stdout, "");
  assert.match(missing.stderr, /No saved key for that origin/);
  assert.equal(await f.readEnv(), saved);
});
