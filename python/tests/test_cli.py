import json
import os
import subprocess
import sys
from pathlib import Path


def test_cli_run_输出_jsonl_事件并生成_final_html(tmp_path: Path) -> None:
    input_path = tmp_path / "screen.png"
    output_dir = tmp_path / "output"
    fake_core = create_fake_screencoder_core(tmp_path / "fake-core")
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
            "opencode-go",
            "--model",
            "minimax-m3",
            "--base-url",
            "https://opencode.ai/zen/go/v1",
            "--target",
            "html",
            "--page-kind",
            "web",
        ],
        cwd=Path(__file__).resolve().parents[1],
        env={
            **os.environ,
            "SCREENCODER_CORE_DIR": str(fake_core),
            "SCREENCODER_API_KEY": "sk-test",
        },
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )

    assert result.returncode == 0, result.stderr
    events = [json.loads(line) for line in result.stdout.splitlines()]
    final_html = output_dir / "final.html"

    assert result.stderr == ""
    assert final_html.exists()
    assert final_html.read_text(encoding="utf-8") == "<main>真实 ScreenCoder 产物</main>"
    assert {"type": "artifact", "name": "final", "path": str(final_html)} in events
    assert {"type": "stage", "stage": "final", "status": "done", "output": str(final_html)} in events


def test_cli_run_输入文件不存在时输出失败事件(tmp_path: Path) -> None:
    output_dir = tmp_path / "output"
    fake_core = create_fake_screencoder_core(tmp_path / "fake-core")

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
            "opencode-go",
            "--model",
            "minimax-m3",
            "--base-url",
            "https://opencode.ai/zen/go/v1",
            "--target",
            "html",
            "--page-kind",
            "web",
        ],
        cwd=Path(__file__).resolve().parents[1],
        env={
            **os.environ,
            "SCREENCODER_CORE_DIR": str(fake_core),
            "SCREENCODER_API_KEY": "sk-test",
        },
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


def create_fake_screencoder_core(core_dir: Path) -> Path:
    core_dir.mkdir(parents=True)
    (core_dir / "main.py").write_text(
        "\n".join(
            [
                "import os",
                "from pathlib import Path",
                "assert os.environ['OPENCODE_API_KEY'] == 'sk-test'",
                "assert Path('data/input/test1.png').exists()",
                "Path('data/output').mkdir(parents=True, exist_ok=True)",
                "Path('data/output/test1_layout_final.html').write_text('<main>真实 ScreenCoder 产物</main>', encoding='utf-8')",
            ]
        ),
        encoding="utf-8",
    )
    return core_dir
