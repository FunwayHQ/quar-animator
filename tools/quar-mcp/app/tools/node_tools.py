"""Tools for scene graph node operations: CRUD, grouping, reordering."""

from __future__ import annotations

from typing import Any

from fastmcp import Context

from app.project import require_project


async def list_nodes(page_id: str | None = None, ctx: Context | None = None) -> dict[str, Any]:
    """List all nodes in the scene graph as a tree.

    Args:
        page_id: Page to query. Defaults to the active page.
        ctx: FastMCP context (auto-injected)

    Returns:
        Tree of nodes with id, name, type, visible, locked, and children
    """
    try:
        project = require_project()
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    tree = project.get_node_tree(page_id)
    total = len(project.get_nodes(page_id))
    return {"status": "success", "tree": tree, "totalNodes": total}


async def get_node(node_id: str, page_id: str | None = None, ctx: Context | None = None) -> dict[str, Any]:
    """Get full details of a specific node.

    Args:
        node_id: ID of the node to inspect
        page_id: Page to search in. Defaults to active page.
        ctx: FastMCP context (auto-injected)

    Returns:
        Complete node data including transform, fills, strokes, etc.
    """
    try:
        project = require_project()
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    node = project.find_node(node_id, page_id)
    if node is None:
        return {"status": "error", "error": f"Node '{node_id}' not found"}

    return {"status": "success", "node": node}


async def add_node(
    node_type: str,
    name: str | None = None,
    parent_id: str | None = None,
    x: float = 0,
    y: float = 0,
    width: float = 100,
    height: float = 100,
    fill_color: str | None = "#4A90D9",
    stroke_color: str | None = None,
    stroke_width: float = 2,
    sides: int = 6,
    radius: float = 50,
    content: str = "Text",
    font_size: float = 24,
    page_id: str | None = None,
    ctx: Context | None = None,
) -> dict[str, Any]:
    """Add a new node to the scene graph.

    Args:
        node_type: One of: rectangle, ellipse, polygon, path, text, group, artboard, image
        name: Display name. Auto-generated from type if omitted.
        parent_id: Parent node ID for nesting. None for root level.
        x: X position
        y: Y position
        width: Width (for rectangle, artboard, image)
        height: Height (for rectangle, artboard, image)
        fill_color: Hex color string like "#FF0000". None for no fill.
        stroke_color: Hex color string. None for no stroke.
        stroke_width: Stroke width in pixels
        sides: Number of sides (for polygon, 3-12)
        radius: Radius (for ellipse, polygon)
        content: Text content (for text nodes)
        font_size: Font size in pixels (for text nodes)
        page_id: Target page. Defaults to active page.
        ctx: FastMCP context (auto-injected)

    Returns:
        The created node with its generated ID
    """
    try:
        project = require_project()
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    valid_types = {"rectangle", "ellipse", "polygon", "path", "text", "group", "artboard", "image"}
    if node_type not in valid_types:
        return {"status": "error", "error": f"Invalid node type '{node_type}'. Must be one of: {', '.join(sorted(valid_types))}"}

    fills = []
    if fill_color:
        fills.append({
            "type": "solid",
            "color": _hex_to_color(fill_color),
            "opacity": 1.0,
            "visible": True,
        })

    strokes = []
    if stroke_color:
        strokes.append({
            "color": _hex_to_color(stroke_color),
            "width": stroke_width,
            "opacity": 1.0,
            "cap": "round",
            "join": "round",
            "visible": True,
        })

    node: dict[str, Any] = {
        "type": node_type,
        "name": name or node_type.capitalize(),
        "transform": {
            "position": {"x": x, "y": y},
            "rotation": 0,
            "scale": {"x": 1, "y": 1},
            "anchor": {"x": 0.5, "y": 0.5},
            "skew": {"x": 0, "y": 0},
        },
    }

    if node_type == "rectangle":
        node.update({"width": width, "height": height, "cornerRadius": [0, 0, 0, 0], "fills": fills, "strokes": strokes})
    elif node_type == "ellipse":
        node.update({"radiusX": width / 2, "radiusY": height / 2, "fills": fills, "strokes": strokes})
    elif node_type == "polygon":
        node.update({"sides": max(3, min(12, sides)), "radius": radius, "fills": fills, "strokes": strokes})
    elif node_type == "text":
        node.update({
            "content": content,
            "fontFamily": "Inter",
            "fontSize": font_size,
            "fontWeight": 400,
            "fontStyle": "normal",
            "textAlign": "left",
            "lineHeight": 1.2,
            "letterSpacing": 0,
            "fills": fills or [{"type": "solid", "color": {"r": 255, "g": 255, "b": 255, "a": 1}, "opacity": 1.0, "visible": True}],
            "strokes": strokes,
        })
        node["transform"]["anchor"] = {"x": 0, "y": 0}
    elif node_type == "group":
        pass  # Groups have no geometry
    elif node_type == "artboard":
        node.update({
            "width": width,
            "height": height,
            "fills": fills or [{"type": "solid", "color": {"r": 255, "g": 255, "b": 255, "a": 1}, "opacity": 1.0, "visible": True}],
            "clipContent": True,
        })
        node["transform"]["anchor"] = {"x": 0, "y": 0}
    elif node_type == "path":
        # Create a simple line/triangle by default
        node.update({
            "points": [
                {"position": {"x": 0, "y": 0}, "handleIn": None, "handleOut": None, "type": "corner"},
                {"position": {"x": width, "y": 0}, "handleIn": None, "handleOut": None, "type": "corner"},
                {"position": {"x": width / 2, "y": height}, "handleIn": None, "handleOut": None, "type": "corner"},
            ],
            "closed": True,
            "fills": fills,
            "strokes": strokes,
        })
    elif node_type == "image":
        node.update({"src": "", "width": width, "height": height, "naturalWidth": width, "naturalHeight": height, "cornerRadius": [0, 0, 0, 0]})

    try:
        node_id = project.add_node(node, parent_id, page_id)
        if ctx:
            await ctx.info(f"Created {node_type} node: {node_id}")
        return {"status": "success", "nodeId": node_id, "node": node}
    except ValueError as e:
        return {"status": "error", "error": str(e)}


