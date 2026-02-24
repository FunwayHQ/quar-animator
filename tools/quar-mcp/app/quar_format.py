"""
.quar binary file format parser and writer.

Binary layout (little-endian):
  4 bytes  - Magic: 0x52415551 ("QUAR")
  4 bytes  - Format version (uint32)
  4 bytes  - Flags (uint32, reserved)
  4 bytes  - JSON chunk length (uint32)
  N bytes  - JSON data (UTF-8)
  4 bytes  - Buffer count (uint32)
  Per buffer:
    4 bytes  - Data length (uint32)
    4 bytes  - MIME type length (uint32)
    M bytes  - MIME type string (UTF-8)
    D bytes  - Raw binary data
"""

from __future__ import annotations

import base64
import json
import re
import struct
from typing import Any

from app.config import Config

DATA_URI_PATTERN = re.compile(r"^data:(image/[^;]+);base64,(.+)$")


def decode_quar_binary(data: bytes) -> tuple[dict[str, Any], list[tuple[str, bytes]]]:
    """Decode a .quar binary file into (json_data, image_buffers).

    Returns:
        Tuple of (project_json, list of (mime_type, raw_bytes) pairs)
    """
    if len(data) < Config.HEADER_SIZE:
        raise ValueError("File too small to be a valid .quar file")

    offset = 0

    # Read header
    magic = struct.unpack_from("<I", data, offset)[0]
    offset += 4
    if magic != Config.QUAR_MAGIC:
        raise ValueError(f"Invalid magic bytes: expected 0x{Config.QUAR_MAGIC:08X}, got 0x{magic:08X}")

    version = struct.unpack_from("<I", data, offset)[0]
    offset += 4

    _flags = struct.unpack_from("<I", data, offset)[0]
    offset += 4

    # Read JSON chunk
    json_length = struct.unpack_from("<I", data, offset)[0]
    offset += 4

    json_bytes = data[offset : offset + json_length]
    offset += json_length
    project_json = json.loads(json_bytes.decode("utf-8"))

    # Read binary buffers
    buffers: list[tuple[str, bytes]] = []
    if offset < len(data):
        buffer_count = struct.unpack_from("<I", data, offset)[0]
        offset += 4

        for _ in range(buffer_count):
            data_length = struct.unpack_from("<I", data, offset)[0]
            offset += 4
            mime_length = struct.unpack_from("<I", data, offset)[0]
            offset += 4
            mime_type = data[offset : offset + mime_length].decode("utf-8")
            offset += mime_length
            buffer_data = data[offset : offset + data_length]
            offset += data_length
            buffers.append((mime_type, buffer_data))

    return project_json, buffers


def encode_quar_binary(project_json: dict[str, Any], buffers: list[tuple[str, bytes]]) -> bytes:
    """Encode project JSON and image buffers into .quar binary format."""
    json_bytes = json.dumps(project_json, separators=(",", ":")).encode("utf-8")

    parts: list[bytes] = []

    # Header
    parts.append(struct.pack("<I", Config.QUAR_MAGIC))
    parts.append(struct.pack("<I", Config.FORMAT_VERSION))
    parts.append(struct.pack("<I", 0))  # flags

    # JSON chunk
    parts.append(struct.pack("<I", len(json_bytes)))
    parts.append(json_bytes)

    # Buffers
    parts.append(struct.pack("<I", len(buffers)))
    for mime_type, buf_data in buffers:
        mime_bytes = mime_type.encode("utf-8")
        parts.append(struct.pack("<I", len(buf_data)))
        parts.append(struct.pack("<I", len(mime_bytes)))
        parts.append(mime_bytes)
        parts.append(buf_data)

    return b"".join(parts)


