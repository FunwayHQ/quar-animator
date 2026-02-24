"""Central registration of all tools, resources, and prompts (DRY pattern)."""

from __future__ import annotations

from fastmcp import FastMCP

# Tools
from app.tools.project_tools import (
    create_project,
    export_project_json,
    get_project_summary,
    list_projects,
    open_project,
    save_project,
)
from app.tools.node_tools import (
    add_node,
    delete_node,
    duplicate_node,
    get_node,
    group_nodes,
    list_nodes,
    update_node,
)
from app.tools.animation_tools import (
    add_keyframe,
    get_timeline,
    list_animatable_properties,
    list_keyframes,
    remove_keyframe,
    set_timeline,
)
from app.tools.page_tools import (
    add_page,
    delete_page,
    duplicate_page,
    list_pages,
    rename_page,
    switch_page,
)

# Resources
from app.resources.schema import (
    get_animatable_properties,
    get_color_format,
    get_easing_functions,
    get_node_types,
)

# Prompts
from app.prompts.animation import animate_node, design_scene


def register_all(mcp: FastMCP) -> None:
    """Register all tools, resources, and prompts with the MCP server."""

    # ── Project tools ─────────────────────────────────────────────
    mcp.tool()(open_project)
    mcp.tool()(save_project)
    mcp.tool()(create_project)
    mcp.tool()(get_project_summary)
    mcp.tool()(list_projects)
    mcp.tool()(export_project_json)

    # ── Node tools ────────────────────────────────────────────────
    mcp.tool()(list_nodes)
    mcp.tool()(get_node)
    mcp.tool()(add_node)
    mcp.tool()(update_node)
    mcp.tool()(delete_node)
    mcp.tool()(duplicate_node)
    mcp.tool()(group_nodes)

    # ── Animation tools ───────────────────────────────────────────
    mcp.tool()(get_timeline)
    mcp.tool()(set_timeline)
    mcp.tool()(add_keyframe)
    mcp.tool()(remove_keyframe)
    mcp.tool()(list_keyframes)
    mcp.tool()(list_animatable_properties)

    # ── Page tools ────────────────────────────────────────────────
    mcp.tool()(list_pages)
    mcp.tool()(add_page)
    mcp.tool()(delete_page)
    mcp.tool()(rename_page)
    mcp.tool()(switch_page)
    mcp.tool()(duplicate_page)

    # ── Resources ─────────────────────────────────────────────────
    mcp.resource("quar://schema/node-types")(get_node_types)
    mcp.resource("quar://schema/easing-functions")(get_easing_functions)
    mcp.resource("quar://schema/animatable-properties")(get_animatable_properties)
    mcp.resource("quar://schema/color-format")(get_color_format)

    # ── Prompts ───────────────────────────────────────────────────
    mcp.prompt()(animate_node)
    mcp.prompt()(design_scene)
