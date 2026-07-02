from screencoder_worker.exporters.html import export_html
from screencoder_worker.exporters.react import export_react
from screencoder_worker.exporters.vue2 import export_vue2
from screencoder_worker.exporters.vue3 import export_vue3


def test_export_html_返回原始_html() -> None:
    assert export_html("<main>页面</main>") == "<main>页面</main>"


def test_export_vue3_包装为单文件组件() -> None:
    result = export_vue3(
        """<!doctype html>
<html>
<head>
  <style>.container { width: 100%; }</style>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body><main class="page">页面<svg viewBox="0 0 24 24"></svg></main></body>
</html>"""
    )

    assert "<template>" in result
    assert '<main class="page">' in result
    assert "页面" in result
    assert "<script setup" in result
    assert 'viewBox="0 0 24 24"' in result
    assert "<!doctype" not in result.lower()
    assert "<html" not in result.lower()
    assert "<head" not in result.lower()
    assert "cdn.tailwindcss.com" not in result
    assert ".container { width: 100%; }" in result


def test_export_vue2_包装为单文件组件() -> None:
    result = export_vue2("<html><body><main>页面</main></body></html>")

    assert "export default" in result
    assert "name: 'ScreenCoderPage'" in result
    assert "<html" not in result.lower()
    assert "<main>页面</main>" in result


def test_export_react_转换为真实_jsx_组件() -> None:
    result = export_react(
        """<!doctype html>
<html>
<head><style>.page { color: red; }</style></head>
<body>
  <main class="page" style="left: 10%; background-color: red;">
    <label for="name">姓名</label>
    <svg viewBox="0 0 24 24" stroke-width="2"></svg>
  </main>
</body>
</html>"""
    )

    assert "export function ScreenCoderPage" in result
    assert "dangerouslySetInnerHTML" not in result
    assert "<main" in result
    assert 'className="page"' in result
    assert 'htmlFor="name"' in result
    assert "style={{ left: '10%', backgroundColor: 'red' }}" in result
    assert 'viewBox="0 0 24 24"' in result
    assert 'strokeWidth="2"' in result
    assert ".page { color: red; }" in result
    assert "<!doctype" not in result.lower()
    assert "<html" not in result.lower()
