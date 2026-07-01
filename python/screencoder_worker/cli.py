import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

from .contracts import RunConfig
from .contracts import stage_event
from .pipeline import WorkerError, run_pipeline


TARGET_CHOICES = ("html", "vue2", "vue3", "react")
PAGE_KIND_CHOICES = ("web", "mobile", "custom")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="screencoder-worker")
    subparsers = parser.add_subparsers(dest="command", required=True)

    run_parser = subparsers.add_parser("run")
    run_parser.add_argument("--input", dest="input_path", type=Path, required=True)
    run_parser.add_argument("--output", dest="output_dir", type=Path, required=True)
    run_parser.add_argument("--provider", required=True)
    run_parser.add_argument("--model", required=True)
    run_parser.add_argument("--base-url", dest="base_url", required=True)
    run_parser.add_argument("--target", choices=TARGET_CHOICES, required=True)
    run_parser.add_argument("--page-kind", choices=PAGE_KIND_CHOICES, required=True)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    _configure_stdout()
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "run":
        config = RunConfig(
            input_path=args.input_path,
            output_dir=args.output_dir,
            provider=args.provider,
            model=args.model,
            base_url=args.base_url,
            api_key=_read_api_key(),
            target=args.target,
            page_kind=args.page_kind,
        )
        try:
            for event in run_pipeline(config):
                _print_event(event)
            return 0
        except (OSError, WorkerError) as exc:
            _print_event(stage_event("final", "failed", error=str(exc)))
            return 1

    parser.error("未知命令")
    return 2


def _configure_stdout() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")


def _print_event(event: dict[str, object]) -> None:
    print(json.dumps(event, ensure_ascii=False), flush=True)


def _read_api_key() -> str:
    import os

    return os.environ.get("SCREENCODER_API_KEY", "")


if __name__ == "__main__":
    raise SystemExit(main())
