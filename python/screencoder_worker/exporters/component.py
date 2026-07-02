from __future__ import annotations

from dataclasses import dataclass, field
from html import escape
from html.parser import HTMLParser


@dataclass(frozen=True)
class TextNode:
    text: str


@dataclass
class TagNode:
    name: str
    attrs: list[tuple[str, str | None]]
    children: list[ComponentNode] = field(default_factory=list)


ComponentNode = TagNode | TextNode


@dataclass(frozen=True)
class ComponentDocument:
    nodes: list[ComponentNode]
    styles: list[str]


VOID_TAGS = {
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
}

JSX_ATTRIBUTE_NAMES = {
    "class": "className",
    "for": "htmlFor",
    "viewbox": "viewBox",
    "tabindex": "tabIndex",
    "maxlength": "maxLength",
    "minlength": "minLength",
    "readonly": "readOnly",
    "colspan": "colSpan",
    "rowspan": "rowSpan",
    "cellspacing": "cellSpacing",
    "cellpadding": "cellPadding",
}

HTML_ATTRIBUTE_NAMES = {
    "viewbox": "viewBox",
    "preserveaspectratio": "preserveAspectRatio",
}


class ComponentHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = TagNode("__root__", [])
        self.stack = [self.root]
        self.styles: list[str] = []
        self.style_parts: list[str] | None = None
        self.skip_tag_stack: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag_name = tag.lower()
        if self.style_parts is not None:
            return
        if self.skip_tag_stack:
            self.skip_tag_stack.append(tag_name)
            return
        if tag_name == "style":
            self.style_parts = []
            return
        if tag_name == "script":
            self.skip_tag_stack.append(tag_name)
            return

        node = TagNode(tag_name, attrs)
        self.stack[-1].children.append(node)
        if tag_name not in VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag_name = tag.lower()
        if self.style_parts is not None or self.skip_tag_stack:
            return
        if tag_name not in {"script", "style"}:
            self.stack[-1].children.append(TagNode(tag_name, attrs))

    def handle_endtag(self, tag: str) -> None:
        tag_name = tag.lower()
        if self.style_parts is not None:
            if tag_name == "style":
                style_text = "".join(self.style_parts).strip()
                if style_text:
                    self.styles.append(style_text)
                self.style_parts = None
            return
        if self.skip_tag_stack:
            self.skip_tag_stack.pop()
            return

        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].name == tag_name:
                del self.stack[index:]
                return

    def handle_data(self, data: str) -> None:
        if self.style_parts is not None:
            self.style_parts.append(data)
            return
        if self.skip_tag_stack:
            return
        if data:
            self.stack[-1].children.append(TextNode(data))


def parse_component_document(html: str) -> ComponentDocument:
    parser = ComponentHTMLParser()
    parser.feed(html)
    parser.close()

    return ComponentDocument(
        nodes=_select_content_nodes(parser.root),
        styles=parser.styles,
    )


def render_vue_markup(nodes: list[ComponentNode]) -> str:
    return "\n".join(
        rendered
        for node in nodes
        if (rendered := _render_html_node(node))
    )


def render_react_markup(nodes: list[ComponentNode], indent: int = 4) -> str:
    lines: list[str] = []
    for node in nodes:
        lines.extend(_render_react_node(node, indent))

    return "\n".join(lines)


def build_component_styles(styles: list[str]) -> str:
    base_styles = """.screencoder-page {
  width: 100%;
  min-height: 100%;
}"""
    return "\n\n".join([base_styles, *styles]).strip()


def indent_block(text: str, spaces: int) -> str:
    prefix = " " * spaces
    return "\n".join(f"{prefix}{line}" if line.strip() else "" for line in text.splitlines())


def escape_template_literal(value: str) -> str:
    return value.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")


def _select_content_nodes(root: TagNode) -> list[ComponentNode]:
    body = _find_first_tag(root, "body")
    if body is not None:
        return _filter_content_nodes(body.children)

    html = _find_first_tag(root, "html")
    if html is not None:
        return _filter_content_nodes(
            [
                node
                for node in html.children
                if not (isinstance(node, TagNode) and node.name in {"head", "script", "style"})
            ]
        )

    return _filter_content_nodes(root.children)


