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
    copied_input = output_dir / "input.png"
    final_html = output_dir / "final.html"

    assert result.stderr == ""
    assert events == [
        {"type": "stage", "stage": "prepare", "status": "running"},
        {"type": "artifact", "name": "input", "path": str(copied_input)},
        {"type": "stage", "stage": "prepare", "status": "done"},
        {"type": "stage", "stage": "html_generation", "status": "running"},
        {"type": "artifact", "name": "final", "path": str(final_html)},
        {"type": "stage", "stage": "html_generation", "status": "done"},
        {"type": "stage", "stage": "final", "status": "done", "output": str(final_html)},
    ]
    assert final_html.exists()


def test_cli_run_输入文件不存在时输出失败事件(tmp_path: Path) -> None:
    output_dir = tmp_path / "output"

    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "screencoder_worker.cli",
            "run",
            "--input",
            str(tmp_path / "missing.png"),
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

    events = [json.loads(line) for line in result.stdout.splitlines()]

    assert result.returncode == 1
    assert result.stderr == ""
    assert events == [
        {"type": "stage", "stage": "prepare", "status": "running"},
        {
            "type": "stage",
            "stage": "final",
            "status": "failed",
            "error": f"输入文件不存在：{tmp_path / 'missing.png'}",
        },
    ]
