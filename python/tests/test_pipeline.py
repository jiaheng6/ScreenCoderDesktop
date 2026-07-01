from pathlib import Path

from screencoder_worker.contracts import RunConfig
from screencoder_worker.pipeline import run_pipeline


def test_run_pipeline_复制输入并调用真实_screencoder_core(tmp_path: Path, monkeypatch) -> None:
    input_path = tmp_path / "screen.png"
    output_dir = tmp_path / "output"
    fake_core = create_fake_screencoder_core(tmp_path / "fake-core")
    input_bytes = b"mock image bytes"
    input_path.write_bytes(input_bytes)
    monkeypatch.setenv("SCREENCODER_CORE_DIR", str(fake_core))

    events = list(
        run_pipeline(
            RunConfig(
                input_path=input_path,
                output_dir=output_dir,
                provider="opencode-go",
                model="minimax-m3",
                base_url="https://opencode.ai/zen/go/v1",
                api_key="sk-test",
                target="html",
                page_kind="web",
            )
        )
    )

    copied_input = output_dir / "input.png"
    final_html = output_dir / "final.html"
    runtime_input = output_dir / "screencoder-work" / "data" / "input" / "test1.png"

    assert copied_input.read_bytes() == input_bytes
    assert runtime_input.read_bytes() == input_bytes
    assert final_html.read_text(encoding="utf-8") == "<main>真实 ScreenCoder 产物</main>"
    assert {"type": "artifact", "name": "final", "path": str(final_html)} in events
    assert {"type": "stage", "stage": "final", "status": "done", "output": str(final_html)} in events
    assert {
        "type": "log",
        "stream": "stdout",
        "line": "block parser started model=minimax-m3 base=https://opencode.ai/zen/go/v1",
    } in events
    assert {
        "type": "stage",
        "stage": "block_parsor",
        "status": "running",
        "script": "block_parsor.py",
    } in events


def test_run_pipeline_按目标框架生成源码产物(tmp_path: Path, monkeypatch) -> None:
    input_path = tmp_path / "screen.png"
    output_dir = tmp_path / "output"
    fake_core = create_fake_screencoder_core(tmp_path / "fake-core")
    input_path.write_bytes(b"mock image bytes")
    monkeypatch.setenv("SCREENCODER_CORE_DIR", str(fake_core))

    events = list(
        run_pipeline(
            RunConfig(
                input_path=input_path,
                output_dir=output_dir,
                provider="opencode-go",
                model="minimax-m3",
                base_url="https://opencode.ai/zen/go/v1",
                api_key="sk-test",
                target="react",
                page_kind="web",
            )
        )
    )

    source_path = output_dir / "ScreenCoderPage.tsx"

    assert source_path.exists()
    assert "export function ScreenCoderPage" in source_path.read_text(encoding="utf-8")
    assert {"type": "artifact", "name": "source", "path": str(source_path)} in events


def create_fake_screencoder_core(core_dir: Path) -> Path:
    core_dir.mkdir(parents=True)
    (core_dir / "main.py").write_text(
        "raise SystemExit('测试不应调用会吞日志的 main.py')\n",
        encoding="utf-8",
    )
    (core_dir / "block_parsor.py").write_text(
        "\n".join(
            [
                "import os",
                "from pathlib import Path",
                "input_path = Path('data/input/test1.png')",
                "assert input_path.exists(), '缺少输入截图'",
                "assert os.environ['OPENCODE_API_KEY'] == 'sk-test'",
                "print(f\"block parser started model={os.environ['SCREENCODER_MODEL']} base={os.environ['SCREENCODER_BASE_URL']}\", flush=True)",
                "Path('data/tmp').mkdir(parents=True, exist_ok=True)",
                "Path('data/tmp/test1_bboxes.json').write_text('{}', encoding='utf-8')",
            ]
        ),
        encoding="utf-8",
    )
    for script_name in [
        "html_generator.py",
        "image_box_detection.py",
        "mapping.py",
    ]:
        (core_dir / script_name).write_text(
            f"print('{script_name} done', flush=True)\n",
            encoding="utf-8",
        )
    uied_dir = core_dir / "UIED"
    uied_dir.mkdir()
    (uied_dir / "run_single.py").write_text(
        "print('run_single.py done', flush=True)\n",
        encoding="utf-8",
    )
    (core_dir / "image_replacer.py").write_text(
        "\n".join(
            [
                "from pathlib import Path",
                "print('image_replacer.py done', flush=True)",
                "Path('data/output').mkdir(parents=True, exist_ok=True)",
                "Path('data/output/test1_layout_final.html').write_text('<main>真实 ScreenCoder 产物</main>', encoding='utf-8')",
            ]
        ),
        encoding="utf-8",
    )
    return core_dir
