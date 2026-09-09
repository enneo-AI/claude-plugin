import { promises as fs } from "node:fs";
import { join } from "node:path";

// Swap the file after one read to catch mixed instance/key snapshots.
if (process.env.ENNEO_TEST_SWAP_ENV) {
  const readFile = fs.readFile.bind(fs);
  let swapped = false;
  fs.readFile = async (path, ...args) => {
    const result = await readFile(path, ...args);
    if (!swapped && path === join(process.env.HOME, ".enneo", "env")) {
      swapped = true;
      await fs.writeFile(path, process.env.ENNEO_TEST_SWAP_ENV, { mode: 0o600 });
    }
    return result;
  };
}

// No request reaches the network, including an unexpected discovery call.
globalThis.fetch = async (url, init) => {
  await fs.appendFile(process.env.ENNEO_TEST_FETCH_LOG, JSON.stringify({
    url: String(url),
    method: init?.method,
    authorization: new Headers(init?.headers).get("authorization"),
  }) + "\n");
  return new Response(JSON.stringify({ id: 42 }), {
    status: Number(process.env.ENNEO_TEST_API_STATUS || "200"),
    headers: { "Content-Type": "application/json" },
  });
};
