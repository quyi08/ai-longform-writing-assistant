import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicTopLevelEntries = [
  ".env.example",
  ".gitignore",
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "next-env.d.ts",
  "docker-compose.yml",
  "src",
  "public",
  "assets",
  "db",
  "scripts",
  "data",
  "docs/public",
];

export function shouldExcludeFromPublicRelease(candidatePath) {
  const normalized = candidatePath.replaceAll("\\", "/").replace(/^\.\//, "");
  const base = normalized.split("/").at(-1) ?? "";

  return (
    normalized === ".env.local"
    || (base.startsWith(".env") && base !== ".env.example")
    || normalized.startsWith(".git/")
    || normalized.startsWith(".next/")
    || normalized.startsWith("node_modules/")
    || normalized.startsWith("tmp/")
    || normalized.startsWith("deliverables/")
    || normalized.startsWith("docs/superpowers/")
    || normalized.startsWith("docs/rag-evals/")
    || normalized === "docs/继续开发上下文总结.md"
    || /\.test\.[cm]?[jt]sx?$/.test(base)
    || normalized.startsWith("scripts/build_")
    || normalized.startsWith("scripts/rewrite-")
    || normalized === "scripts/export-public-release.test.mjs"
  );
}

export function sanitizeEvaluationSeed(source) {
  const genericPolicy = "function fullCaseCount() {\n  return 20;\n}";
  const sanitized = source.replace(
    /function fullCaseCount\([^)]*\)\s*\{[\s\S]*?\n\}/,
    genericPolicy,
  );

  if (sanitized === source) {
    throw new Error("Could not locate the evaluation seed policy for public sanitization.");
  }
  return sanitized;
}

async function exists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyEntry(sourceRoot, targetRoot, entry) {
  const source = path.join(sourceRoot, entry);
  if (!(await exists(source))) return;
  const target = path.join(targetRoot, entry);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, {
    recursive: true,
    filter: (candidate) => {
      const relative = path.relative(sourceRoot, candidate);
      return relative === "" || !shouldExcludeFromPublicRelease(relative);
    },
  });
}

export async function exportPublicRelease({ sourceRoot = root, targetRoot }) {
  if (!targetRoot) throw new Error("targetRoot is required.");
  if (await exists(targetRoot)) {
    throw new Error(`Target already exists: ${targetRoot}. Choose an empty directory.`);
  }

  await mkdir(targetRoot, { recursive: true });
  for (const entry of publicTopLevelEntries) {
    await copyEntry(sourceRoot, targetRoot, entry);
  }

  const seedPath = path.join(targetRoot, "src", "lib", "evaluation-seed.ts");
  if (await exists(seedPath)) {
    const source = await readFile(seedPath, "utf8");
    await writeFile(seedPath, sanitizeEvaluationSeed(source), "utf8");
  }

  await writeFile(
    path.join(targetRoot, "PUBLIC_RELEASE_MANIFEST.md"),
    "# Public Release Manifest\n\nThis directory is a sanitized export for a public GitHub repository. It excludes local secrets, generated artifacts, internal planning documents, tests and title-specific evaluation configuration. Review the public release checklist before initializing Git.\n",
    "utf8",
  );
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  const targetRoot = path.resolve(process.argv[2] ?? path.join(root, "github-public"));
  exportPublicRelease({ targetRoot })
    .then(() => console.log(`Public release prepared at ${targetRoot}`))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
