def export_vue3(html: str) -> str:
    return f"""<template>
{html}
</template>

<script setup lang="ts">
</script>

<style scoped>
</style>
"""
