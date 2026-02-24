"""Tests for MCP tools via FastMCP Client."""

import json
import os
import tempfile

import pytest
from fastmcp import Client

from app.main import mcp
from app.project import set_current_project
from app.quar_format import encode_quar_binary


@pytest.fixture
async def client():
    async with Client(mcp) as c:
        yield c


@pytest.fixture(autouse=True)
def reset_project():
    """Reset project state before each test."""
    set_current_project(None)
    yield
    set_current_project(None)


# ── Project tools ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_project(client):
    result = await client.call_tool("create_project", {"name": "Test Project"})
    data = _parse(result)
    assert data["status"] == "success"
    assert data["name"] == "Test Project"
    assert data["totalNodes"] == 0
    assert len(data["pages"]) == 1


@pytest.mark.asyncio
async def test_get_project_summary_no_project(client):
    result = await client.call_tool("get_project_summary", {})
    data = _parse(result)
    assert data["status"] == "error"
    assert "No project" in data["error"]


@pytest.mark.asyncio
async def test_get_project_summary(client):
    await client.call_tool("create_project", {"name": "My Project"})
    result = await client.call_tool("get_project_summary", {})
    data = _parse(result)
    assert data["status"] == "success"
    assert data["name"] == "My Project"


@pytest.mark.asyncio
async def test_open_save_roundtrip(client):
    # Create and save
    await client.call_tool("create_project", {"name": "Roundtrip"})
    await client.call_tool("add_node", {"node_type": "rectangle", "x": 50, "y": 100})

    with tempfile.NamedTemporaryFile(suffix=".quar", delete=False) as f:
        path = f.name

    try:
        await client.call_tool("save_project", {"file_path": path})

        # Reset and reopen
        set_current_project(None)
        result = await client.call_tool("open_project", {"file_path": path})
        data = _parse(result)
        assert data["status"] == "success"
        assert data["totalNodes"] == 1
    finally:
        os.unlink(path)


@pytest.mark.asyncio
async def test_open_nonexistent_file(client):
    result = await client.call_tool("open_project", {"file_path": "/nonexistent/file.quar"})
    data = _parse(result)
    assert data["status"] == "error"


@pytest.mark.asyncio
async def test_list_projects_invalid_dir(client):
    result = await client.call_tool("list_projects", {"directory": "/nonexistent/dir"})
    data = _parse(result)
    assert data["status"] == "error"


# ── Node tools ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_add_rectangle(client):
    await client.call_tool("create_project", {})
    result = await client.call_tool("add_node", {
        "node_type": "rectangle",
        "name": "Red Box",
        "x": 100,
        "y": 200,
        "width": 150,
        "height": 80,
        "fill_color": "#FF0000",
    })
    data = _parse(result)
    assert data["status"] == "success"
    assert data["node"]["type"] == "rectangle"
    assert data["node"]["width"] == 150
    assert data["node"]["fills"][0]["color"]["r"] == 255


@pytest.mark.asyncio
async def test_add_ellipse(client):
    await client.call_tool("create_project", {})
    result = await client.call_tool("add_node", {"node_type": "ellipse", "width": 200, "height": 100})
    data = _parse(result)
    assert data["status"] == "success"
    assert data["node"]["radiusX"] == 100
    assert data["node"]["radiusY"] == 50


@pytest.mark.asyncio
async def test_add_text(client):
    await client.call_tool("create_project", {})
    result = await client.call_tool("add_node", {"node_type": "text", "content": "Hello World", "font_size": 32})
    data = _parse(result)
    assert data["status"] == "success"
    assert data["node"]["content"] == "Hello World"
    assert data["node"]["fontSize"] == 32


@pytest.mark.asyncio
async def test_add_polygon(client):
    await client.call_tool("create_project", {})
    result = await client.call_tool("add_node", {"node_type": "polygon", "sides": 5, "radius": 60})
    data = _parse(result)
    assert data["status"] == "success"
    assert data["node"]["sides"] == 5


@pytest.mark.asyncio
async def test_add_invalid_type(client):
    await client.call_tool("create_project", {})
    result = await client.call_tool("add_node", {"node_type": "invalid"})
    data = _parse(result)
    assert data["status"] == "error"


