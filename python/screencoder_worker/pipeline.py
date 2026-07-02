from collections.abc import Iterator
from pathlib import Path
from queue import Empty, Queue
from shutil import copy2, copyfile, copytree, rmtree
import importlib.util
import os
import subprocess
import sys
import threading
import time

from .contracts import RunConfig, artifact_event, stage_event


class WorkerError(RuntimeError):
    pass


EXCLUDED_CORE_ENTRIES = {
    ".git",
    ".venv",
    "__pycache__",
    "apps",
    "data",
    "post-training",
    "python",
    "tmp",
    "tmp.zip",
}

ROOT_FILES_TO_COPY = {
    "LICENSE",
    "README.md",
    "requirements.txt",
}

ROOT_DIRS_TO_COPY = {
    "UIED",
}

REQUIRED_RUNTIME_MODULES = {
    "cv2": "opencv-python",
    "PIL": "Pillow",
    "bs4": "beautifulsoup4",
    "requests": "requests",
    "numpy": "numpy",
    "playwright": "playwright",
    "sklearn": "scikit-learn",
    "scipy": "scipy",
}

SCREENCODER_SCRIPTS = [
    ("block_parsor", Path("block_parsor.py")),
    ("html_generator", Path("html_generator.py")),
    ("image_box_detection", Path("image_box_detection.py")),
    ("uied_detection", Path("UIED") / "run_single.py"),
    ("mapping", Path("mapping.py")),
    ("image_replacer", Path("image_replacer.py")),
]

DEFAULT_HEARTBEAT_SECONDS = 30
DEFAULT_SCRIPT_TIMEOUT_SECONDS = 900
MOBILE_VIEWPORT_META = '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
MOBILE_ADAPTER_STYLE = """<style id="screencoder-mobile-adapter">
html,
body {
    max-width: 100vw;
    overflow-x: hidden;
}

body {
    min-width: 0;
}

body * {
    box-sizing: border-box;
    min-width: 0;
    max-width: 100vw;
}

img,
svg,
canvas,
video {
    max-width: 100%;
}
</style>"""


def run_pipeline(config: RunConfig) -> Iterator[dict[str, object]]:
    output_dir = Path(config.output_dir)
    input_path = Path(config.input_path)
    copied_input = output_dir / "input.png"
    runtime_dir = output_dir / "screencoder-work"
    final_html = output_dir / "final.html"

    yield stage_event("prepare", "running")
    if not input_path.exists():
        raise WorkerError(f"输入文件不存在：{input_path}")
    if not input_path.is_file():
        raise WorkerError(f"输入路径不是文件：{input_path}")
    if output_dir.exists() and not output_dir.is_dir():
        raise WorkerError(f"输出路径不是目录：{output_dir}")

    output_dir.mkdir(parents=True, exist_ok=True)
    copyfile(input_path, copied_input)
    yield artifact_event("input", copied_input)

    core_dir = resolve_screencoder_core_dir()
    _prepare_runtime_core(core_dir, runtime_dir, config, input_path)
    yield artifact_event("runtime", runtime_dir)
    yield {
        "type": "environment",
        "python": sys.executable,
        "core": str(core_dir),
    }
    _assert_runtime_dependencies(runtime_dir)
    yield stage_event("prepare", "done")

    yield stage_event("screencoder", "running")
    exit_code = yield from _run_core_process(runtime_dir, config)
    if exit_code != 0:
        raise WorkerError(f"ScreenCoder 退出码非零：{exit_code}")
    yield stage_event("screencoder", "done")

    source_html = _resolve_screencoder_output(runtime_dir)
    copyfile(source_html, final_html)
    _postprocess_final_html(final_html, config)
    _copy_output_assets(source_html, output_dir)
    source_artifact = _write_source_artifact(config, final_html.read_text(encoding="utf-8"))
    yield artifact_event("final", final_html)
    if source_artifact is not None:
        yield artifact_event("source", source_artifact)
    yield stage_event("final", "done", output=str(final_html))


def resolve_screencoder_core_dir() -> Path:
    configured_dir = os.environ.get("SCREENCODER_CORE_DIR", "").strip()
    if configured_dir:
        return _validate_core_dir(Path(configured_dir))

    current_file = Path(__file__).resolve()
    candidates = [
        current_file.parents[2] / "screencoder-core",
        current_file.parents[3] / "ScreenCoder",
    ]

    for candidate in candidates:
        if (candidate / "main.py").exists():
            return candidate

    raise WorkerError(
        "未找到 ScreenCoder core。请设置 SCREENCODER_CORE_DIR 指向包含 main.py 的原项目目录。"
    )


