"""Safe terminal failure codes shared by the collection parent and shot producer."""
import json
import os
from pathlib import Path
import subprocess
from urllib.error import HTTPError, URLError

REASON_PATH_ENV = "FULLCOURT_COLLECTION_REASON_PATH"
FAILURE_REASONS = frozenset({
    "source-error", "source-timeout", "http-403", "http-error", "empty-response",
    "invalid-response", "validation-error",
})


class EmptyResponse(ValueError):
    pass


class InvalidResponse(ValueError):
    pass


class ValidationFailure(ValueError):
    pass


def failure_reason(error):
    if isinstance(error, HTTPError):
        return "http-403" if error.code == 403 else "http-error"
    if isinstance(error, URLError):
        return "source-timeout" if isinstance(error.reason, TimeoutError) else "source-error"
    if isinstance(error, (TimeoutError, subprocess.TimeoutExpired)):
        return "source-timeout"
    if isinstance(error, EmptyResponse):
        return "empty-response"
    if isinstance(error, InvalidResponse):
        return "invalid-response"
    if isinstance(error, ValidationFailure):
        return "validation-error"
    return "source-error"


def write_failure_reason(error):
    path = os.environ.get(REASON_PATH_ENV)
    if path:
        try:
            Path(path).write_text(json.dumps({"schemaVersion": 1, "reason": failure_reason(error)}))
        except OSError:
            pass


def read_failure_reason(path):
    try:
        if path.stat().st_size > 1024:
            return "source-error"
        value = json.loads(path.read_text())
        if (set(value) == {"schemaVersion", "reason"} and type(value["schemaVersion"]) is int
                and value["schemaVersion"] == 1 and value["reason"] in FAILURE_REASONS):
            return value["reason"]
    except (OSError, ValueError, TypeError):
        pass
    return "source-error"
