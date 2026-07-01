from collections.abc import Iterator
from html import escape
from pathlib import Path
from shutil import copyfile

from .contracts import RunConfig, artifact_event, stage_event


def run_pipeline(config: RunConfig) -> Iterator[dict[str, object]]:
    output_dir = Path(config.output_dir)
    input_path = Path(config.input_path)
    copied_input = output_dir / "input.png"
    final_html = output_dir / "final.html"

    yield stage_event("prepare", "running")
    output_dir.mkdir(parents=True, exist_ok=True)
    copyfile(input_path, copied_input)
    yield artifact_event("input", copied_input)
    yield stage_event("prepare", "done")

    yield stage_event("html_generation", "running")
    final_html.write_text(_render_mock_html(config), encoding="utf-8")
    yield artifact_event("final", final_html)
    yield stage_event("html_generation", "done")
    yield stage_event("final", "done", output=str(final_html))


def _render_mock_html(config: RunConfig) -> str:
    provider = escape(config.provider)
    model = escape(config.model)
    target = escape(config.target)
    page_kind = escape(config.page_kind)

    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ScreenCoderDesktop Mock Output</title>
</head>
<body>
  <main>
    <h1>ScreenCoderDesktop Mock Output</h1>
    <p>这是 Python Worker 模拟流水线生成的 HTML 产物。</p>
    <dl>
      <dt>服务提供方</dt>
      <dd>{provider}</dd>
      <dt>模型</dt>
      <dd>{model}</dd>
      <dt>目标框架</dt>
      <dd>{target}</dd>
      <dt>页面类型</dt>
      <dd>{page_kind}</dd>
    </dl>
  </main>
</body>
</html>
"""
