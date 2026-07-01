def export_vue2(html: str) -> str:
    return f"""<template>
{html}
</template>

<script>
export default {{
  name: 'ScreenCoderPage'
}}
</script>

<style scoped>
</style>
"""
