from .component import (
    build_component_styles,
    escape_template_literal,
    parse_component_document,
    render_react_markup,
)


def export_react(html: str) -> str:
    document = parse_component_document(html)
    markup = render_react_markup(document.nodes, indent=6)
    styles = escape_template_literal(build_component_styles(document.styles))

    return f"""export function ScreenCoderPage() {{
  return (
    <div className="screencoder-page">
      <style>{{`
{styles}
      `}}</style>
{markup}
    </div>
  );
}}
"""
