"""Content-addressed publication contracts, independent of provider or Git credentials."""
from __future__ import annotations
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

DATASETS = ("officiating", "shooting", "shotQuality")
MAX_BYTES = 8 * 1024 * 1024


def instant(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Timezone required")
    return parsed


def empty_manifest(now):
    return {"schemaVersion": 1, "updatedAt": now, "datasets": {}, "checks": {}}


def load_manifest(path):
    if path.is_symlink():
        raise ValueError("Manifest symlink refused")
    if not path.exists():
        return empty_manifest(datetime.now(timezone.utc).isoformat())
    if not path.is_file() or path.stat().st_size > 32768:
        raise ValueError("Invalid manifest size")
    value = json.loads(path.read_text())
    if value.get("schemaVersion") != 1 or set(value) != {"schemaVersion", "updatedAt", "datasets", "checks"}:
        raise ValueError("Invalid manifest")
    instant(value["updatedAt"])
    if set(value["datasets"]) - set(DATASETS) or set(value["checks"]) - set(DATASETS):
        raise ValueError("Unknown dataset")
    for name, entry in value["datasets"].items():
        digest = entry["sha256"]
        if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest) or entry["path"] != f"blobs/{name}-{digest}.json":
            raise ValueError("Invalid blob path")
        if not isinstance(entry["bytes"], int) or not 0 < entry["bytes"] <= MAX_BYTES:
            raise ValueError("Invalid blob size")
        instant(entry["generatedAt"])
    for check in value["checks"].values():
        if instant(check["checkedAt"]) > instant(value["updatedAt"]):
            raise ValueError("Check follows manifest")
        if check["status"] not in ("published", "unavailable", "failed"):
            raise ValueError("Invalid check")
    return value


def read_blob(path):
    if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= MAX_BYTES:
        raise ValueError("Invalid blob")
    return path.read_bytes()


def entry_for(name, body, generated):
    instant(generated)
    digest = hashlib.sha256(body).hexdigest()
    return {"path": f"blobs/{name}-{digest}.json", "sha256": digest,
            "bytes": len(body), "generatedAt": generated}


def merge_candidate(previous, candidate, files, now):
    """Compare per-dataset bases; never rebase a stale dataset over a newer snapshot."""
    result = json.loads(json.dumps(previous))
    for name in DATASETS:
        change = candidate["datasets"].get(name)
        if not change:
            continue
        old = previous["datasets"].get(name)
        if change["expectedPriorHash"] != (old["sha256"] if old else None):
            raise ValueError(f"Stale candidate: {name}")
        checked = change["checkedAt"]
        instant(checked)
        if instant(checked) > instant(now):
            raise ValueError("Check from the future")
        if name in previous["checks"] and instant(checked) < instant(previous["checks"][name]["checkedAt"]):
            raise ValueError("Check moved backwards")
        status = change["status"]
        if status not in ("published", "unavailable", "failed"):
            raise ValueError("Invalid candidate status")
        result["checks"][name] = {"status": status, "checkedAt": checked}
        if status != "published":
            continue
        body = files[name]
        generated = change["generatedAt"]
        new = entry_for(name, body, generated)
        if old and instant(generated) < instant(old["generatedAt"]):
            raise ValueError("Snapshot moved backwards")
        if instant(generated) > instant(now) or instant(checked) > instant(now):
            raise ValueError("Snapshot from the future")
        result["datasets"][name] = new
    result["updatedAt"] = now
    return result