@pytest.mark.asyncio
async def test_list_nodes(client):
    await client.call_tool("create_project", {})
    await client.call_tool("add_node", {"node_type": "rectangle", "name": "R1"})
    await client.call_tool("add_node", {"node_type": "ellipse", "name": "E1"})

    result = await client.call_tool("list_nodes", {})
    data = _parse(result)
    assert data["status"] == "success"
    assert data["totalNodes"] == 2
    assert len(data["tree"]) == 2


@pytest.mark.asyncio
async def test_get_node(client):
    await client.call_tool("create_project", {})
    add_result = await client.call_tool("add_node", {"node_type": "rectangle", "name": "Box"})
    node_id = _parse(add_result)["nodeId"]

    result = await client.call_tool("get_node", {"node_id": node_id})
    data = _parse(result)
    assert data["status"] == "success"
    assert data["node"]["name"] == "Box"


@pytest.mark.asyncio
async def test_update_node(client):
    await client.call_tool("create_project", {})
    add_result = await client.call_tool("add_node", {"node_type": "rectangle"})
    node_id = _parse(add_result)["nodeId"]

    result = await client.call_tool("update_node", {
        "node_id": node_id,
        "updates": {"name": "Updated Box", "opacity": 0.5},
    })
    data = _parse(result)
    assert data["status"] == "success"
    assert data["node"]["name"] == "Updated Box"
    assert data["node"]["opacity"] == 0.5


@pytest.mark.asyncio
async def test_update_node_transform(client):
    await client.call_tool("create_project", {})
    add_result = await client.call_tool("add_node", {"node_type": "rectangle"})
    node_id = _parse(add_result)["nodeId"]

    result = await client.call_tool("update_node", {
        "node_id": node_id,
        "updates": {"transform": {"position": {"x": 999}, "rotation": 45}},
    })
    data = _parse(result)
    assert data["node"]["transform"]["position"]["x"] == 999
    assert data["node"]["transform"]["rotation"] == 45
    # Y should be preserved from original
    assert data["node"]["transform"]["position"]["y"] == 0


@pytest.mark.asyncio
async def test_delete_node(client):
    await client.call_tool("create_project", {})
    add_result = await client.call_tool("add_node", {"node_type": "rectangle"})
    node_id = _parse(add_result)["nodeId"]

    result = await client.call_tool("delete_node", {"node_id": node_id})
    data = _parse(result)
    assert data["status"] == "success"

    # Verify it's gone
    tree_result = await client.call_tool("list_nodes", {})
    assert _parse(tree_result)["totalNodes"] == 0


@pytest.mark.asyncio
async def test_duplicate_node(client):
    await client.call_tool("create_project", {})
    add_result = await client.call_tool("add_node", {"node_type": "rectangle", "name": "Original"})
    node_id = _parse(add_result)["nodeId"]

    result = await client.call_tool("duplicate_node", {"node_id": node_id})
    data = _parse(result)
    assert data["status"] == "success"
    assert data["newNodeId"] != node_id

    tree_result = await client.call_tool("list_nodes", {})
    assert _parse(tree_result)["totalNodes"] == 2


@pytest.mark.asyncio
async def test_group_nodes(client):
    await client.call_tool("create_project", {})
    r1 = _parse(await client.call_tool("add_node", {"node_type": "rectangle"}))["nodeId"]
    r2 = _parse(await client.call_tool("add_node", {"node_type": "ellipse"}))["nodeId"]

    result = await client.call_tool("group_nodes", {"node_ids": [r1, r2]})
    data = _parse(result)
    assert data["status"] == "success"
    assert len(data["childIds"]) == 2


@pytest.mark.asyncio
async def test_add_node_with_parent(client):
    await client.call_tool("create_project", {})
    group_result = await client.call_tool("add_node", {"node_type": "group", "name": "Container"})
    group_id = _parse(group_result)["nodeId"]

    child_result = await client.call_tool("add_node", {
        "node_type": "rectangle",
        "parent_id": group_id,
        "name": "Child",
    })
    data = _parse(child_result)
    assert data["status"] == "success"

    # Verify parent-child relationship
    get_result = await client.call_tool("get_node", {"node_id": group_id})
    group = _parse(get_result)["node"]
    assert data["nodeId"] in group["children"]


