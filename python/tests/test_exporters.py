from screencoder_worker.exporters.html import export_html
from screencoder_worker.exporters.react import export_react
from screencoder_worker.exporters.vue2 import export_vue2
from screencoder_worker.exporters.vue3 import export_vue3


def test_export_html_返回原始_html() -> None:
    assert export_html("<main>页面</main>") == "<main>页面</main>"


def test_export_vue3_包装为单文件组件() -> None:
    result = export_vue3("<main>页面</main>")

    assert "<template>" in result
    assert "<main>页面</main>" in result
    assert "<script setup" in result


def test_export_vue2_包装为单文件组件() -> None:
    result = export_vue2("<main>页面</main>")

    assert "export default" in result
    assert "name: 'ScreenCoderPage'" in result


def test_export_react_包装为组件并转义模板字符() -> None:
    result = export_react("<main>`页面 ${name}`</main>")

    assert "export function ScreenCoderPage" in result
    assert "dangerouslySetInnerHTML" in result
    assert "\\`页面 \\${name}\\`" in result
