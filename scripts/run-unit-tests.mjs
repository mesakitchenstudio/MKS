/**
 * Windows-safe unit test runner.
 * Avoids cmd.exe ~8191 char limit on the long `tsx --test …` file list.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = JSON.parse(
  readFileSync(path.join(root, "scripts", "unit-test-files.json"), "utf8"),
);

const result = spawnSync(
  process.execPath,
  [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "--test", ...files],
  {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  },
);

process.exit(result.status ?? 1);
