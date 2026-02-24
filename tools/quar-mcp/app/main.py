"""Quar Animator MCP Server — main entry point.

Run with:
    uv run python -m app.main

Or via FastMCP CLI:
    uv run fastmcp run app/main.py
"""

from fastmcp import FastMCP

from app.common import register_all
from app.config import Config

mcp = FastMCP(
    Config.SERVER_NAME,
    instructions=Config.SERVER_DESCRIPTION,
)

register_all(mcp)

if __name__ == "__main__":
    mcp.run()
