"""Score reconstruction rules shared by offline fatigue analyses."""

from __future__ import annotations

import math
from collections.abc import Iterable


def round_score(value: float) -> float:
    """Match Math.round(value * 100) / 100 for nonnegative fatigue scores."""
    if not math.isfinite(value) or value < 0:
        raise ValueError("Fatigue score must be finite and nonnegative")
    return math.floor(value * 100 + 0.5) / 100


def require_score_fidelity(rebuilt: Iterable[float], stored: Iterable[float]) -> None:
    """Reject a stale export or a different assembly before publishing an analysis."""
    mismatches = sum(
        not math.isfinite(actual) or not math.isfinite(expected)
        or abs(actual - expected) > 0.005
        for actual, expected in zip(rebuilt, stored, strict=True)
    )
    if mismatches:
        raise ValueError(f"Score reconstruction mismatches: {mismatches}; report not written")