def _validate_core_dir(core_dir: Path) -> Path:
    resolved = core_dir.expanduser().resolve()
    if not (resolved / "main.py").exists():
        raise WorkerError(f"ScreenCoder core 目录缺少 main.py：{resolved}")
    return resolved


def _prepare_runtime_core(
    core_dir: Path,
    runtime_dir: Path,
    config: RunConfig,
    input_path: Path,
) -> None:
    if runtime_dir.exists():
        rmtree(runtime_dir)

    runtime_dir.mkdir(parents=True)
    for item in core_dir.iterdir():
        if item.name in EXCLUDED_CORE_ENTRIES:
            continue

        destination = runtime_dir / item.name
        if item.is_dir():
            if item.name in ROOT_DIRS_TO_COPY:
                copytree(item, destination, ignore=_ignore_runtime_noise)
            continue

        if item.suffix == ".py" or item.name in ROOT_FILES_TO_COPY:
            copy2(item, destination)

    _patch_runtime_model_config(runtime_dir, config)
    data_input_dir = runtime_dir / "data" / "input"
    (runtime_dir / "data" / "tmp").mkdir(parents=True, exist_ok=True)
    (runtime_dir / "data" / "output").mkdir(parents=True, exist_ok=True)
    data_input_dir.mkdir(parents=True, exist_ok=True)
    copyfile(input_path, data_input_dir / "test1.png")


def _assert_runtime_dependencies(runtime_dir: Path) -> None:
    if not (runtime_dir / "requirements.txt").exists():
        return

    missing_modules = [
        f"{module}（安装包：{package}）"
        for module, package in REQUIRED_RUNTIME_MODULES.items()
        if importlib.util.find_spec(module) is None
    ]

    if missing_modules:
        raise WorkerError(
            "Python 环境缺少 ScreenCoder 运行依赖："
            + "、".join(missing_modules)
            + f"。当前 Python：{sys.executable}。"
            + "请执行 `<当前 Python> -m pip install -r screencoder-core/requirements.txt`，"
            + "或设置 SCREENCODER_PYTHON 指向已安装依赖的虚拟环境。"
        )


def _ignore_runtime_noise(_directory: str, names: list[str]) -> set[str]:
    return {
        name
        for name in names
        if name == "__pycache__" or name.endswith(".pyc") or name in {"logs", "data"}
    }


def _patch_runtime_model_config(runtime_dir: Path, config: RunConfig) -> None:
    block_parser = runtime_dir / "block_parsor.py"
    if block_parser.exists():
        content = block_parser.read_text(encoding="utf-8")
        content = _ensure_python_import(content, "os")
        content = content.replace(
            'OpenCodeGo(model="minimax-m3")',
            'OpenCodeGo(model=os.environ.get("SCREENCODER_MODEL", "minimax-m3"), '
            'base_url=os.environ.get("SCREENCODER_BASE_URL", "https://opencode.ai/zen/go/v1"))',
        )
        if config.page_kind == "mobile":
            content = _patch_mobile_block_parser_prompt(content)
        block_parser.write_text(content, encoding="utf-8")

    html_generator = runtime_dir / "html_generator.py"
    if html_generator.exists():
        content = html_generator.read_text(encoding="utf-8")
        content = _ensure_python_import(content, "os")
        content = content.replace(
            'OpenCodeGo(model="minimax-m3")',
            'OpenCodeGo(model=os.environ.get("SCREENCODER_MODEL", "minimax-m3"), '
            'base_url=os.environ.get("SCREENCODER_BASE_URL", "https://opencode.ai/zen/go/v1"))',
        )
        if config.page_kind == "mobile":
            content = _patch_mobile_html_generator_prompt(content)
        if config.target != "html":
            content = _patch_framework_safe_html_prompt(content, config.target)
        html_generator.write_text(content, encoding="utf-8")


def _ensure_python_import(content: str, module_name: str) -> str:
    import_line = f"import {module_name}"
    if import_line in content.splitlines()[:10]:
        return content

    return f"{import_line}\n{content}"


def _patch_mobile_block_parser_prompt(content: str) -> str:
    marker = "SCREENCODER_DESKTOP_MOBILE_BLOCK_PROMPT_PATCH"
    if marker in content or "PROMPT_MERGE" not in content:
        return content

    patch = f'''
# {marker}
if os.environ.get("SCREENCODER_PAGE_KIND") == "mobile":
    PROMPT_MERGE += """

移动端截图识别补充要求：
1. 当前输入是手机页面截图，请按手机视口理解布局，不要套用桌面侧边栏结构。
2. 可将顶部栏、功能入口区、内容列表、底部导航分别映射到 header、navigation、main content、sidebar 这些既有标签。
3. 边界框必须覆盖真实可见内容，避免把手机页面右侧空白误认为内容区域。
"""
'''
    anchor = 'BBOX_TAG_START = "<bbox>"'
    if anchor in content:
        return content.replace(anchor, f"{patch}\n{anchor}", 1)

    return f"{content}\n{patch}"


