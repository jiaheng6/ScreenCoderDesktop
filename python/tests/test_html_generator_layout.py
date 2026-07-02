import importlib.util
import sys
import types
from pathlib import Path


class PassthroughSoup:
    def __init__(self, html: str, _parser: str) -> None:
        self.html = html

    def prettify(self) -> str:
        return self.html


def load_html_generator_module(monkeypatch):
    monkeypatch.setitem(
        sys.modules,
        "utils",
        types.SimpleNamespace(
            encode_image=lambda *_args, **_kwargs: "",
            Doubao=object,
            Qwen=object,
            GPT=object,
            Gemini=object,
            OpenCodeGo=object,
        ),
    )
    monkeypatch.setitem(sys.modules, "PIL", types.SimpleNamespace(Image=object))
    monkeypatch.setitem(sys.modules, "bs4", types.SimpleNamespace(BeautifulSoup=PassthroughSoup))

    module_path = Path(__file__).parents[2] / "screencoder-core" / "html_generator.py"
    spec = importlib.util.spec_from_file_location("html_generator", module_path)
    assert spec is not None
    assert spec.loader is not None

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_布局根容器不使用_tailwind_container_类(monkeypatch, tmp_path: Path) -> None:
    module = load_html_generator_module(monkeypatch)
    output_file = tmp_path / "layout.html"
    bbox_tree = {
        "id": 0,
        "bbox": [0, 0, 3368, 1710],
        "children": [
            {"id": 1, "bbox": [0, 0, 3368, 111], "children": []},
        ],
    }

    module.img = None
    module.generate_html(bbox_tree, output_file=str(output_file))

    html = output_file.read_text(encoding="utf-8")
    assert 'class="container"' not in html
    assert ".container" not in html
    assert "screencoder-layout-root" in html
