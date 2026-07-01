from dataclasses import dataclass
from pathlib import Path
from typing import Literal


TargetFramework = Literal["html", "vue2", "vue3", "react"]
PageKind = Literal["web", "mobile", "custom"]


@dataclass(frozen=True)
class RunConfig:
    input_path: Path
    output_dir: Path
    provider: str
    model: str
    target: TargetFramework
    page_kind: PageKind


def stage_event(stage: str, status: str, **payload: object) -> dict[str, object]:
    event: dict[str, object] = {
        "type": "stage",
        "stage": stage,
        "status": status,
    }
    event.update(payload)
    return event


def artifact_event(name: str, path: Path) -> dict[str, object]:
    return {
        "type": "artifact",
        "name": name,
        "path": str(path),
    }