def _patch_mobile_html_generator_prompt(content: str) -> str:
    marker = "SCREENCODER_DESKTOP_MOBILE_PROMPT_PATCH"
    if marker in content or "PROMPT_DICT" not in content:
        return content

    patch = f'''
# {marker}
MOBILE_GENERATION_REQUIREMENT = """
移动端页面生成要求：
1. 当前目标是移动端截图，请使用移动端优先布局，不要生成桌面侧边栏或桌面宽卡片。
2. 根容器和主要区块必须适配 360-430px 宽度 viewport，优先使用 w-full、max-w-full、flex-col、grid-cols-1 等 Tailwind 类。
3. 避免使用 w-64、w-[900px]、min-w-* 等会导致横向溢出的固定桌面宽度；必要时使用 max-w-full、overflow-hidden 和 flex-wrap。
4. 顶部栏、快捷入口、内容列表和底部导航应按手机截图的垂直流式结构还原。
"""

if os.environ.get("SCREENCODER_PAGE_KIND") == "mobile":
    PROMPT_DICT = {{
        name: f"{{prompt}}\\n\\n{{MOBILE_GENERATION_REQUIREMENT}}"
        for name, prompt in PROMPT_DICT.items()
    }}
'''
    anchor = "# Support refining the generated code."
    if anchor in content:
        return content.replace(anchor, f"{patch}\n{anchor}", 1)

    return f"{content}\n{patch}"


def _patch_framework_safe_html_prompt(content: str, target: str) -> str:
    marker = "SCREENCODER_DESKTOP_FRAMEWORK_SAFE_PROMPT_PATCH"
    if marker in content or "PROMPT_DICT" not in content:
        return content

    target_label = {
        "react": "React",
        "vue2": "Vue 2",
        "vue3": "Vue 3",
    }.get(target, target)
    patch = f'''
# {marker}
FRAMEWORK_SAFE_HTML_REQUIREMENT = """
目标框架源码生成要求（{target_label}）：
1. 最终源码会从 HTML 自动转换为 {target_label} 组件，请输出结构清晰、可转换的容器内部 HTML。
2. 不要输出 <!DOCTYPE>、<html>、<head>、<body>、<script>、CDN 脚本或事件脚本。
3. 属性请保持标准 HTML 写法，例如 class、style、for、viewBox、stroke-width，避免混入 Vue 或 React 模板语法。
4. 避免依赖运行时脚本修改 DOM，交互状态用静态结构和样式表达。
"""

PROMPT_DICT = {{
    name: f"{{prompt}}\\n\\n{{FRAMEWORK_SAFE_HTML_REQUIREMENT}}"
    for name, prompt in PROMPT_DICT.items()
}}
'''
    anchor = "# Support refining the generated code."
    if anchor in content:
        return content.replace(anchor, f"{patch}\n{anchor}", 1)

    return f"{content}\n{patch}"


def _run_core_process(runtime_dir: Path, config: RunConfig) -> Iterator[dict[str, object]]:
    for stage_name, script_path in SCREENCODER_SCRIPTS:
        script_label = script_path.as_posix()
        if not (runtime_dir / script_path).exists():
            raise WorkerError(f"ScreenCoder 脚本不存在：{script_label}")

        yield stage_event(stage_name, "running", script=script_label)
        exit_code = yield from _run_script_process(runtime_dir, config, script_path)
        if exit_code != 0:
            yield stage_event(
                stage_name,
                "failed",
                script=script_label,
                exit_code=exit_code,
            )
            return exit_code
        yield stage_event(stage_name, "done", script=script_label)

    return 0


