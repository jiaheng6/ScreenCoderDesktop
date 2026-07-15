import importlib.util
import sys
from types import SimpleNamespace
from pathlib import Path


def test_parse_bboxes_移动端会修复被截断的全宽区域(tmp_path: Path, monkeypatch) -> None:
    block_parsor = load_block_parsor_module(monkeypatch)
    image_path = tmp_path / "mobile.png"
    image_path.write_bytes(b"mock")
    monkeypatch.setenv("SCREENCODER_PAGE_KIND", "mobile")

    bboxes = block_parsor.parse_bboxes(
        "\n".join(
            [
                "header: <bbox>0 38 604 139</bbox>",
                "navigation: <bbox>0 139 604 277</bbox>",
                "main content: <bbox>0 277 604 880</bbox>",
                "sidebar: <bbox>0 880 604 1000</bbox>",
            ]
        ),
        str(image_path),
    )

    assert bboxes == {
        "header": (0, 38, 1000, 139),
        "navigation": (0, 139, 1000, 277),
        "main content": (0, 277, 1000, 880),
        "sidebar": (0, 880, 1000, 1000),
    }


def test_resolve_containment_无论输入顺序都移除被包含区域(monkeypatch) -> None:
    block_parsor = load_block_parsor_module(monkeypatch)

    bboxes = block_parsor.resolve_containment(
        {
            "sidebar": (0, 0, 167, 71),
            "header": (0, 0, 1000, 71),
            "navigation": (167, 71, 1000, 148),
            "main content": (167, 148, 1000, 991),
        }
    )

    assert bboxes == {
        "header": (0, 0, 1000, 71),
        "navigation": (167, 71, 1000, 148),
        "main content": (167, 148, 1000, 991),
    }


def load_block_parsor_module(monkeypatch):
    core_dir = Path(__file__).resolve().parents[2] / "screencoder-core"
    fake_image = SimpleNamespace(shape=(905, 421, 3))
    fake_utils = SimpleNamespace(
        Doubao=object,
        Qwen=object,
        GPT=object,
        Gemini=object,
        OpenCodeGo=object,
        encode_image=lambda _path: "",
        image_mask=lambda *_args: None,
    )

    monkeypatch.setitem(sys.modules, "cv2", SimpleNamespace(imread=lambda _path: fake_image))
    monkeypatch.setitem(sys.modules, "utils", fake_utils)
    sys.path.insert(0, str(core_dir))
    try:
        spec = importlib.util.spec_from_file_location(
            "screencoder_core_block_parsor_under_test",
            core_dir / "block_parsor.py",
        )
        assert spec is not None
        assert spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(core_dir))
