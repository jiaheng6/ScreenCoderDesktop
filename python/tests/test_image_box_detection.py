import importlib.util
import json
import sys
import types
from pathlib import Path


def load_image_box_detection_module(monkeypatch):
    monkeypatch.setitem(sys.modules, "cv2", types.SimpleNamespace())
    monkeypatch.setitem(sys.modules, "numpy", types.SimpleNamespace())
    monkeypatch.setitem(
        sys.modules,
        "playwright.async_api",
        types.SimpleNamespace(async_playwright=lambda: None),
    )

    module_path = Path(__file__).parents[2] / "screencoder-core" / "image_box_detection.py"
    spec = importlib.util.spec_from_file_location("image_box_detection", module_path)
    assert spec is not None
    assert spec.loader is not None

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_视口与原图一致时不因文档水平溢出压缩坐标(monkeypatch) -> None:
    module = load_image_box_detection_module(monkeypatch)
    region_bboxes = [
        {"id": "2", "x": 0, "y": 0, "w": 3368, "h": 111},
        {"id": "4", "x": 107, "y": 205, "w": 3261, "h": 1505},
    ]
    placeholder_bboxes = [
        {"id": "ph0", "x": 128, "y": 221, "w": 469, "h": 263, "region_id": "4"},
    ]

    scaled_regions, scaled_placeholders = module.scale_bboxes_to_image(
        region_bboxes,
        placeholder_bboxes,
        image_width=3368,
        image_height=1710,
        viewport_width=3368,
        viewport_height=1710,
        layout_width=7385,
        layout_height=1710,
    )

    assert scaled_regions[0]["w"] == 3368
    assert scaled_regions[1]["x"] == 107
    assert scaled_regions[1]["w"] == 3261
    assert scaled_placeholders[0]["x"] == 128
    assert scaled_placeholders[0]["w"] == 469


def test_main_没有图片占位块时仍输出空映射和标注图(tmp_path: Path, monkeypatch) -> None:
    module = load_image_box_detection_module(monkeypatch)

    class FakeImage:
        shape = (100, 200, 3)

        def std(self):
            return 20

        def copy(self):
            return self

    async def fake_extract_bboxes(*_args, **_kwargs):
        return [], [], 200, 100

    written_images = []
    monkeypatch.setattr(module.cv2, "imread", lambda _path: FakeImage(), raising=False)
    monkeypatch.setattr(
        module.cv2,
        "imwrite",
        lambda path, _image: written_images.append(Path(path)) or True,
        raising=False,
    )
    monkeypatch.setattr(module, "extract_bboxes_from_html", fake_extract_bboxes)

    output_dir = tmp_path / "tmp"
    output_json = output_dir / "test1_bboxes.json"
    module.main(
        types.SimpleNamespace(
            screenshot=tmp_path / "input.png",
            html=tmp_path / "layout.html",
            out=output_dir,
            json=output_json,
        )
    )

    assert json.loads(output_json.read_text(encoding="utf-8")) == {
        "regions": [],
        "placeholders": [],
    }
    assert written_images == [output_dir / "debug_gray_bboxes_test1.png"]