def extract_image_buffers(obj: Any, buffers: list[tuple[str, bytes]], seen: dict[str, int] | None = None) -> Any:
    """Walk JSON tree, extract data URI 'src' fields to binary buffers.

    Replaces data URIs with 'buffer:N' references. Deduplicates identical images.
    """
    if seen is None:
        seen = {}

    if isinstance(obj, dict):
        result = {}
        for key, value in obj.items():
            if key == "src" and isinstance(value, str):
                match = DATA_URI_PATTERN.match(value)
                if match:
                    if value in seen:
                        result[key] = f"buffer:{seen[value]}"
                    else:
                        mime_type = match.group(1)
                        raw = base64.b64decode(match.group(2))
                        idx = len(buffers)
                        buffers.append((mime_type, raw))
                        seen[value] = idx
                        result[key] = f"buffer:{idx}"
                else:
                    result[key] = value
            else:
                result[key] = extract_image_buffers(value, buffers, seen)
        return result
    elif isinstance(obj, list):
        return [extract_image_buffers(item, buffers, seen) for item in obj]
    else:
        return obj


def restore_image_buffers(obj: Any, buffers: list[tuple[str, bytes]]) -> Any:
    """Walk JSON tree, restore 'buffer:N' references to data URIs."""
    if isinstance(obj, dict):
        result = {}
        for key, value in obj.items():
            if key == "src" and isinstance(value, str) and value.startswith("buffer:"):
                idx = int(value.split(":")[1])
                if 0 <= idx < len(buffers):
                    mime_type, raw = buffers[idx]
                    b64 = base64.b64encode(raw).decode("ascii")
                    result[key] = f"data:{mime_type};base64,{b64}"
                else:
                    result[key] = value
            else:
                result[key] = restore_image_buffers(value, buffers)
        return result
    elif isinstance(obj, list):
        return [restore_image_buffers(item, buffers) for item in obj]
    else:
        return obj


def is_quar_binary(data: bytes) -> bool:
    """Check if data starts with .quar magic bytes."""
    if len(data) < 4:
        return False
    magic = struct.unpack_from("<I", data, 0)[0]
    return magic == Config.QUAR_MAGIC


def load_quar_file(path: str) -> dict[str, Any]:
    """Load a .quar file (binary or JSON) and return project data."""
    with open(path, "rb") as f:
        data = f.read()

    if is_quar_binary(data):
        project_json, buffers = decode_quar_binary(data)
        project_json = restore_image_buffers(project_json, buffers)
    else:
        project_json = json.loads(data.decode("utf-8"))

    return migrate_project(project_json)


def save_quar_file(path: str, project: dict[str, Any]) -> None:
    """Save project data to a .quar binary file."""
    buffers: list[tuple[str, bytes]] = []
    json_data = extract_image_buffers(project, buffers)
    binary = encode_quar_binary(json_data, buffers)

    with open(path, "wb") as f:
        f.write(binary)


def migrate_project(data: dict[str, Any]) -> dict[str, Any]:
    """Migrate project data through version chain to latest (v3.0)."""
    version = data.get("version", "1.0")

    if version == "1.0":
        data = migrate_v1_to_v2(data)
        version = "2.0"

    if version == "2.0":
        data = migrate_v2_to_v3(data)

    return data


def migrate_v1_to_v2(data: dict[str, Any]) -> dict[str, Any]:
    """Migrate v1.0 (single page) to v2.0 (multi-page)."""
    page = {
        "id": "page_default",
        "name": "Page 1",
        "sceneGraph": data.get("sceneGraph", {"nodes": [], "rootNodeIds": []}),
        "timeline": data.get("timeline", _default_timeline()),
    }

    return {
        "version": "2.0",
        "name": data.get("name", "Untitled"),
        "createdAt": data.get("createdAt", ""),
        "updatedAt": data.get("updatedAt", ""),
        "pages": [page],
        "activePageId": "page_default",
        "settings": data.get("settings", _default_settings()),
        "symbols": data.get("symbols", []),
    }


def migrate_v2_to_v3(data: dict[str, Any]) -> dict[str, Any]:
    """Migrate v2.0 to v3.0 (binary format support)."""
    data["version"] = "3.0"
    return data


def _default_timeline() -> dict[str, Any]:
    return {
        "id": "timeline_default",
        "name": "Main Timeline",
        "duration": 300,
        "frameRate": 30,
        "tracks": [],
        "markers": [],
    }


def _default_settings() -> dict[str, Any]:
    return {
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
    }
