import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace

import requests


def test_opencode_go_遇到_ssl_瞬断会重试(monkeypatch) -> None:
    utils = load_utils_module(monkeypatch)
    attempts = []

    class FakeResponse:
        status_code = 200
        text = '{"content":[{"type":"text","text":"ok"}]}'

        def json(self):
            return {"content": [{"type": "text", "text": "ok"}]}

    def fake_post(*_args, **_kwargs):
        attempts.append(1)
        if len(attempts) == 1:
            raise requests.exceptions.SSLError("EOF occurred in violation of protocol")
        return FakeResponse()

    monkeypatch.setattr(utils.requests, "post", fake_post)
    monkeypatch.setattr(utils.time, "sleep", lambda _seconds: None)

    client = utils.OpenCodeGo(key_path="sk-test", patience=2)

    assert client.ask("问题") == "ok"
    assert len(attempts) == 2


def load_utils_module(monkeypatch):
    module_path = Path(__file__).parents[2] / "screencoder-core" / "utils.py"
    monkeypatch.setitem(sys.modules, "cv2", SimpleNamespace())
    spec = importlib.util.spec_from_file_location("screencoder_core_utils_under_test", module_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
