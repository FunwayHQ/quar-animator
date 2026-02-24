# Quar Animator MCP Server

MCP (Model Context Protocol) server for [Quar Animator](https://animator.quar.pro) — enables AI assistants to read, modify, and create `.quar` animation projects programmatically.

## Features

### 25 Tools

**Project Management** (6 tools)

- `open_project` — Open a `.quar` file (binary or JSON)
- `save_project` — Save project to `.quar` binary format
- `create_project` — Create a new empty project
- `get_project_summary` — Get overview (pages, nodes, keyframes)
- `list_projects` — Find `.quar` files in a directory
- `export_project_json` — Dump full project data as JSON

**Scene Graph** (7 tools)

- `list_nodes` — Tree view of all nodes in the scene graph
- `get_node` — Get full details of a specific node
- `add_node` — Create shapes (rectangle, ellipse, polygon, path, text, group, artboard)
- `update_node` — Modify node properties (position, size, color, opacity, etc.)
- `delete_node` — Remove a node and its descendants
- `duplicate_node` — Clone a node with new IDs
- `group_nodes` — Group multiple nodes together

**Animation** (6 tools)

- `get_timeline` — Timeline summary (duration, fps, tracks)
- `set_timeline` — Update duration, frame rate
- `add_keyframe` — Animate properties with 30+ easing presets or custom cubic bezier
- `remove_keyframe` — Delete a keyframe
- `list_keyframes` — Show all keyframes for a node
- `list_animatable_properties` — What can be animated on a node type

**Pages** (6 tools)

- `list_pages` — Show all pages
- `add_page` / `delete_page` / `rename_page` / `switch_page` / `duplicate_page`

### 4 Resources

- `quar://schema/node-types` — Node type reference
- `quar://schema/easing-functions` — Easing presets and custom bezier
- `quar://schema/animatable-properties` — Property paths per node type
- `quar://schema/color-format` — Color format specification

### 2 Prompts

- `animate_node` — Generate animation instructions
- `design_scene` — Scene design workflow guide

## Quick Start

```bash
cd tools/quar-mcp

# Install dependencies
uv sync

# Run the server
uv run python -m app.main

# Run tests
uv run pytest tests/ -v
```

## Usage with Claude Desktop

Add to your Claude Desktop MCP config (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "quar-animator": {
      "command": "uv",
      "args": ["run", "--directory", "/path/to/tools/quar-mcp", "python", "-m", "app.main"]
    }
  }
}
```

## Example Workflow

```
> Open my animation project
→ open_project("/path/to/my-project.quar")

> Add a blue circle at position (200, 100)
→ add_node(type="ellipse", x=200, y=100, width=80, height=80, fill_color="#4A90D9")

> Animate it bouncing from y=100 to y=300 over 60 frames
→ add_keyframe(node_id, "transform.position.y", frame=0, value=100)
→ add_keyframe(node_id, "transform.position.y", frame=60, value=300, easing="easeOutBounce")

> Save
→ save_project()
```

## .quar File Format

The server reads and writes Quar Animator's native binary format:

```
QUAR magic (4 bytes) | Version (4 bytes) | Flags (4 bytes)
JSON chunk length (4 bytes) | JSON data
Buffer count (4 bytes) | [MIME + binary data per buffer]
```

Images are extracted from data URIs to raw binary buffers (~33% size savings).
Supports v1.0/v2.0/v3.0 with automatic migration.