# ── Animation tools ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_add_keyframe(client):
    await client.call_tool("create_project", {})
    add_result = await client.call_tool("add_node", {"node_type": "rectangle"})
    node_id = _parse(add_result)["nodeId"]

    result = await client.call_tool("add_keyframe", {
        "node_id": node_id,
        "prop": "transform.position.x",
        "frame": 0,
        "value": 0,
    })
    data = _parse(result)
    assert data["status"] == "success"

    result2 = await client.call_tool("add_keyframe", {
        "node_id": node_id,
        "prop": "transform.position.x",
        "frame": 30,
        "value": 500,
        "easing": "easeOutCubic",
    })
    data2 = _parse(result2)
    assert data2["status"] == "success"
    assert data2["easing"] == "easeOutCubic"


@pytest.mark.asyncio
async def test_add_keyframe_cubic_bezier(client):
    await client.call_tool("create_project", {})
    add_result = await client.call_tool("add_node", {"node_type": "rectangle"})
    node_id = _parse(add_result)["nodeId"]

    result = await client.call_tool("add_keyframe", {
        "node_id": node_id,
        "prop": "opacity",
        "frame": 0,
        "value": 1,
        "easing": "cubicBezier:0.25,0.1,0.25,1.0",
    })
    data = _parse(result)
    assert data["status"] == "success"
    assert data["easing"]["type"] == "cubicBezier"


@pytest.mark.asyncio
async def test_add_keyframe_invalid_easing(client):
    await client.call_tool("create_project", {})
    add_result = await client.call_tool("add_node", {"node_type": "rectangle"})
    node_id = _parse(add_result)["nodeId"]

    result = await client.call_tool("add_keyframe", {
        "node_id": node_id,
        "prop": "opacity",
        "frame": 0,
        "value": 1,
        "easing": "invalidEasing",
    })
    data = _parse(result)
    assert data["status"] == "error"


@pytest.mark.asyncio
async def test_list_keyframes(client):
    await client.call_tool("create_project", {})
    add_result = await client.call_tool("add_node", {"node_type": "rectangle"})
    node_id = _parse(add_result)["nodeId"]

    await client.call_tool("add_keyframe", {"node_id": node_id, "prop": "opacity", "frame": 0, "value": 0})
    await client.call_tool("add_keyframe", {"node_id": node_id, "prop": "opacity", "frame": 30, "value": 1})

    result = await client.call_tool("list_keyframes", {"node_id": node_id})
    data = _parse(result)
    assert data["status"] == "success"
    assert data["trackCount"] == 1
    assert len(data["tracks"][0]["keyframes"]) == 2


@pytest.mark.asyncio
async def test_remove_keyframe(client):
    await client.call_tool("create_project", {})
    add_result = await client.call_tool("add_node", {"node_type": "rectangle"})
    node_id = _parse(add_result)["nodeId"]

    await client.call_tool("add_keyframe", {"node_id": node_id, "prop": "opacity", "frame": 0, "value": 0})
    await client.call_tool("add_keyframe", {"node_id": node_id, "prop": "opacity", "frame": 30, "value": 1})

    result = await client.call_tool("remove_keyframe", {"node_id": node_id, "prop": "opacity", "frame": 0})
    data = _parse(result)
    assert data["status"] == "success"

    # Verify only 1 keyframe remains
    kf_result = await client.call_tool("list_keyframes", {"node_id": node_id})
    tracks = _parse(kf_result)["tracks"]
    assert len(tracks[0]["keyframes"]) == 1


@pytest.mark.asyncio
async def test_get_timeline(client):
    await client.call_tool("create_project", {})
    result = await client.call_tool("get_timeline", {})
    data = _parse(result)
    assert data["status"] == "success"
    assert data["duration"] == 300
    assert data["frameRate"] == 30


@pytest.mark.asyncio
async def test_set_timeline(client):
    await client.call_tool("create_project", {})
    result = await client.call_tool("set_timeline", {"duration": 600, "frame_rate": 60})
    data = _parse(result)
    assert data["status"] == "success"
    assert data["duration"] == 600
    assert data["frameRate"] == 60


