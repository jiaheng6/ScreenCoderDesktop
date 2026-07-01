import json
import subprocess
import sys
from pathlib import Path


def test_cli_run_输出_jsonl_事件并生成_final_html(tmp_path: Path) -> None:
    input_path = tmp_path / "screen.png"
    output_dir = tmp_path / "output"
    input_path.write_bytes(b"mock image bytes")

    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "screencoder_worker.cli",
            "run",
            "--input",
            str(input_path),
            "--output",
            str(output_dir),
            "--provider",
            "mock",
            "--model",
            "mock-model",
            "--target",
            "html",
            "--page-kind",
            "web",
        ],
        cwd=Path(__file__).resolve().parents[1],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )

    assert result.returncode == 0, result.stderr
    events = [json.loads(line) for line in result.stdout.splitlines()]
    final_html = output_dir / "final.html"

    assert events[-1]["stage"] == "final"
    assert events[-1]["status"] == "done"
    assert events[-1]["output"] == str(final_html)
    assert final_html.exists()
