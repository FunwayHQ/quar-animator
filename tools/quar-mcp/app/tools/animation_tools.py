"""Tools for timeline and keyframe operations."""

from __future__ import annotations

from typing import Any

from fastmcp import Context

from app.project import require_project

# All supported easing function names
EASING_PRESETS = [
    "linear",
    "easeInQuad", "easeOutQuad", "easeInOutQuad",
    "easeInCubic", "easeOutCubic", "easeInOutCubic",
    "easeInQuart", "easeOutQuart", "easeInOutQuart",
    "easeInQuint", "easeOutQuint", "easeInOutQuint",
    "easeInSine", "easeOutSine", "easeInOutSine",
    "easeInExpo", "easeOutExpo", "easeInOutExpo",
    "easeInCirc", "easeOutCirc", "easeInOutCirc",
    "easeInBack", "easeOutBack", "easeInOutBack",
    "easeInElastic", "easeOutElastic", "easeInOutElastic",
    "easeInBounce", "easeOutBounce", "easeInOutBounce",
]

# Common animatable properties per node type
ANIMATABLE_PROPERTIES = {
    "all": [
        "transform.position.x", "transform.position.y",
        "transform.rotation",
        "transform.scale.x", "transform.scale.y",
        "opacity",
    ],
    "rectangle": ["width", "height", "fills.0.color.r", "fills.0.color.g", "fills.0.color.b", "fills.0.color.a", "fills.0.opacity"],
    "ellipse": ["radiusX", "radiusY", "fills.0.color.r", "fills.0.color.g", "fills.0.color.b", "fills.0.color.a", "fills.0.opacity"],
    "polygon": ["radius", "fills.0.color.r", "fills.0.color.g", "fills.0.color.b", "fills.0.color.a", "fills.0.opacity"],
    "text": ["fontSize", "fills.0.color.r", "fills.0.color.g", "fills.0.color.b", "fills.0.color.a"],
    "path": ["points", "fills.0.color.r", "fills.0.color.g", "fills.0.color.b", "fills.0.color.a", "fills.0.opacity"],
    "artboard": ["width", "height"],
}


async def get_timeline(page_id: str | None = None, ctx: Context | None = None) -> dict[str, Any]:
    """Get timeline summary for a page.

    Args:
        page_id: Page to query. Defaults to active page.
        ctx: FastMCP context (auto-injected)

    Returns:
        Timeline metadata with duration, frame rate, track count, total keyframes
    """
    try:
        project = require_project()
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    timeline = project.get_timeline(page_id)
    tracks = timeline.get("tracks", [])
    total_kf = sum(len(t.get("keyframes", [])) for t in tracks)

    track_summaries = []
    for track in tracks:
        kfs = track.get("keyframes", [])
        track_summaries.append({
            "id": track["id"],
            "nodeId": track["nodeId"],
            "property": track["property"],
            "keyframeCount": len(kfs),
            "frameRange": [kfs[0]["time"], kfs[-1]["time"]] if kfs else None,
        })

    return {
        "status": "success",
        "id": timeline.get("id"),
        "name": timeline.get("name", "Main Timeline"),
        "duration": timeline.get("duration", 300),
        "frameRate": timeline.get("frameRate", 30),
        "trackCount": len(tracks),
        "totalKeyframes": total_kf,
        "tracks": track_summaries,
        "markers": timeline.get("markers", []),
    }


async def set_timeline(
    duration: int | None = None,
    frame_rate: int | None = None,
    name: str | None = None,
    page_id: str | None = None,
    ctx: Context | None = None,
) -> dict[str, Any]:
    """Update timeline settings.

    Args:
        duration: Total frames (e.g., 300 = 10 seconds at 30fps)
        frame_rate: Frames per second (e.g., 24, 30, 60)
        name: Timeline name
        page_id: Page to modify. Defaults to active page.
        ctx: FastMCP context (auto-injected)

    Returns:
        Updated timeline settings
    """
    try:
        project = require_project()
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    timeline = project.get_timeline(page_id)

    if duration is not None:
        timeline["duration"] = max(1, duration)
    if frame_rate is not None:
        timeline["frameRate"] = max(1, min(120, frame_rate))
    if name is not None:
        timeline["name"] = name

    if ctx:
        await ctx.info(f"Updated timeline: duration={timeline['duration']}, fps={timeline['frameRate']}")

    return {
        "status": "success",
        "duration": timeline["duration"],
        "frameRate": timeline["frameRate"],
        "name": timeline.get("name"),
    }


