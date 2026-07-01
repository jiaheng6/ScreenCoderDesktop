from collections.abc import Iterator
from pathlib import Path
from queue import Empty, Queue
from shutil import copy2, copyfile, copytree, rmtree
import importlib.util
import os
import subprocess
import sys
import threading

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

    _patch_runtime_model_config(runtime_dir)
    data_input_dir = runtime_dir / "data" / "input"
    (runtime_dir / "data" / "tmp").mkdir(parents=True, exist_ok=True)
    (runtime_dir / "data" / "output").mkdir(parents=True, exist_ok=True)
    data_input_dir.mkdir(parents=True, exist_ok=True)
    copyfile(input_path, data_input_dir / "test1.png")


def _assert_runtime_dependencies(runtime_dir: Path) -> None:
    if not (runtime_dir / "block_parsor.py").exists():
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


def _patch_runtime_model_config(runtime_dir: Path) -> None:
    block_parser = runtime_dir / "block_parsor.py"
    if block_parser.exists():
        content = block_parser.read_text(encoding="utf-8")
        content = content.replace(
            'OpenCodeGo(model="minimax-m3")',
            'OpenCodeGo(model=os.environ.get("SCREENCODER_MODEL", "minimax-m3"), '
            'base_url=os.environ.get("SCREENCODER_BASE_URL", "https://opencode.ai/zen/go/v1"))',
        )
        block_parser.write_text(content, encoding="utf-8")

    html_generator = runtime_dir / "html_generator.py"
    if html_generator.exists():
        content = html_generator.read_text(encoding="utf-8")
        if "import os" not in content.splitlines()[:5]:
            content = f"import os\n{content}"
        content = content.replace(
            'OpenCodeGo(model="minimax-m3")',
            'OpenCodeGo(model=os.environ.get("SCREENCODER_MODEL", "minimax-m3"), '
            'base_url=os.environ.get("SCREENCODER_BASE_URL", "https://opencode.ai/zen/go/v1"))',
        )
        html_generator.write_text(content, encoding="utf-8")


def _run_core_process(runtime_dir: Path, config: RunConfig) -> Iterator[dict[str, object]]:
    process = subprocess.Popen(
        [sys.executable, "main.py"],
        cwd=runtime_dir,
        env={
            **os.environ,
            "OPENCODE_API_KEY": config.api_key,
            "SCREENCODER_API_KEY": config.api_key,
            "SCREENCODER_PROVIDER": config.provider,
            "SCREENCODER_MODEL": config.model,
            "SCREENCODER_BASE_URL": config.base_url,
            "PYTHONIOENCODING": "utf-8",
        },
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
    while active_streams > 0:
        try:
            stream_name, line = lines.get(timeout=0.1)
        except Empty:
            continue

        if line is None:
            active_streams -= 1
            continue

        if line:
            yield {
                "type": "log",
                "stream": stream_name,
                "line": line,
            }

    for thread in threads:
        thread.join(timeout=1)

    return process.wait()


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
