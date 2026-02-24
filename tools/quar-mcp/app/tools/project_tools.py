"""Tools for project-level operations: open, save, create, list."""

from __future__ import annotations

import glob
import json
import os
from typing import Any

from fastmcp import Context

from app.config import Config
from app.project import Project, get_current_project, require_project, set_current_project
from app.quar_format import load_quar_file, save_quar_file


async def open_project(file_path: str, ctx: Context | None = None) -> dict[str, Any]:
    """Open a .quar file and load it as the active project.

    Args:
        file_path: Absolute or relative path to a .quar file
        ctx: FastMCP context (auto-injected)

    Returns:
        Project summary with page list, node/keyframe counts, and settings
    """
    if not os.path.exists(file_path):
        return {"status": "error", "error": f"File not found: {file_path}"}

    if ctx:
        await ctx.info(f"Opening project: {file_path}")

    try:
        data = load_quar_file(file_path)
        project = Project(data)
        project.file_path = os.path.abspath(file_path)
        set_current_project(project)

        if ctx:
            await ctx.info("Project loaded successfully")

        return {"status": "success", **project.get_summary()}
    except Exception as e:
        return {"status": "error", "error": str(e)}


async def save_project(file_path: str | None = None, ctx: Context | None = None) -> dict[str, Any]:
    """Save the current project to a .quar file.

    Args:
        file_path: Path to save to. If omitted, saves to the original file path.
        ctx: FastMCP context (auto-injected)

    Returns:
        Status with the saved file path
    """
    try:
        project = require_project()
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    path = file_path or project.file_path
    if not path:
        return {"status": "error", "error": "No file path specified and project has no original path"}

    if ctx:
        await ctx.info(f"Saving project to: {path}")

    try:
        save_quar_file(path, project.data)
        project.file_path = os.path.abspath(path)

        if ctx:
            await ctx.info("Project saved successfully")

        return {"status": "success", "filePath": project.file_path}
    except Exception as e:
        return {"status": "error", "error": str(e)}


async def create_project(name: str = "Untitled", ctx: Context | None = None) -> dict[str, Any]:
    """Create a new empty project and set it as active.

    Args:
        name: Project name
        ctx: FastMCP context (auto-injected)

    Returns:
        Project summary
    """
    project = Project()
    project.data["name"] = name
    set_current_project(project)

    if ctx:
        await ctx.info(f"Created new project: {name}")

    return {"status": "success", **project.get_summary()}


async def get_project_summary(ctx: Context | None = None) -> dict[str, Any]:
    """Get a summary of the currently open project.

    Returns:
        Project summary with pages, node counts, keyframe counts, settings
    """
    try:
        project = require_project()
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    return {"status": "success", **project.get_summary()}


async def list_projects(directory: str | None = None, ctx: Context | None = None) -> dict[str, Any]:
    """List .quar files in a directory.

    Args:
        directory: Directory to search. Defaults to QUAR_PROJECTS_DIR.
        ctx: FastMCP context (auto-injected)

    Returns:
        List of .quar files with name and size
    """
    search_dir = directory or Config.PROJECTS_DIR

    if not os.path.isdir(search_dir):
        return {"status": "error", "error": f"Directory not found: {search_dir}"}

    pattern = os.path.join(search_dir, "**", "*.quar")
    files = glob.glob(pattern, recursive=True)

    result = []
    for f in sorted(files):
        stat = os.stat(f)
        result.append({
            "path": f,
            "name": os.path.basename(f),
            "sizeBytes": stat.st_size,
            "modified": stat.st_mtime,
        })

    return {"status": "success", "directory": search_dir, "files": result, "count": len(result)}


async def export_project_json(ctx: Context | None = None) -> dict[str, Any]:
    """Export the current project data as readable JSON (for debugging/inspection).

    Returns:
        The full project JSON data
    """
    try:
        project = require_project()
    except ValueError as e:
        return {"status": "error", "error": str(e)}

    return {"status": "success", "data": project.data}
