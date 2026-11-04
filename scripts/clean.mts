import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["dist", "coverage", ".tsbuildinfo"];

for (const target of targets) {
  await rm(path.join(root, target), { recursive: true, force: true });
}

console.log("cleaned:", targets.join(", "));
