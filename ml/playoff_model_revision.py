"""The explicit playoff model data revision shared by producers and application readers."""
import json
from pathlib import Path

REVISION_PATH = Path(__file__).resolve().parents[1] / "src/data/playoff-model-revision.json"
MODEL_VERSION = json.loads(REVISION_PATH.read_text())["modelVersion"]
