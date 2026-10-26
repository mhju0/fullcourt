"""Publish validated blobs with a fast-forward Git compare-and-swap, never to main."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import subprocess
import tempfile
from daily_publications import DATASETS, load_manifest, read_blob, merge_candidate, instant, entry_for

ROOT = Path(__file__).resolve().parents[1]
BRANCH = "data-publications"


def git(*args, cwd=None, check=True, binary=False):
    return subprocess.run(["git", *args], cwd=cwd or ROOT, check=check, capture_output=True, text=not binary)


def validate(name, path):
    result = subprocess.run(["node", str(ROOT / "node_modules/tsx/dist/cli.mjs"), str(ROOT / "scripts/validate_daily_dataset.ts"), name, str(path)], cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        raise ValueError(f"Invalid {name} evidence")
    return json.loads(result.stdout)


class ShootingHealthError(ValueError):
    pass


def require_shooting(stage, publication):
    try:
        path = stage / "candidate.json"
        if path.is_symlink() or path.stat().st_size > 32768:
            raise ShootingHealthError("shooting-candidate-invalid")
        change = json.loads(path.read_text()).get("datasets", {}).get("shooting")
        if not change:
            raise ShootingHealthError("shooting-candidate-missing")
        status = change.get("status")
        if status not in ("published", "unavailable"):
            raise ShootingHealthError("shooting-candidate-failed")
        manifest = load_manifest(publication / "manifest.json")
        check = manifest["checks"].get("shooting", {})
        if check != {"status": status, "checkedAt": change["checkedAt"]}:
            raise ShootingHealthError("shooting-check-mismatch")
        if status == "unavailable":
            season = change.get("season")
            if (not isinstance(season, str) or not re.fullmatch(r"20\d{2}-\d{2}", season)
                    or season != f"{int(season[:4])}-{str(int(season[:4]) + 1)[-2:]}"
                    or change.get("noRegularFinals") is not True
                    or type(change.get("expectedGames")) is not int or change["expectedGames"] != 0):
                raise ShootingHealthError("shooting-no-finals-evidence")
            entries = [manifest["datasets"].get("shooting")]
            historical = manifest.get("history", {}).get("shooting", {}).get(season)
            if historical:
                entries.append(historical)
            for entry in entries:
                if entry is None:
                    continue
                source = publication / entry["path"]
                body = read_blob(source)
                if len(body) != entry["bytes"] or hashlib.sha256(body).hexdigest() != entry["sha256"]:
                    raise ShootingHealthError("shooting-blob-mismatch")
                identity = validate("shooting", source)
                if entry.get("season") and entry["season"] != identity["season"]:
                    raise ShootingHealthError("shooting-identity-mismatch")
                evidence = json.loads(body)["publication"]
                if identity["season"] == season and (evidence["expectedGames"] > 0 or evidence["observedGames"] > 0):
                    raise ShootingHealthError("shooting-no-finals-regression")
            return
        source = stage / "shooting.json"
        body = read_blob(source)
        identity = validate("shooting", source)
        if identity != {"season": change.get("season"), "generatedAt": change.get("generatedAt")}:
            raise ShootingHealthError("shooting-identity-mismatch")
        entry = manifest["datasets"].get("shooting")
        if entry != entry_for("shooting", body, identity["generatedAt"], identity["season"]):
            raise ShootingHealthError("shooting-blob-mismatch")
        if read_blob(publication / entry["path"]) != body:
            raise ShootingHealthError("shooting-blob-mismatch")
    except ShootingHealthError:
        raise
    except Exception as error:
        raise ShootingHealthError("shooting-readback-invalid") from error


def verify_remote_shooting(stage):
    try:
        git("fetch", "--no-tags", "--depth=1", "origin", f"refs/heads/{BRANCH}")
        head = git("rev-parse", "FETCH_HEAD").stdout.strip()
        with tempfile.TemporaryDirectory(prefix="fullcourt-shooting-readback-") as directory:
            publication = Path(directory)
            (publication / "manifest.json").write_bytes(git("show", f"{head}:manifest.json", binary=True).stdout)
            manifest = load_manifest(publication / "manifest.json")
            entries = [manifest["datasets"].get("shooting")]
            change = json.loads((stage / "candidate.json").read_text()).get("datasets", {}).get("shooting", {})
            if change.get("status") == "unavailable":
                historical = manifest.get("history", {}).get("shooting", {}).get(change.get("season"))
                if historical:
                    entries.append(historical)
            for entry in entries:
                if entry is None:
                    continue
                path = publication / entry["path"]
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(git("show", f"{head}:{entry['path']}", binary=True).stdout)
            require_shooting(stage, publication)
        return head
    except ShootingHealthError:
        raise
    except Exception as error:
        raise ShootingHealthError("shooting-remote-readback-error") from error


def shooting_health(stage, publication=None, outcome=None):
    try:
        if publication is None:
            head = verify_remote_shooting(stage)
        else:
            require_shooting(stage, publication)
            head = "isolated-publication-root"
        if outcome == "cas-skipped":
            raise ShootingHealthError("shooting-cas-skipped")
        verdict = f"verified at {head}"
    except ShootingHealthError as error:
        verdict = str(error)
        raise
    finally:
        logging.info("Shooting publication health: %s", verdict)
        summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary:
            with open(summary, "a") as stream:
                stream.write(f"- Shooting publication health: {verdict}\n")


def continuity(name, before, after):
    if name == "officiating":
        old, new = before["season"], after["season"]
        key, old_ids, new_ids = "season", {g["id"] for g in old["games"]}, {g["id"] for g in new["games"]}
    elif name == "shooting":
        old, new = before["publication"], after["publication"]
        key, old_ids, new_ids = "season", set(old["fixtureIds"]), set(new["fixtureIds"])
    else:
        old, new = before["snapshot"], after["snapshot"]
        key, old_ids, new_ids = "season", set(old["source"]["gameIds"]), set(new["source"]["gameIds"])
    if new[key] < old[key] or (new[key] == old[key] and not old_ids.issubset(new_ids)):
        raise ValueError("Published source membership regressed")
    if name == "officiating" and new[key] == old[key] and instant(new["refreshedAt"]) < instant(old["refreshedAt"]):
        raise ValueError("Source freshness regressed")
    if name == "officiating" and new[key] == old[key] and instant(new["refreshedAt"]) == instant(old["refreshedAt"]):
        identity = lambda season: (season["indexSha256"], sorted((g["id"], g["sha256"], g["source"]) for g in season["games"]))
        if identity(old) != identity(new):
            raise ValueError("Source changed at the same instant")
    if name == "shotQuality" and new[key] == old[key] and new["source"]["shotCount"] < old["source"]["shotCount"]:
        raise ValueError("Published shots regressed")


def prepare(stage, publication, outcomes=None):
    path = stage / "candidate.json"
    if path.is_symlink() or path.stat().st_size > 32768:
        raise ValueError("Invalid candidate")
    candidate = json.loads(path.read_text())
    if candidate.get("schemaVersion") != 1 or set(candidate) != {"schemaVersion", "datasets"} or set(candidate["datasets"]) - set(DATASETS):
        raise ValueError("Invalid candidate")
    previous = load_manifest(publication / "manifest.json")
    files = {}
    candidate = json.loads(json.dumps(candidate))
    now = datetime.now(timezone.utc).isoformat()
    for name, change in list(candidate["datasets"].items()):
        old = previous["datasets"].get(name)
        if change["expectedPriorHash"] != (old["sha256"] if old else None) or (
            name in previous["checks"] and instant(change["checkedAt"]) < instant(previous["checks"][name]["checkedAt"])
        ):
            if outcomes is not None:
                outcomes[name] = "cas-skipped"
            del candidate["datasets"][name]
            continue
        if outcomes is not None:
            outcomes[name] = change["status"]
        if change["status"] != "published":
            continue
        try:
            source = stage / f"{name}.json"
            content = read_blob(source)
            result = validate(name, source)
            if result["generatedAt"] != change["generatedAt"] or (change.get("season") and result["season"] != change["season"]):
                raise ValueError("Generation identity differs")
            change["season"] = result["season"]
            if instant(change["generatedAt"]) > instant(now) or old and instant(change["generatedAt"]) < instant(old["generatedAt"]):
                raise ValueError("Generation instant regressed")
            if old:
                prior_path = publication / old["path"]
                body = read_blob(prior_path)
                if len(body) != old["bytes"] or hashlib.sha256(body).hexdigest() != old["sha256"]:
                    raise ValueError("Stored publication corrupt")
                prior_identity = validate(name, prior_path)
                if old.get("season") and prior_identity["season"] != old["season"]:
                    raise ValueError("Stored season differs")
                continuity(name, json.loads(body), json.loads(content))
            files[name] = content
        except Exception:
            change.pop("generatedAt", None)
            change.pop("season", None)
            change["status"] = "failed"
            if outcomes is not None:
                outcomes[name] = "failed"
            logging.warning("%s publication refused; previous snapshot retained.", name)
    if not candidate["datasets"]:
        raise ValueError("Stale candidate: no current dataset bases")
    next_manifest = merge_candidate(previous, candidate, files, now)
    (publication / "blobs").mkdir(exist_ok=True)
    for name, body in files.items():
        dest = publication / next_manifest["datasets"][name]["path"]
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists() and read_blob(dest) != body:
            raise ValueError("Immutable blob replacement refused")
        dest.write_bytes(body)
    # One manifest commit exposes the complete set; abandoned blobs are harmless.
    (publication / "manifest.json").write_text(json.dumps(next_manifest, separators=(",", ":")) + "\n")
    (publication / "vercel.json").write_text('{"git":{"deploymentEnabled":false}}\n')
    return next_manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", type=Path, required=True)
    parser.add_argument("--publication-root", type=Path, help="Prepare only, for an isolated contract test")
    parser.add_argument("--require-shooting", action="store_true", help="Fail after partial publication unless this run's Shooting result is verified")
    args = parser.parse_args()
    outcomes = {}
    if args.publication_root:
        args.publication_root.mkdir(parents=True, exist_ok=True)
        prepare(args.stage, args.publication_root, outcomes)
        if args.require_shooting:
            shooting_health(args.stage, args.publication_root, outcomes.get("shooting"))
        return 0
    remote = git("fetch", "--no-tags", "--depth=1", "origin", f"refs/heads/{BRANCH}", check=False)
    if remote.returncode:
        # Only a confirmed missing ref permits first publication; network/auth failure does not.
        probe = git("ls-remote", "--exit-code", "origin", f"refs/heads/{BRANCH}", check=False)
        if probe.returncode != 2:
            raise RuntimeError("Could not establish publication head")
        parent = None
    else:
        parent = git("rev-parse", "FETCH_HEAD").stdout.strip()
    with tempfile.TemporaryDirectory(prefix="fullcourt-publication-") as directory:
        checkout = Path(directory) / "data"
        git("worktree", "add", "--detach", str(checkout), parent or "HEAD")
        try:
            if parent is None:
                git("switch", "--orphan", "publication-bootstrap", cwd=checkout)
                git("rm", "-r", "--ignore-unmatch", ".", cwd=checkout)
            else:
                paths = git("ls-tree", "-r", "--name-only", "HEAD", cwd=checkout).stdout.splitlines()
                if any(p not in ("manifest.json", "vercel.json") and not p.startswith("blobs/") for p in paths):
                    raise ValueError("Unexpected publication tree")
            published = prepare(args.stage.resolve(), checkout, outcomes)
            git("config", "user.name", "github-actions[bot]", cwd=checkout)
            git("config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com", cwd=checkout)
            git("add", "manifest.json", "vercel.json", "blobs", cwd=checkout)
            git("commit", "-m", "Publish verified season observations", cwd=checkout)
            # No force, reset or retry/rebase: a concurrent writer must collect from the new base.
            git("push", "origin", f"HEAD:refs/heads/{BRANCH}", cwd=checkout)
            summary = os.environ.get("GITHUB_STEP_SUMMARY")
            if summary:
                with open(summary, "a") as stream:
                    for name, check in published["checks"].items():
                        stream.write(f"- {name}: {check['status']}\n")
            if args.require_shooting:
                shooting_health(args.stage.resolve(), outcome=outcomes.get("shooting"))
        finally:
            git("worktree", "remove", "--force", str(checkout), check=False)
    return 0

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    try:
        raise SystemExit(main())
    except Exception:
        logging.error("Publication did not pass all checks; inspect the module and Shooting health verdicts.")
        raise SystemExit(1)