@pytest.mark.asyncio
async def test_list_animatable_properties(client):
    await client.call_tool("create_project", {})
    add_result = await client.call_tool("add_node", {"node_type": "rectangle"})
    node_id = _parse(add_result)["nodeId"]

    result = await client.call_tool("list_animatable_properties", {"node_id": node_id})
    data = _parse(result)
    assert data["status"] == "success"
    assert "transform.position.x" in data["properties"]
    assert "width" in data["properties"]


# ── Page tools ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_pages(client):
    await client.call_tool("create_project", {})
    result = await client.call_tool("list_pages", {})
    data = _parse(result)
    assert data["status"] == "success"
    assert len(data["pages"]) == 1
    assert data["pages"][0]["isActive"] is True


@pytest.mark.asyncio
async def test_add_and_switch_page(client):
    await client.call_tool("create_project", {})
    add_result = await client.call_tool("add_page", {"name": "Page 2"})
    page_id = _parse(add_result)["pageId"]

    switch_result = await client.call_tool("switch_page", {"page_id": page_id})
    data = _parse(switch_result)
    assert data["status"] == "success"
    assert data["activePageId"] == page_id


@pytest.mark.asyncio
async def test_delete_last_page_fails(client):
    await client.call_tool("create_project", {})
    pages = _parse(await client.call_tool("list_pages", {}))
    page_id = pages["pages"][0]["id"]

    result = await client.call_tool("delete_page", {"page_id": page_id})
    data = _parse(result)
    assert data["status"] == "error"
    assert "last page" in data["error"]


@pytest.mark.asyncio
async def test_rename_page(client):
    await client.call_tool("create_project", {})
    pages = _parse(await client.call_tool("list_pages", {}))
    page_id = pages["pages"][0]["id"]

    result = await client.call_tool("rename_page", {"page_id": page_id, "name": "Renamed"})
    data = _parse(result)
    assert data["status"] == "success"
    assert data["name"] == "Renamed"


@pytest.mark.asyncio
async def test_duplicate_page(client):
    await client.call_tool("create_project", {})
    pages = _parse(await client.call_tool("list_pages", {}))
    page_id = pages["pages"][0]["id"]

    result = await client.call_tool("duplicate_page", {"page_id": page_id})
    data = _parse(result)
    assert data["status"] == "success"

    pages_after = _parse(await client.call_tool("list_pages", {}))
    assert len(pages_after["pages"]) == 2


# ── Resources ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_node_types_resource(client):
    result = await client.read_resource("quar://schema/node-types")
    text = _resource_text(result)
    data = json.loads(text)
    assert "rectangle" in data["nodeTypes"]
    assert "ellipse" in data["nodeTypes"]


@pytest.mark.asyncio
async def test_easing_functions_resource(client):
    result = await client.read_resource("quar://schema/easing-functions")
    text = _resource_text(result)
    data = json.loads(text)
    assert "linear" in data["presets"]
    assert "easeOutCubic" in data["presets"]


@pytest.mark.asyncio
async def test_animatable_properties_resource(client):
    result = await client.read_resource("quar://schema/animatable-properties")
    text = _resource_text(result)
    data = json.loads(text)
    assert "transform.position.x" in data["universal"]


@pytest.mark.asyncio
async def test_color_format_resource(client):
    result = await client.read_resource("quar://schema/color-format")
    text = _resource_text(result)
    data = json.loads(text)
    assert "r" in data["format"]


# ── Helpers ────────────────────────────────────────────────────────


def _parse(result) -> dict:
    """Extract JSON dict from tool result."""
    if hasattr(result, "content"):
        for block in result.content:
            if hasattr(block, "text"):
                return json.loads(block.text)
    # FastMCP Client may return different shapes
    if isinstance(result, list):
        for item in result:
            if hasattr(item, "text"):
                return json.loads(item.text)
    if isinstance(result, str):
        return json.loads(result)
    return result


def _resource_text(result) -> str:
    """Extract text from resource result."""
    if hasattr(result, "content"):
        for block in result.content:
            if hasattr(block, "text"):
                return block.text
    if isinstance(result, list):
        for item in result:
            if hasattr(item, "text"):
                return item.text
    if isinstance(result, str):
        return result
    return str(result)