async def add_keyframe(
    node_id: str,
    prop: str,
    frame: int,
    value: Any,
    easing: str = "linear",
    page_id: str | None = None,
    ctx: Context | None = None,
) -> dict[str, Any]:
    """Add or update a keyframe for a node property at a specific frame.

    Args:
        node_id: ID of the node to animate
        prop: Property path (e.g., "transform.position.x", "opacity", "width", "fills.0.color.r")
        frame: Frame number (0-based)
        value: The value at this keyframe (number, color dict, etc.)
        easing: Easing function name (e.g., "linear", "easeOutCubic", "easeInOutBack")
                or "cubicBezier:x1,y1,x2,y2" for custom bezier
        page_id: Page to modify. Defaults to active page.
        ctx: FastMCP context (auto-injected)

    Returns:
        The created keyframe with its ID
    """
    try:
        project = require_project()
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    # Validate node exists
    node = project.find_node(node_id, page_id)
    if node is None:
        return {"status": "error", "error": f"Node '{node_id}' not found"}

    # Parse custom bezier easing
    easing_value: str | dict = easing
    if easing.startswith("cubicBezier:"):
        try:
            points = [float(x) for x in easing[12:].split(",")]
            if len(points) != 4:
                return {"status": "error", "error": "cubicBezier needs 4 values: x1,y1,x2,y2"}
            easing_value = {"type": "cubicBezier", "points": points}
        except ValueError:
            return {"status": "error", "error": "Invalid cubicBezier values"}
    elif easing not in EASING_PRESETS:
        return {"status": "error", "error": f"Unknown easing '{easing}'. Use one of: {', '.join(EASING_PRESETS[:10])}... or cubicBezier:x1,y1,x2,y2"}

    kf_id = project.add_keyframe(node_id, prop, frame, value, easing_value, page_id)

    if ctx:
        await ctx.info(f"Added keyframe: {node_id}.{prop} @ frame {frame}")

    return {
        "status": "success",
        "keyframeId": kf_id,
        "nodeId": node_id,
        "property": prop,
        "frame": frame,
        "value": value,
        "easing": easing_value,
    }


async def remove_keyframe(
    node_id: str,
    prop: str,
    frame: int,
    page_id: str | None = None,
    ctx: Context | None = None,
) -> dict[str, Any]:
    """Remove a keyframe at a specific frame.

    Args:
        node_id: ID of the animated node
        prop: Property path
        frame: Frame number of the keyframe to remove
        page_id: Page to modify. Defaults to active page.
        ctx: FastMCP context (auto-injected)

    Returns:
        Status indicating success or failure
    """
    try:
        project = require_project()
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    if not project.remove_keyframe(node_id, prop, frame, page_id):
        return {"status": "error", "error": f"No keyframe found for {node_id}.{prop} at frame {frame}"}

    if ctx:
        await ctx.info(f"Removed keyframe: {node_id}.{prop} @ frame {frame}")

    return {"status": "success", "nodeId": node_id, "property": prop, "frame": frame}


async def list_keyframes(node_id: str, page_id: str | None = None, ctx: Context | None = None) -> dict[str, Any]:
    """List all keyframes for a node across all animated properties.

    Args:
        node_id: ID of the node to query
        page_id: Page to search in. Defaults to active page.
        ctx: FastMCP context (auto-injected)

    Returns:
        Tracks with their keyframes for this node
    """
    try:
        project = require_project()
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    tracks = project.get_keyframes_for_node(node_id, page_id)

    return {
        "status": "success",
        "nodeId": node_id,
        "trackCount": len(tracks),
        "tracks": tracks,
    }


async def list_animatable_properties(node_id: str, page_id: str | None = None, ctx: Context | None = None) -> dict[str, Any]:
    """List animatable properties for a node based on its type.

    Args:
        node_id: ID of the node
        page_id: Page to search in. Defaults to active page.
        ctx: FastMCP context (auto-injected)

    Returns:
        List of property paths that can be keyframed
    """
    try:
        project = require_project()
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    node = project.find_node(node_id, page_id)
    if node is None:
        return {"status": "error", "error": f"Node '{node_id}' not found"}

    node_type = node.get("type", "unknown")
    props = list(ANIMATABLE_PROPERTIES.get("all", []))
    props.extend(ANIMATABLE_PROPERTIES.get(node_type, []))

    return {
        "status": "success",
        "nodeId": node_id,
        "nodeType": node_type,
        "properties": props,
    }
