import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require = createRequire(join(root, "package.json"));
const runtimeRoots = ["app", "components", "config", "lib"];
const runtimeExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css"]);
const failures = [];

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const runtimeFiles = runtimeRoots.flatMap((directory) => walk(join(root, directory)));

for (const file of runtimeFiles) {
  if (!runtimeExtensions.has(extname(file))) continue;
  const source = readFileSync(file, "utf8");
  const name = relative(root, file).replaceAll("\\", "/");

  if (/\bdebugger\b|console\.(?:log|debug)\s*\(/.test(source)) {
    failures.push(`${name}: development debugging statement`);
  }

  for (const match of source.matchAll(/(?:from\s+|import\s*\()\s*["']([^"'./][^"']*)["']/g)) {
    if (match[1].startsWith("@/")) continue;
    const packageName = match[1].startsWith("@")
      ? match[1].split("/").slice(0, 2).join("/")
      : match[1].split("/")[0];
    if (packageName === "server-only") continue;
    try {
      require.resolve(packageName);
    } catch {
      failures.push(`${name}: unresolved package import ${packageName}`);
    }
  }

  for (const match of source.matchAll(/(?:src|href)=["'](\/[^"'?#]+\.[a-z0-9]+)["']/gi)) {
    const publicPath = join(root, "public", match[1].slice(1));
    if (!existsSync(publicPath)) failures.push(`${name}: missing public asset ${match[1]}`);
  }
}

const css = readFileSync(join(root, "app/globals.css"), "utf8");
for (const legacyClass of [
  "catalogue-theme-networking",
  "catalogue-theme-energy",
  "catalogue-theme-medical",
  "catalogue-theme-others",
  "catalogue-card-networking",
  "catalogue-category-switch-networking",
]) {
  if (css.includes(legacyClass)) failures.push(`app/globals.css: obsolete fixed category style ${legacyClass}`);
}

for (const starterAsset of ["file.svg", "globe.svg", "next.svg", "vercel.svg", "window.svg"]) {
  if (existsSync(join(root, "public", starterAsset))) {
    failures.push(`public/${starterAsset}: unused create-next-app asset`);
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Production code audit passed across ${runtimeFiles.length} runtime files.`);
