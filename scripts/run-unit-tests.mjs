import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const outputDirectory = resolve(projectRoot, ".tmp-tests");
const testDirectory = resolve(outputDirectory, "tests");
const serverOnlyStubDirectory = resolve(outputDirectory, "node_modules", "server-only");
const typescriptCli = resolve(projectRoot, "node_modules", "typescript", "bin", "tsc");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

function findTestFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        return findTestFiles(entryPath);
      }

      return entry.isFile() && entry.name.endsWith(".test.js") ? [entryPath] : [];
    })
    .sort();
}

let exitCode = 1;

try {
  rmSync(outputDirectory, { recursive: true, force: true });

  exitCode = run(process.execPath, [typescriptCli, "-p", "tsconfig.test.json"]);

  if (exitCode === 0) {
    mkdirSync(serverOnlyStubDirectory, { recursive: true });
    writeFileSync(resolve(serverOnlyStubDirectory, "package.json"), '{"name":"server-only","main":"index.js"}');
    writeFileSync(resolve(serverOnlyStubDirectory, "index.js"), 'module.exports = {};');

    const testFiles = findTestFiles(testDirectory);

    if (testFiles.length === 0) {
      throw new Error("Po kompilaci nebyly nalezeny žádné unit testy.");
    }

    exitCode = run(process.execPath, [
      "--test",
      "--test-concurrency=1",
      ...testFiles,
    ]);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}

process.exitCode = exitCode;
