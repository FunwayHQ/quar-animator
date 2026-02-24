"""Configuration for the Quar MCP server."""

import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    SERVER_NAME = "quar-animator"
    SERVER_DESCRIPTION = "MCP server for Quar Animator — read, modify, and create .quar animation projects"

    # Default project directory (can be overridden via env)
    PROJECTS_DIR = os.getenv("QUAR_PROJECTS_DIR", os.path.expanduser("~/Documents"))

    # File format constants
    QUAR_MAGIC = 0x52415551  # "QUAR" in little-endian
    FORMAT_VERSION = 3
    HEADER_SIZE = 16
