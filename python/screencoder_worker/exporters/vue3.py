from .component import (
    build_component_styles,
    indent_block,
    parse_component_document,
    render_vue_markup,
)


def export_vue3(html: str) -> str:
    document = parse_component_document(html)
    markup = render_vue_markup(document.nodes)
    styles = build_component_styles(document.styles)

    return f"""<template>
  <div class="screencoder-page">
{indent_block(markup, 4)}
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
{styles}
</style>
"""
