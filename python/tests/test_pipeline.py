from pathlib import Path

from screencoder_worker.contracts import RunConfig
from screencoder_worker.pipeline import run_pipeline


def test_run_pipeline_复制输入并生成最终产物(tmp_path: Path) -> None:
    input_path = tmp_path / "screen.png"
    output_dir = tmp_path / "output"
    input_bytes = b"mock image bytes"
    input_path.write_bytes(input_bytes)

    events = list(
        run_pipeline(
            RunConfig(
                input_path=input_path,
                output_dir=output_dir,
                provider="mock",
                model="mock-model",
                target="html",
                page_kind="web",
            )
        )
    )

    copied_input = output_dir / "input.png"
    final_html = output_dir / "final.html"

    assert copied_input.read_bytes() == input_bytes
    assert final_html.exists()
    assert "ScreenCoderDesktop Mock Output" in final_html.read_text(encoding="utf-8")
    assert events[0] == {"type": "stage", "stage": "prepare", "status": "running"}
    assert {"type": "artifact", "name": "input", "path": str(copied_input)} in events
    assert {"type": "artifact", "name": "final", "path": str(final_html)} in events
    assert events[-1] == {
        "type": "stage",
        "stage": "final",
        "status": "done",
        "output": str(final_html),
    }
