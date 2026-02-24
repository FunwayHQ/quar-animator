"""Shared fixtures for tests."""

import pytest
from fastmcp import Client

from app.main import mcp


@pytest.fixture
async def client():
    """Provide a FastMCP test client."""
    async with Client(mcp) as c:
        yield c