async def update_node(
    node_id: str,
    updates: dict[str, Any],
    page_id: str | None = None,
    ctx: Context | None = None,
) -> dict[str, Any]:
    """Update properties of an existing node.

    Args:
        node_id: ID of the node to update
        updates: Dictionary of properties to update. Supports nested paths like
                 {"transform": {"position": {"x": 100}}} or flat keys like
                 {"name": "New Name", "opacity": 0.5}
        page_id: Page to search in. Defaults to active page.
        ctx: FastMCP context (auto-injected)

    Returns:
        The updated node data
    """
    try:
        project = require_project()
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    if not project.update_node(node_id, updates, page_id):
        return {"status": "error", "error": f"Node '{node_id}' not found"}

    node = project.find_node(node_id, page_id)
    if ctx:
        await ctx.info(f"Updated node: {node_id}")

    return {"status": "success", "node": node}


async def delete_node(node_id: str, page_id: str | None = None, ctx: Context | None = None) -> dict[str, Any]:
    """Delete a node and all its descendants from the scene graph.

    Args:
        node_id: ID of the node to delete
        page_id: Page to search in. Defaults to active page.
        ctx: FastMCP context (auto-injected)

    Returns:
        Status indicating success or failure
    """
    try:
        project = require_project()
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    if not project.delete_node(node_id, page_id):
        return {"status": "error", "error": f"Node '{node_id}' not found"}

    if ctx:
        await ctx.info(f"Deleted node: {node_id}")

    return {"status": "success", "deletedNodeId": node_id}


async def duplicate_node(node_id: str, page_id: str | None = None, ctx: Context | None = None) -> dict[str, Any]:
    """Duplicate a node and all its descendants with new IDs.

    Args:
        node_id: ID of the node to duplicate
        page_id: Page to search in. Defaults to active page.
        ctx: FastMCP context (auto-injected)

    Returns:
        The new duplicated node ID
    """
    try:
        project = require_project()
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    new_id = project.duplicate_node(node_id, page_id)
    if new_id is None:
        return {"status": "error", "error": f"Node '{node_id}' not found"}

    if ctx:
        await ctx.info(f"Duplicated node {node_id} → {new_id}")

    return {"status": "success", "originalNodeId": node_id, "newNodeId": new_id}


async def group_nodes(node_ids: list[str], page_id: str | None = None, ctx: Context | None = None) -> dict[str, Any]:
    """Group multiple nodes into a new group node.

    Args:
        node_ids: List of node IDs to group together
        page_id: Page to search in. Defaults to active page.
        ctx: FastMCP context (auto-injected)

    Returns:
        The new group node ID
    """
    try:
        project = require_project()
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    if len(node_ids) < 1:
        return {"status": "error", "error": "Need at least 1 node to group"}

    # Validate all nodes exist
    for nid in node_ids:
        if project.find_node(nid, page_id) is None:
            return {"status": "error", "error": f"Node '{nid}' not found"}

    # Create group
    group: dict[str, Any] = {"type": "group", "name": "Group"}
    group_id = project.add_node(group, None, page_id)

    nodes = project.get_nodes(page_id)
    root_ids = project.get_root_ids(page_id)

    # Reparent nodes into group
    for nid in node_ids:
        node = project.find_node(nid, page_id)
        if node is None:
            continue

        old_parent = node.get("parent")
        if old_parent:
            parent = project.find_node(old_parent, page_id)
            if parent and nid in parent.get("children", []):
                parent["children"].remove(nid)
        else:
            if nid in root_ids:
                root_ids.remove(nid)

        node["parent"] = group_id

    group_node = project.find_node(group_id, page_id)
    if group_node:
        group_node["children"] = list(node_ids)

    if ctx:
        await ctx.info(f"Grouped {len(node_ids)} nodes into {group_id}")

    return {"status": "success", "groupId": group_id, "childIds": node_ids}


def _hex_to_color(hex_str: str) -> dict[str, Any]:
    """Convert '#RRGGBB' or '#RRGGBBAA' to Color dict."""
    h = hex_str.lstrip("#")
    if len(h) == 6:
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        return {"r": r, "g": g, "b": b, "a": 1.0}
    elif len(h) == 8:
        r, g, b, a = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), int(h[6:8], 16)
        return {"r": r, "g": g, "b": b, "a": round(a / 255, 3)}
    else:
        return {"r": 128, "g": 128, "b": 128, "a": 1.0}
