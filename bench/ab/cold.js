import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const coldChild = fileURLToPath(new URL("./cold-child.js", import.meta.url));
const benchDir = fileURLToPath(new URL(".", import.meta.url));

export function spawnColdMs(execPath, variant, root) {
  const result = spawnSync(execPath, [coldChild], {
    cwd: benchDir,
    env: {
      ...process.env,
      AB_VARIANT: variant,
      AB_ROOT: root || "",
    },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      result.stderr || result.stdout || `${variant} cold start failed`,
    );
  }
  const nanoseconds = Number(result.stdout.trim());
  if (!Number.isFinite(nanoseconds)) {
    throw new Error(`cold start returned ${JSON.stringify(result.stdout)}`);
  }
  return nanoseconds / 1e6;
}
