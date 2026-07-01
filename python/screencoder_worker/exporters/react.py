def export_react(html: str) -> str:
    escaped_html = html.replace("`", "\\`").replace("${", "\\${")
    return f"""export function ScreenCoderPage() {{
  const html = `{escaped_html}`;
  return <div dangerouslySetInnerHTML={{{{ __html: html }}}} />;
}}
"""
