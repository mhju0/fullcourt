import { readFileSync, lstatSync } from "node:fs";
import { parseOfficiatingSnapshot } from "../src/lib/officiating-publication";
import { parseCurrentShooting } from "../src/lib/player-rest-publication";
import { parseCurrentShotQualityArtifact } from "../src/lib/shot-quality-publication";

const [name, path] = process.argv.slice(2);
if (!path || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink() || lstatSync(path).size > 8 * 1024 * 1024) throw new Error("Invalid publication file");
const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
const parsed = name === "officiating" ? parseOfficiatingSnapshot(raw)
  : name === "shooting" ? parseCurrentShooting(raw)
    : name === "shotQuality" ? parseCurrentShotQualityArtifact(raw) : null;
if (!parsed) throw new Error("Invalid publication evidence");
const value = parsed as unknown as { generated?: string; generatedAt?: string; season?: { season: string } | string; publication?: { season?: string }; source?: { lastGameDate?: string } };
const generated = value.generatedAt ?? value.generated;
if (!generated || !Number.isFinite(Date.parse(generated)) || Date.parse(generated) > Date.now() + 300_000) throw new Error("Invalid generation instant");
const season = typeof value.season === "string" ? value.season : value.season?.season ?? value.publication?.season;
if (!season || !/^20\d{2}-\d{2}$/.test(season)) throw new Error("Invalid publication season");
console.log(JSON.stringify({ generatedAt: generated, season }));
