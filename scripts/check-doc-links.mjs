// Check local Markdown and HTML image targets in tracked documentation.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0");
let failures = 0;
for (const file of new Set(files.filter(file => file.endsWith(".md") && existsSync(file)))) {
  const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
  const matches = [...text.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)|<img\b[^>]*\bsrc="([^"]+)"/g)];
  for (const match of matches) {
    const target = match[1] ?? match[2];
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(target)) continue;
    const pathname = decodeURIComponent(target.split(/[?#]/)[0]);
    if (!pathname) continue;
    const resolved = path.resolve(target.startsWith("/") ? root : path.dirname(file), pathname.replace(/^\//, ""));
    if (!existsSync(resolved)) { console.error(`${file}: missing ${target}`); failures++; }
  }
}
if (failures) process.exitCode = 1;
else console.log("Local documentation targets resolve.");
