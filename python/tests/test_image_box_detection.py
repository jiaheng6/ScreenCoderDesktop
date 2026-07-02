import importlib.util
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
