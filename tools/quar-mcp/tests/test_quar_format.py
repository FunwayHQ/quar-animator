"""Tests for .quar binary format parser/writer."""

import json

from app.quar_format import (
    decode_quar_binary,
    encode_quar_binary,
    extract_image_buffers,
    is_quar_binary,
    migrate_project,
    restore_image_buffers,
)


def test_is_quar_binary_valid():
    data = encode_quar_binary({"version": "3.0"}, [])
    assert is_quar_binary(data) is True


def test_is_quar_binary_json():
    data = b'{"version": "3.0"}'
    assert is_quar_binary(data) is False


def test_is_quar_binary_too_short():
    assert is_quar_binary(b"QU") is False


def test_encode_decode_roundtrip():
    project = {"version": "3.0", "name": "Test", "pages": []}
    binary = encode_quar_binary(project, [])
    decoded, buffers = decode_quar_binary(binary)
    assert decoded["version"] == "3.0"
    assert decoded["name"] == "Test"
    assert len(buffers) == 0


def test_encode_decode_with_buffers():
    project = {"version": "3.0", "name": "Test"}
    buffers = [("image/png", b"\x89PNG\r\n\x1a\n"), ("image/jpeg", b"\xff\xd8\xff")]
    binary = encode_quar_binary(project, buffers)
    decoded, decoded_buffers = decode_quar_binary(binary)
    assert decoded["name"] == "Test"
    assert len(decoded_buffers) == 2
    assert decoded_buffers[0] == ("image/png", b"\x89PNG\r\n\x1a\n")
    assert decoded_buffers[1] == ("image/jpeg", b"\xff\xd8\xff")


def test_extract_image_buffers():
    import base64

    b64_str = base64.b64encode(b"\x89PNG\r\n").decode()
    data_uri = f"data:image/png;base64,{b64_str}"
    data = {
        "nodes": [
            {"id": "1", "src": data_uri},
            {"id": "2", "src": data_uri},  # duplicate
            {"id": "3", "src": "https://example.com/img.png"},  # URL, not data URI
        ]
    }
    buffers: list = []
    result = extract_image_buffers(data, buffers)

    assert len(buffers) == 1  # deduplicated
    assert result["nodes"][0]["src"] == "buffer:0"
    assert result["nodes"][1]["src"] == "buffer:0"  # same buffer
    assert result["nodes"][2]["src"] == "https://example.com/img.png"


def test_restore_image_buffers():
    import base64

    raw = b"\x89PNG"
    b64 = base64.b64encode(raw).decode()
    data = {"nodes": [{"src": "buffer:0"}, {"src": "buffer:1"}]}
    buffers = [("image/png", raw), ("image/jpeg", b"\xff\xd8")]

    result = restore_image_buffers(data, buffers)
    assert result["nodes"][0]["src"] == f"data:image/png;base64,{b64}"
    assert result["nodes"][1]["src"].startswith("data:image/jpeg;base64,")


def test_restore_invalid_buffer_index():
    data = {"src": "buffer:999"}
    result = restore_image_buffers(data, [])
    assert result["src"] == "buffer:999"  # unchanged


def test_full_roundtrip_with_images():
    import base64

    raw_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00"
    b64_str = base64.b64encode(raw_png).decode()
    data_uri = f"data:image/png;base64,{b64_str}"

    project = {"version": "3.0", "pages": [{"nodes": [{"id": "img1", "src": data_uri}]}]}

    # Extract → encode → decode → restore
    buffers: list = []
    json_data = extract_image_buffers(project, buffers)
    assert json_data["pages"][0]["nodes"][0]["src"] == "buffer:0"

    binary = encode_quar_binary(json_data, buffers)
    decoded_json, decoded_buffers = decode_quar_binary(binary)
    restored = restore_image_buffers(decoded_json, decoded_buffers)

    assert restored["pages"][0]["nodes"][0]["src"] == data_uri


def test_migrate_v1_to_v3():
    v1 = {
        "version": "1.0",
        "name": "Old Project",
        "sceneGraph": {"nodes": [{"id": "n1"}], "rootNodeIds": ["n1"]},
        "timeline": {"id": "t1", "tracks": [], "markers": [], "duration": 100, "frameRate": 24},
    }

    result = migrate_project(v1)
    assert result["version"] == "3.0"
    assert len(result["pages"]) == 1
    assert result["pages"][0]["sceneGraph"]["nodes"][0]["id"] == "n1"
    assert result["activePageId"] == "page_default"


def test_migrate_v2_to_v3():
    v2 = {
        "version": "2.0",
        "name": "V2 Project",
        "pages": [{"id": "p1", "name": "Page 1"}],
        "activePageId": "p1",
    }

    result = migrate_project(v2)
    assert result["version"] == "3.0"
    assert result["pages"][0]["id"] == "p1"


def test_migrate_v3_unchanged():
    v3 = {"version": "3.0", "name": "Current"}
    result = migrate_project(v3)
    assert result["version"] == "3.0"
    assert result["name"] == "Current"


def test_decode_invalid_magic():
    import struct

    bad_data = struct.pack("<I", 0xDEADBEEF) + b"\x00" * 12
    try:
        decode_quar_binary(bad_data)
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "Invalid magic" in str(e)


def test_decode_too_small():
    try:
        decode_quar_binary(b"\x00\x01")
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "too small" in str(e)
