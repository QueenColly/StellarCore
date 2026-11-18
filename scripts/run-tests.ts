import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function collectTestFiles(targetPath: string): string[] {
  const results: string[] = [];
  if (!existsSync(targetPath)) {
    return [targetPath];
  }
  const stat = statSync(targetPath);
  if (!stat.isDirectory()) {
    return [targetPath];
  }
  const entries = readdirSync(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(targetPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTestFiles(fullPath));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".test.ts") ||
        entry.name.endsWith(".test.js") ||
        entry.name.endsWith(".test.mjs") ||
        entry.name.endsWith(".spec.ts") ||
        entry.name.endsWith(".spec.js"))
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

function main() {
  const rawArgs = process.argv.slice(2);
  const flags: string[] = [];
  const targets: string[] = [];

  for (const arg of rawArgs) {
    if (arg.startsWith("-")) {
      flags.push(arg);
    } else {
      targets.push(arg);
    }
  }

  let testFiles: string[] = [];
  if (targets.length === 0) {
    testFiles = collectTestFiles("tests");
  } else {
    for (const target of targets) {
      testFiles.push(...collectTestFiles(target));
    }
  }

  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--test", ...flags, ...testFiles],
    {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV ?? "test" },
    },
  );

  process.exit(result.status ?? (result.signal ? 1 : 0));
}

main();
