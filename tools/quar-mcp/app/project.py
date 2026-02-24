"""
In-memory project state manager.

Holds the currently-opened .quar project and provides CRUD operations
on the scene graph, timeline, and pages.
"""

from __future__ import annotations

import copy
import time
import uuid
from typing import Any


def _gen_id(prefix: str = "id") -> str:
    return f"{prefix}_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"


def _default_transform() -> dict[str, Any]:
    return {
        "position": {"x": 0, "y": 0},
        "rotation": 0,
        "scale": {"x": 1, "y": 1},
        "anchor": {"x": 0.5, "y": 0.5},
        "skew": {"x": 0, "y": 0},
    }


class Project:
    """In-memory representation of a .quar project."""

    def __init__(self, data: dict[str, Any] | None = None):
        if data is None:
            data = self._new_project()
        self.data = data
        self.file_path: str | None = None

    @staticmethod
    def _new_project() -> dict[str, Any]:
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        page_id = _gen_id("page")
        return {
            "version": "3.0",
            "name": "Untitled",
            "createdAt": now,
            "updatedAt": now,
            "pages": [
                {
                    "id": page_id,
                    "name": "Page 1",
                    "sceneGraph": {"nodes": [], "rootNodeIds": []},
                    "timeline": {
                        "id": _gen_id("timeline"),
                        "name": "Main Timeline",
                        "duration": 300,
                        "frameRate": 30,
                        "tracks": [],
                        "markers": [],
                    },
                }
            ],
            "activePageId": page_id,
            "settings": {
                "timelineDuration": 300,
                "frameRate": 30,
                "autoKeyframe": False,
                "onionSkin": {
                    "enabled": False,
                    "beforeCount": 2,
                    "afterCount": 2,
                    "beforeColor": "#FF0000",
                    "afterColor": "#00FFFF",
                    "opacity": 0.3,
                    "falloff": 0.5,
                    "showDuringPlayback": False,
                },
            },
            "symbols": [],
        }

    # ── Page helpers ──────────────────────────────────────────────

    def get_active_page(self) -> dict[str, Any]:
        active_id = self.data["activePageId"]
        for page in self.data["pages"]:
            if page["id"] == active_id:
                return page
        return self.data["pages"][0]

    def get_page(self, page_id: str) -> dict[str, Any] | None:
        for page in self.data["pages"]:
            if page["id"] == page_id:
                return page
        return None

    # ── Scene Graph helpers ───────────────────────────────────────

    def get_nodes(self, page_id: str | None = None) -> list[dict[str, Any]]:
        page = self.get_page(page_id) if page_id else self.get_active_page()
        return page["sceneGraph"]["nodes"]

    def get_root_ids(self, page_id: str | None = None) -> list[str]:
        page = self.get_page(page_id) if page_id else self.get_active_page()
        return page["sceneGraph"]["rootNodeIds"]

    def find_node(self, node_id: str, page_id: str | None = None) -> dict[str, Any] | None:
        for node in self.get_nodes(page_id):
            if node["id"] == node_id:
                return node
        return None

    def add_node(self, node: dict[str, Any], parent_id: str | None = None, page_id: str | None = None) -> str:
        """Add a node to the scene graph. Returns the node ID."""
        if "id" not in node:
            node["id"] = _gen_id("node")
        if "transform" not in node:
            node["transform"] = _default_transform()

        # Set defaults
        node.setdefault("name", node.get("type", "Node"))
        node.setdefault("visible", True)
        node.setdefault("locked", False)
        node.setdefault("opacity", 1.0)
        node.setdefault("blendMode", "normal")
        node.setdefault("children", [])

        nodes = self.get_nodes(page_id)
        root_ids = self.get_root_ids(page_id)

        if parent_id:
            parent = self.find_node(parent_id, page_id)
            if parent is None:
                raise ValueError(f"Parent node '{parent_id}' not found")
            node["parent"] = parent_id
            parent["children"].append(node["id"])
        else:
            node["parent"] = None
            root_ids.append(node["id"])

        nodes.append(node)
        return node["id"]

    def update_node(self, node_id: str, updates: dict[str, Any], page_id: str | None = None) -> bool:
        """Update node properties (shallow merge). Returns True if found."""
        node = self.find_node(node_id, page_id)
        if node is None:
            return False

        for key, value in updates.items():
            if key in ("id", "type"):
                continue  # Never change id or type
            if key == "transform" and isinstance(value, dict):
                # Deep merge transform
                node.setdefault("transform", _default_transform())
                for tk, tv in value.items():
                    if isinstance(tv, dict) and isinstance(node["transform"].get(tk), dict):
                        node["transform"][tk].update(tv)
                    else:
                        node["transform"][tk] = tv
            else:
                node[key] = value

        return True

    def delete_node(self, node_id: str, page_id: str | None = None) -> bool:
        """Remove a node and all descendants. Returns True if found."""
        node = self.find_node(node_id, page_id)
        if node is None:
            return False

        # Collect descendants
        to_remove = set()
        self._collect_descendants(node_id, to_remove, page_id)
        to_remove.add(node_id)

        nodes = self.get_nodes(page_id)
        root_ids = self.get_root_ids(page_id)

        # Remove from parent's children
        parent_id = node.get("parent")
        if parent_id:
            parent = self.find_node(parent_id, page_id)
            if parent and node_id in parent.get("children", []):
                parent["children"].remove(node_id)
        else:
            if node_id in root_ids:
                root_ids.remove(node_id)

        # Remove all collected nodes
        page = self.get_page(page_id) if page_id else self.get_active_page()
        page["sceneGraph"]["nodes"] = [n for n in nodes if n["id"] not in to_remove]

        # Clean up timeline tracks referencing deleted nodes
        timeline = page.get("timeline", {})
        if "tracks" in timeline:
            timeline["tracks"] = [t for t in timeline["tracks"] if t.get("nodeId") not in to_remove]

        return True

    def _collect_descendants(self, node_id: str, result: set[str], page_id: str | None = None) -> None:
        node = self.find_node(node_id, page_id)
        if node is None:
            return
        for child_id in node.get("children", []):
            result.add(child_id)
            self._collect_descendants(child_id, result, page_id)

    def duplicate_node(self, node_id: str, page_id: str | None = None) -> str | None:
        """Deep-clone a node and its descendants with new IDs. Returns new node ID."""
        node = self.find_node(node_id, page_id)
        if node is None:
            return None

        id_map: dict[str, str] = {}
        cloned = self._deep_clone_node(node_id, id_map, page_id)
        if cloned is None:
            return None

        # Offset position slightly
        if "transform" in cloned and "position" in cloned["transform"]:
            cloned["transform"]["position"]["x"] += 20
            cloned["transform"]["position"]["y"] -= 20

        nodes = self.get_nodes(page_id)
        root_ids = self.get_root_ids(page_id)

        parent_id = node.get("parent")
        if parent_id:
            cloned["parent"] = parent_id
            parent = self.find_node(parent_id, page_id)
            if parent:
                parent["children"].append(cloned["id"])
        else:
            cloned["parent"] = None
            root_ids.append(cloned["id"])

        # Add all cloned nodes
        all_cloned = self._flatten_clone(cloned, id_map, page_id)
        nodes.extend(all_cloned)

        return cloned["id"]

    def _deep_clone_node(self, node_id: str, id_map: dict[str, str], page_id: str | None) -> dict[str, Any] | None:
        node = self.find_node(node_id, page_id)
        if node is None:
            return None

        cloned = copy.deepcopy(node)
        new_id = _gen_id("node")
        id_map[node_id] = new_id
        cloned["id"] = new_id

        new_children = []
        for child_id in node.get("children", []):
            child_clone = self._deep_clone_node(child_id, id_map, page_id)
            if child_clone:
                child_clone["parent"] = new_id
                new_children.append(child_clone["id"])

        cloned["children"] = new_children
        return cloned

    def _flatten_clone(self, node: dict[str, Any], id_map: dict[str, str], page_id: str | None) -> list[dict[str, Any]]:
        result = [node]
        for child_id in node.get("children", []):
            # Find the original child's clone
            for orig_id, new_id in id_map.items():
                if new_id == child_id:
                    orig = self.find_node(orig_id, page_id)
                    if orig:
                        cloned_child = copy.deepcopy(orig)
                        cloned_child["id"] = new_id
                        cloned_child["parent"] = node["id"]
                        # Remap children
                        cloned_child["children"] = [id_map.get(c, c) for c in orig.get("children", [])]
                        result.extend(self._flatten_clone(cloned_child, id_map, page_id))
                    break
        return result

    # ── Timeline helpers ──────────────────────────────────────────

    def get_timeline(self, page_id: str | None = None) -> dict[str, Any]:
        page = self.get_page(page_id) if page_id else self.get_active_page()
        return page.get("timeline", {})

    def find_track(self, node_id: str, prop: str, page_id: str | None = None) -> dict[str, Any] | None:
        timeline = self.get_timeline(page_id)
        for track in timeline.get("tracks", []):
            if track["nodeId"] == node_id and track["property"] == prop:
                return track
        return None

    def add_keyframe(
        self,
        node_id: str,
        prop: str,
        frame: int,
        value: Any,
        easing: str | dict = "linear",
        page_id: str | None = None,
    ) -> str:
        """Add a keyframe. Creates the track if needed. Returns keyframe ID."""
        timeline = self.get_timeline(page_id)
        timeline.setdefault("tracks", [])

        track = self.find_track(node_id, prop, page_id)
        if track is None:
            track = {
                "id": _gen_id("track"),
                "nodeId": node_id,
                "property": prop,
                "keyframes": [],
            }
            timeline["tracks"].append(track)

        kf_id = _gen_id("kf")
        keyframe = {
            "id": kf_id,
            "time": frame,
            "value": value,
            "easing": easing,
        }

        # Insert in sorted order, replace if same time exists
        keyframes = track["keyframes"]
        for i, kf in enumerate(keyframes):
            if kf["time"] == frame:
                keyframes[i] = keyframe
                return kf_id
            if kf["time"] > frame:
                keyframes.insert(i, keyframe)
                return kf_id

        keyframes.append(keyframe)
        return kf_id

    def remove_keyframe(self, node_id: str, prop: str, frame: int, page_id: str | None = None) -> bool:
        """Remove keyframe at a specific frame. Returns True if found."""
        track = self.find_track(node_id, prop, page_id)
        if track is None:
            return False

        original_len = len(track["keyframes"])
        track["keyframes"] = [kf for kf in track["keyframes"] if kf["time"] != frame]

        # Auto-cleanup empty tracks
        if not track["keyframes"]:
            timeline = self.get_timeline(page_id)
            timeline["tracks"] = [t for t in timeline["tracks"] if t["id"] != track["id"]]

        return len(track["keyframes"]) < original_len

    def get_keyframes_for_node(self, node_id: str, page_id: str | None = None) -> list[dict[str, Any]]:
        """Get all tracks and keyframes for a node."""
        timeline = self.get_timeline(page_id)
        result = []
        for track in timeline.get("tracks", []):
            if track["nodeId"] == node_id:
                result.append(track)
        return result

    # ── Summary helpers ───────────────────────────────────────────

    def get_summary(self) -> dict[str, Any]:
        """Return a high-level project summary."""
        pages_summary = []
        total_nodes = 0
        total_keyframes = 0

        for page in self.data.get("pages", []):
            node_count = len(page.get("sceneGraph", {}).get("nodes", []))
            kf_count = sum(
                len(t.get("keyframes", []))
                for t in page.get("timeline", {}).get("tracks", [])
            )
            total_nodes += node_count
            total_keyframes += kf_count
            pages_summary.append({
                "id": page["id"],
                "name": page.get("name", "Untitled"),
                "nodeCount": node_count,
                "keyframeCount": kf_count,
            })

        return {
            "name": self.data.get("name", "Untitled"),
            "version": self.data.get("version", "3.0"),
            "pages": pages_summary,
            "totalNodes": total_nodes,
            "totalKeyframes": total_keyframes,
            "symbolCount": len(self.data.get("symbols", [])),
            "settings": self.data.get("settings", {}),
            "filePath": self.file_path,
        }

    def get_node_tree(self, page_id: str | None = None) -> list[dict[str, Any]]:
        """Return a tree representation of the scene graph."""
        root_ids = self.get_root_ids(page_id)
        return [self._build_tree_node(rid, page_id) for rid in root_ids]

    def _build_tree_node(self, node_id: str, page_id: str | None) -> dict[str, Any]:
        node = self.find_node(node_id, page_id)
        if node is None:
            return {"id": node_id, "error": "not found"}

        result = {
            "id": node["id"],
            "name": node.get("name", ""),
            "type": node.get("type", "unknown"),
            "visible": node.get("visible", True),
            "locked": node.get("locked", False),
        }

        children = node.get("children", [])
        if children:
            result["children"] = [self._build_tree_node(cid, page_id) for cid in children]

        return result


# Global project state
_current_project: Project | None = None


def get_current_project() -> Project | None:
    return _current_project


def set_current_project(project: Project | None) -> None:
    global _current_project
    _current_project = project


def require_project() -> Project:
    """Get current project or raise."""
    p = get_current_project()
    if p is None:
        raise ValueError("No project is currently open. Use open_project or create_project first.")
    return p
