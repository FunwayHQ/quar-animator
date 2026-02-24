"""Tools for multi-page project operations."""

from __future__ import annotations

import copy
import time
import uuid
from typing import Any

from fastmcp import Context

from app.project import require_project


def _gen_id(prefix: str = "id") -> str:
    return f"{prefix}_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"


async def list_pages(ctx: Context | None = None) -> dict[str, Any]:
    """List all pages in the current project.

    Returns:
        List of pages with id, name, node count, and active status
    """
    try:
        project = require_project()
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    active_id = project.data.get("activePageId")
    pages = []
    for page in project.data.get("pages", []):
        pages.append({
            "id": page["id"],
            "name": page.get("name", "Untitled"),
            "isActive": page["id"] == active_id,
            "nodeCount": len(page.get("sceneGraph", {}).get("nodes", [])),
            "keyframeCount": sum(
                len(t.get("keyframes", []))
                for t in page.get("timeline", {}).get("tracks", [])
            ),
        })

    return {"status": "success", "pages": pages, "activePageId": active_id}


async def add_page(name: str = "New Page", ctx: Context | None = None) -> dict[str, Any]:
    """Add a new empty page to the project.

    Args:
        name: Name for the new page

    Returns:
        The new page's ID and name
    """
    try:
        project = require_project()
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    page_id = _gen_id("page")
    page = {
        "id": page_id,
        "name": name,
        "sceneGraph": {"nodes": [], "rootNodeIds": []},
        "timeline": {
            "id": _gen_id("timeline"),
            "name": "Main Timeline",
            "duration": project.data.get("settings", {}).get("timelineDuration", 300),
            "frameRate": project.data.get("settings", {}).get("frameRate", 30),
            "tracks": [],
            "markers": [],
        },
    }

    project.data["pages"].append(page)

    if ctx:
        await ctx.info(f"Added page: {name} ({page_id})")

    return {"status": "success", "pageId": page_id, "name": name}


async def delete_page(page_id: str, ctx: Context | None = None) -> dict[str, Any]:
    """Delete a page from the project. Cannot delete the last page.

    Args:
        page_id: ID of the page to delete

    Returns:
        Status and the new active page ID
    """
    try:
        project = require_project()
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    pages = project.data.get("pages", [])
    if len(pages) <= 1:
        return {"status": "error", "error": "Cannot delete the last page"}

    idx = next((i for i, p in enumerate(pages) if p["id"] == page_id), None)
    if idx is None:
        return {"status": "error", "error": f"Page '{page_id}' not found"}

    pages.pop(idx)

    # If we deleted the active page, switch to the first remaining page
    if project.data.get("activePageId") == page_id:
        project.data["activePageId"] = pages[0]["id"]

    if ctx:
        await ctx.info(f"Deleted page: {page_id}")

    return {"status": "success", "deletedPageId": page_id, "activePageId": project.data["activePageId"]}


async def rename_page(page_id: str, name: str, ctx: Context | None = None) -> dict[str, Any]:
    """Rename a page.

    Args:
        page_id: ID of the page to rename
        name: New name for the page

    Returns:
        Status with the updated page info
    """
    try:
        project = require_project()
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    page = project.get_page(page_id)
    if page is None:
        return {"status": "error", "error": f"Page '{page_id}' not found"}

    page["name"] = name

    if ctx:
        await ctx.info(f"Renamed page {page_id} to '{name}'")

    return {"status": "success", "pageId": page_id, "name": name}


async def switch_page(page_id: str, ctx: Context | None = None) -> dict[str, Any]:
    """Switch the active page.

    Args:
        page_id: ID of the page to make active

    Returns:
        Status with the new active page info
    """
    try:
        project = require_project()
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    page = project.get_page(page_id)
    if page is None:
        return {"status": "error", "error": f"Page '{page_id}' not found"}

    project.data["activePageId"] = page_id

    if ctx:
        await ctx.info(f"Switched to page: {page.get('name', page_id)}")

    return {
        "status": "success",
        "activePageId": page_id,
        "name": page.get("name", ""),
        "nodeCount": len(page.get("sceneGraph", {}).get("nodes", [])),
    }


async def duplicate_page(page_id: str, ctx: Context | None = None) -> dict[str, Any]:
    """Duplicate a page with all its nodes and timeline.

    Args:
        page_id: ID of the page to duplicate

    Returns:
        The new page's ID and name
    """
    try:
        project = require_project()
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    page = project.get_page(page_id)
    if page is None:
        return {"status": "error", "error": f"Page '{page_id}' not found"}

    new_page = copy.deepcopy(page)
    new_page["id"] = _gen_id("page")
    new_page["name"] = f"{page.get('name', 'Page')} (Copy)"

    project.data["pages"].append(new_page)

    if ctx:
        await ctx.info(f"Duplicated page: {new_page['name']}")

    return {"status": "success", "pageId": new_page["id"], "name": new_page["name"]}
