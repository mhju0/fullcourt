import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const googleApiKey = /^AIza[0-9A-Za-z_-]{35}$/;

function hasGoogleApiKey(url) {
  try {
    return [...new URL(url).searchParams.values()].some((value) => googleApiKey.test(value));
  } catch {
    return false;
  }
}

function metadataUrls(value) {
  if (typeof value === "string") return /^https?:\/\//.test(value) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(metadataUrls);
  if (value && typeof value === "object") return Object.values(value).flatMap(metadataUrls);
  return [];
}

test("Google API key detection covers encoded query values without exposing the value", () => {
  const synthetic = "AIza" + "A".repeat(35);
  assert.equal(hasGoogleApiKey(`https://example.test/embed?key=${synthetic}`), true);
  assert.equal(hasGoogleApiKey(`https://example.test/embed?key=${encodeURIComponent(synthetic).replace("A", "%41")}`), true);
  assert.equal(hasGoogleApiKey("https://example.test/embed?key=[REDACTED_PUBLIC_EMBED_KEY]"), false);
  assert.equal(hasGoogleApiKey("https://example.test/maps?q=arena"), false);
});

test("tracked extracted source metadata URLs do not publish Google API keys", () => {
  const tracked = execFileSync("git", ["ls-files", "-z", "docs/research/"], { cwd: root, encoding: "utf8" })
    .split("\0").filter((filename) => /(?:^|\/)sources?\.json$/.test(filename));
  assert.ok(tracked.length > 0, "tracked source metadata inventory must not be empty");
  const violations = [];
  for (const filename of tracked) {
    const metadata = JSON.parse(readFileSync(path.join(root, filename), "utf8"));
    if (metadataUrls(metadata).some(hasGoogleApiKey)) violations.push(filename);
  }
  assert.equal(violations.length, 0, `Google API key in extracted metadata: ${violations.join(", ")}`);
});
