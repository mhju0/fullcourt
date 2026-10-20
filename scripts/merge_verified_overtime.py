"""Merge a frozen official OT proof into the cumulative fixture correction registry."""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / "docs/research/2026-10-20-overtime-correction"
REGISTRY = ROOT / "src/data/game-input-corrections.json"
logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)


def merge(registry: dict, observations: list[dict], evidence: str) -> dict:
    result = json.loads(json.dumps(registry))
    fixtures = {(r["date"], r["homeAbbr"], r["awayAbbr"]): r for r in result["fixtures"]}
    if len(fixtures) != len(result["fixtures"]):
        raise ValueError("Duplicate existing fixture correction")
    seen = set()
    for observation in observations:
        decision = observation.get("effectiveDecision", observation["decision"])
        ot = observation.get("effectiveOvertimePeriods", observation["overtimePeriods"])
        if decision not in ("verified", "verified-supplemental") or not ot:
            continue
        if type(ot) is not int or ot < 1 or observation["beforeOvertimePeriods"] != 0:
            raise ValueError("Only exact verified positive counts from stored zero are allowed")
        key = observation["date"], observation["homeAbbr"], observation["awayAbbr"]
        if key in seen:
            raise ValueError("Duplicate new OT fixture")
        seen.add(key)
        fixture = fixtures.setdefault(key, {"date": key[0], "homeAbbr": key[1], "awayAbbr": key[2],
                                           "auditGameId": observation["gameId"], "fields": {}, "sources": []})
        if fixture["auditGameId"] != observation["gameId"]:
            raise ValueError("Existing fixture/game identity conflict")
        desired = {"before": 0, "after": ot}
        current = fixture["fields"].get("overtimePeriods")
        if current is not None and current != desired:
            raise ValueError("Cannot replace a previous accepted OT fact")
        fixture["fields"]["overtimePeriods"] = desired
        source = evidence + "#" + observation["externalId"]
        if source not in fixture["sources"]:
            fixture["sources"].append(source)
    result["fixtures"] = sorted(fixtures.values(), key=lambda r: (r["date"], r["homeAbbr"], r["awayAbbr"]))
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("proof", type=Path)
    parser.add_argument("--expected-proof-sha", required=True)
    parser.add_argument("--source-candidate", required=True, type=Path,
                        help="Validated provisional OT manifest, before the registry merge")
    parser.add_argument("--expected-candidate-sha", required=True)
    args = parser.parse_args()
    raw = args.proof.read_bytes()
    if hashlib.sha256(raw).hexdigest() != args.expected_proof_sha:
        raise ValueError("Externally frozen proof hash mismatch")
    proof = json.loads(raw)
    if proof.get("kind") != "official-overtime-proof" or proof.get("schemaVersion") != 1 or proof.get("complete") is not True:
        raise ValueError("A complete, frozen official overtime proof is required")
    if proof["counts"]["expected"] != 5815 or proof["counts"]["attempted"] != 5815 or len(proof["facts"]) != 5815:
        raise ValueError("The full 5,815-fixture corpus must be adjudicated")
    candidate_bytes = args.source_candidate.read_bytes()
    if hashlib.sha256(candidate_bytes).hexdigest() != args.expected_candidate_sha:
        raise ValueError("Externally frozen provisional candidate hash mismatch")
    candidate = json.loads(candidate_bytes)
    if candidate.get("kind") != "overtime-correction" or candidate["sourceProof"]["sha256"] != args.expected_proof_sha:
        raise ValueError("Candidate does not bind the frozen official source proof")
    supplement_path = ROOT / "scripts/overtime-correction/supplemental-adjudications.json"
    supplement_bytes = supplement_path.read_bytes()
    supplement_sha = hashlib.sha256(supplement_bytes).hexdigest()
    if candidate["sourceProof"]["supplementalAdjudicationsSha256"] != supplement_sha:
        raise ValueError("Candidate does not bind the reviewed supplemental decisions")
    supplemental = {r["gameId"]: r for r in json.loads(supplement_bytes)["adjudications"]}
    accepted_ids = candidate["sourceProof"]["supplementalAcceptedGameIds"]
    if (len(supplemental) != 14 or len(accepted_ids) != 14 or
            set(accepted_ids) != set(supplemental) or candidate["sourceProof"]["supplementalAccepted"] != 14):
        raise ValueError("Candidate must validate the fourteen exact supplemental records")
    observations = []
    identities = set()
    for item in proof["facts"]:
        fact_bytes = (args.proof.parent / item["path"]).read_bytes()
        if hashlib.sha256(fact_bytes).hexdigest() != item["sha256"]:
            raise ValueError("Frozen source fact changed")
        fact = json.loads(fact_bytes)
        if fact["gameId"] != item["gameId"] or fact["externalId"] != item["externalId"]:
            raise ValueError("Source fact identity mismatch")
        decision = fact["decision"]
        if decision["status"] != item["decision"] or decision["overtimePeriods"] != item["overtimePeriods"]:
            raise ValueError("Frozen source decision mismatch")
        identity = fact["date"], fact["homeAbbr"], fact["awayAbbr"]
        if identity in identities:
            raise ValueError("Duplicate adjudicated fixture")
        identities.add(identity)
        observations.append({"gameId": fact["gameId"], "externalId": fact["externalId"], "date": fact["date"],
                             "season": fact["season"], "homeAbbr": fact["homeAbbr"], "awayAbbr": fact["awayAbbr"],
                             "beforeOvertimePeriods": fact["stored"]["overtimePeriods"],
                             "decision": decision["status"], "overtimePeriods": decision["overtimePeriods"],
                             "reasons": decision["reasons"], "sourceUrl": fact["source"]["url"],
                             "bodySha256": fact["source"].get("bodySha256"),
                             "factSha256": item["sha256"]})
        observation = observations[-1]
        record = supplemental.get(fact["gameId"])
        if record:
            if (record["strictFactSha256"] != item["sha256"] or decision["status"] != "unknown" or
                    record["strictRawBodySha256"] != fact["source"]["bodySha256"] or
                    any(record[k] != observation[k] for k in ("gameId", "externalId", "date", "season", "homeAbbr", "awayAbbr"))):
                raise ValueError("Supplement is not bound to the retained strict unknown fact")
            observation.update(effectiveDecision="verified-supplemental",
                               effectiveOvertimePeriods=record["overtimePeriods"],
                               supplementalRecordId=record["recordId"])
    selected = {o["gameId"]: (o["externalId"], o.get("effectiveOvertimePeriods", o["overtimePeriods"]), o["factSha256"])
                for o in observations if o.get("effectiveDecision", o["decision"]) in ("verified", "verified-supplemental")
                and (o.get("effectiveOvertimePeriods", o["overtimePeriods"]) or 0) > 0}
    candidate_changes = {r["id"]: (r["externalId"], r["after"], r["factSha256"]) for r in candidate["inputChanges"]}
    if len(candidate_changes) != len(candidate["inputChanges"]) or selected != candidate_changes:
        raise ValueError("Registry delta must exactly match the source-validated provisional candidate")
    registry_bytes = REGISTRY.read_bytes()
    if hashlib.sha256(registry_bytes).hexdigest() != candidate["sourceHashes"]["src/data/game-input-corrections.json"]:
        raise ValueError("Cumulative registry changed after the provisional candidate was frozen")
    output = RESEARCH / "source-adjudications.json"
    registry = merge(json.loads(registry_bytes), observations, str(output.relative_to(ROOT)))
    RESEARCH.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"schemaVersion": 1, "sourceProofSha256": args.expected_proof_sha,
                                 "sourceSnapshotSha256": proof["snapshotSha256"],
                                 "validatorSha256": proof["validatorSha256"], "counts": proof["counts"],
                                 "provisionalSourceCandidateSha256": args.expected_candidate_sha,
                                 "supplementalAdjudicationsSha256": supplement_sha,
                                 "supplementalAdjudications": list(supplemental.values()),
                                 "effectiveCounts": {"verified": proof["counts"]["verified"] + len(accepted_ids),
                                                     "unknown": proof["counts"]["unknown"] - len(accepted_ids),
                                                     "positiveOvertime": len(selected),
                                                     "supplementalAccepted": len(accepted_ids)},
                                 "observations": observations}, indent=2) + "\n")
    REGISTRY.write_text(json.dumps(registry, indent=2) + "\n")
    log.info("Retained all prior correction fields; merged %d verified positive OT fixtures",
             len(selected))


if __name__ == "__main__":
    main()