def _find_first_tag(node: TagNode, name: str) -> TagNode | None:
    if node.name == name:
        return node
    for child in node.children:
        if isinstance(child, TagNode):
            found = _find_first_tag(child, name)
            if found is not None:
                return found

    return None


def _filter_content_nodes(nodes: list[ComponentNode]) -> list[ComponentNode]:
    return [node for node in nodes if not _is_ignorable_node(node)]


def _is_ignorable_node(node: ComponentNode) -> bool:
    if isinstance(node, TextNode):
        return not node.text.strip()
    return node.name in {"html", "head", "body", "script", "style"}


def _render_html_node(node: ComponentNode) -> str:
    if isinstance(node, TextNode):
        return escape(node.text.strip(), quote=False) if node.text.strip() else ""

    attrs = _render_html_attributes(node.attrs)
    if node.name in VOID_TAGS:
        return f"<{node.name}{attrs}>"

    children = "".join(_render_html_node(child) for child in node.children)
    return f"<{node.name}{attrs}>{children}</{node.name}>"


def _render_html_attributes(attrs: list[tuple[str, str | None]]) -> str:
    rendered: list[str] = []
    for raw_name, value in attrs:
        name = HTML_ATTRIBUTE_NAMES.get(raw_name, raw_name)
        if value is None:
            rendered.append(name)
        else:
            rendered.append(f'{name}="{escape(value, quote=True)}"')

    return f" {' '.join(rendered)}" if rendered else ""


def _render_react_node(node: ComponentNode, indent: int) -> list[str]:
    prefix = " " * indent
    if isinstance(node, TextNode):
        text = _escape_jsx_text(node.text.strip())
        return [f"{prefix}{text}"] if text else []

    attrs = _render_jsx_attributes(node)
    child_lines: list[str] = []
    for child in node.children:
        child_lines.extend(_render_react_node(child, indent + 2))

    if not child_lines and node.name in VOID_TAGS:
        return [f"{prefix}<{node.name}{attrs} />"]
    if not child_lines:
        return [f"{prefix}<{node.name}{attrs}></{node.name}>"]

    return [
        f"{prefix}<{node.name}{attrs}>",
        *child_lines,
        f"{prefix}</{node.name}>",
    ]


def _render_jsx_attributes(node: TagNode) -> str:
    attributes: list[str] = []
    for raw_name, raw_value in node.attrs:
        if raw_name == "style":
            style_attribute = _render_jsx_style(raw_value)
            if style_attribute:
                attributes.append(style_attribute)
            continue

        name = _to_jsx_attribute_name(raw_name)
        if raw_value is None:
            attributes.append(f"{name}={{true}}")
            continue

        attributes.append(f'{name}="{escape(raw_value, quote=True)}"')

    return f" {' '.join(attributes)}" if attributes else ""


def _render_jsx_style(raw_value: str | None) -> str:
    if raw_value is None:
        return ""

    declarations: list[str] = []
    for item in raw_value.split(";"):
        if ":" not in item:
            continue
        name, value = item.split(":", 1)
        css_name = name.strip()
        css_value = value.strip()
        if not css_name or not css_value:
            continue
        declarations.append(f"{_to_camel_case(css_name)}: '{_escape_single_quoted_value(css_value)}'")

    return f"style={{{{ {', '.join(declarations)} }}}}" if declarations else ""


def _to_jsx_attribute_name(name: str) -> str:
    if name in JSX_ATTRIBUTE_NAMES:
        return JSX_ATTRIBUTE_NAMES[name]
    if name.startswith("data-") or name.startswith("aria-"):
        return name
    if ":" in name:
        return _to_camel_case(name.replace(":", "-"))
    if "-" in name:
        return _to_camel_case(name)

    return name


def _to_camel_case(name: str) -> str:
    parts = name.split("-")
    first_part = parts[0]
    return first_part + "".join(part[:1].upper() + part[1:] for part in parts[1:] if part)


def _escape_jsx_text(text: str) -> str:
    return escape(text, quote=False).replace("{", "&#123;").replace("}", "&#125;")


def _escape_single_quoted_value(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")