def _run_script_process(
    runtime_dir: Path,
    config: RunConfig,
    script_path: Path,
) -> Iterator[dict[str, object]]:
    script_label = script_path.as_posix()
    process = subprocess.Popen(
        [sys.executable, "-u", script_label],
        cwd=runtime_dir,
        env=_create_core_env(config),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    lines: Queue[tuple[str, str | None]] = Queue()
    threads = [
        threading.Thread(target=_read_process_stream, args=("stdout", process.stdout, lines)),
        threading.Thread(target=_read_process_stream, args=("stderr", process.stderr, lines)),
    ]

    for thread in threads:
        thread.daemon = True
        thread.start()

    active_streams = len(threads)
    started_at = time.monotonic()
    last_event_at = started_at
    heartbeat_seconds = _heartbeat_seconds()
    timeout_seconds = _script_timeout_seconds()
    while active_streams > 0:
        try:
            stream_name, line = lines.get(timeout=0.1)
        except Empty:
            now = time.monotonic()
            if process.poll() is None and now - last_event_at >= heartbeat_seconds:
                yield {
                    "type": "heartbeat",
                    "script": script_label,
                    "elapsedSeconds": int(now - started_at),
                }
                last_event_at = now

            if process.poll() is None and now - started_at >= timeout_seconds:
                process.kill()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    pass
                for thread in threads:
                    thread.join(timeout=1)
                yield {
                    "type": "log",
                    "stream": "stderr",
                    "line": f"ScreenCoder 脚本超时：{script_label}",
                }
                return 124

            continue

        if line is None:
            active_streams -= 1
            continue

        if line:
            last_event_at = time.monotonic()
            yield {
                "type": "log",
                "stream": stream_name,
                "line": line,
            }

    for thread in threads:
        thread.join(timeout=1)

    return process.wait()


def _create_core_env(config: RunConfig) -> dict[str, str]:
    return {
        **os.environ,
        "OPENCODE_API_KEY": config.api_key,
        "SCREENCODER_API_KEY": config.api_key,
        "SCREENCODER_PROVIDER": config.provider,
        "SCREENCODER_MODEL": config.model,
        "SCREENCODER_BASE_URL": config.base_url,
        "SCREENCODER_PAGE_KIND": config.page_kind,
        "SCREENCODER_TARGET_FRAMEWORK": config.target,
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUNBUFFERED": "1",
    }


def _heartbeat_seconds() -> int:
    return max(1, _int_from_env("SCREENCODER_HEARTBEAT_SECONDS", DEFAULT_HEARTBEAT_SECONDS))


def _script_timeout_seconds() -> int:
    return max(
        1,
        _int_from_env("SCREENCODER_SCRIPT_TIMEOUT_SECONDS", DEFAULT_SCRIPT_TIMEOUT_SECONDS),
    )


def _int_from_env(name: str, fallback: int) -> int:
    value = os.environ.get(name, "").strip()
    if not value:
        return fallback
    try:
        return int(value)
    except ValueError:
        return fallback


def _read_process_stream(
    stream_name: str,
    stream,
    lines: Queue[tuple[str, str | None]],
) -> None:
    try:
        if stream is None:
            return
        for line in stream:
            lines.put((stream_name, line.rstrip("\r\n")))
    finally:
        lines.put((stream_name, None))


def _resolve_screencoder_output(runtime_dir: Path) -> Path:
    candidates = [
        runtime_dir / "data" / "output" / "test1_layout_final.html",
        runtime_dir / "data" / "output" / "test1_layout.html",
    ]

    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate

    raise WorkerError("ScreenCoder 未生成 HTML 产物")


def _copy_output_assets(source_html: Path, output_dir: Path) -> None:
    source_output_dir = source_html.parent
    if source_output_dir.resolve() == output_dir.resolve():
        return

    for item in source_output_dir.iterdir():
        if item == source_html or item.suffix.lower() == ".html":
            continue

        destination = output_dir / item.name
        if destination.exists():
            if destination.is_dir() and not destination.is_symlink():
                rmtree(destination)
            else:
                destination.unlink()

        if item.is_dir():
            copytree(item, destination)
        elif item.is_file():
            copy2(item, destination)


def _postprocess_final_html(final_html: Path, config: RunConfig) -> None:
    if config.page_kind != "mobile":
        return

    html = final_html.read_text(encoding="utf-8")
    html = _ensure_html_head_snippet(html, MOBILE_VIEWPORT_META, "name=\"viewport\"")
    html = _ensure_html_head_snippet(html, MOBILE_ADAPTER_STYLE, "screencoder-mobile-adapter")
    final_html.write_text(html, encoding="utf-8")


def _ensure_html_head_snippet(html: str, snippet: str, existing_marker: str) -> str:
    if existing_marker.lower() in html.lower():
        return html

    head_end_index = html.lower().find("</head>")
    if head_end_index >= 0:
        return f"{html[:head_end_index]}    {snippet}\n{html[head_end_index:]}"

    return f"{snippet}\n{html}"


def _write_source_artifact(config: RunConfig, html: str) -> Path | None:
    output_dir = Path(config.output_dir)

    if config.target == "vue3":
        from .exporters.vue3 import export_vue3

        export_path = output_dir / "ScreenCoderPage.vue"
        export_path.write_text(export_vue3(html), encoding="utf-8")
        return export_path

    if config.target == "vue2":
        from .exporters.vue2 import export_vue2

        export_path = output_dir / "ScreenCoderPage.vue"
        export_path.write_text(export_vue2(html), encoding="utf-8")
        return export_path

    if config.target == "react":
        from .exporters.react import export_react

        export_path = output_dir / "ScreenCoderPage.tsx"
        export_path.write_text(export_react(html), encoding="utf-8")
        return export_path

    return None
