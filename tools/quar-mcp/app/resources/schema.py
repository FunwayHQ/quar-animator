"""Resources exposing Quar Animator schema information."""

from __future__ import annotations

import json


def get_node_types() -> str:
    """Available node types and their key properties in Quar Animator."""
    schema = {
        "rectangle": {
            "description": "Rectangle shape with optional corner radius",
            "properties": ["width", "height", "cornerRadius", "fills", "strokes"],
        },
        "ellipse": {
            "description": "Ellipse/circle shape",
            "properties": ["radiusX", "radiusY", "fills", "strokes"],
        },
        "polygon": {
            "description": "Regular polygon (3-12 sides) or star shape",
            "properties": ["sides", "radius", "innerRadius", "cornerRadius", "fills", "strokes"],
        },
        "path": {
            "description": "Bezier path with control points",
            "properties": ["points", "subpaths", "closed", "fillRule", "fills", "strokes"],
        },
        "text": {
            "description": "Text with font properties",
            "properties": ["content", "fontFamily", "fontSize", "fontWeight", "textAlign", "fills", "strokes"],
        },
        "image": {
            "description": "Raster image (PNG/JPG)",
            "properties": ["src", "width", "height", "cornerRadius"],
        },
        "group": {
            "description": "Container for child nodes, supports boolean operations",
            "properties": ["booleanOp"],
        },
        "artboard": {
            "description": "Fixed-size canvas area with background and clipping",
            "properties": ["width", "height", "fills", "clipContent"],
        },
        "bone": {
            "description": "Skeleton bone for rigging",
            "properties": ["length", "boneStyle", "boneColor", "angleMin", "angleMax"],
        },
        "ik-target": {
            "description": "IK chain effector or pole target",
            "properties": ["ikChainId", "targetType"],
        },
        "symbol-instance": {
            "description": "Instance of a reusable symbol/component",
            "properties": ["symbolId", "overrides"],
        },
    }

    common = {
        "all_nodes_have": [
            "id", "name", "type", "parent", "children",
            "transform (position, rotation, scale, anchor, skew)",
            "visible", "locked", "opacity", "blendMode", "effects",
        ],
    }

    return json.dumps({"nodeTypes": schema, "common": common}, indent=2)


def get_easing_functions() -> str:
    """Available easing functions for keyframe interpolation."""
    easings = {
        "presets": {
            "linear": "Constant speed, no acceleration",
            "easeInQuad": "Slow start, quadratic",
            "easeOutQuad": "Slow end, quadratic",
            "easeInOutQuad": "Slow start and end, quadratic",
            "easeInCubic": "Slow start, cubic",
            "easeOutCubic": "Slow end, cubic (most common for UI)",
            "easeInOutCubic": "Slow start and end, cubic",
            "easeInQuart": "Slow start, quartic",
            "easeOutQuart": "Slow end, quartic",
            "easeInOutQuart": "Slow start and end, quartic",
            "easeInQuint": "Slow start, quintic",
            "easeOutQuint": "Slow end, quintic",
            "easeInOutQuint": "Slow start and end, quintic",
            "easeInSine": "Slow start, sinusoidal",
            "easeOutSine": "Slow end, sinusoidal",
            "easeInOutSine": "Slow start and end, sinusoidal",
            "easeInExpo": "Slow start, exponential",
            "easeOutExpo": "Slow end, exponential",
            "easeInOutExpo": "Slow start and end, exponential",
            "easeInCirc": "Slow start, circular",
            "easeOutCirc": "Slow end, circular",
            "easeInOutCirc": "Slow start and end, circular",
            "easeInBack": "Pulls back before accelerating",
            "easeOutBack": "Overshoots then settles",
            "easeInOutBack": "Pull back and overshoot",
            "easeInElastic": "Elastic spring start",
            "easeOutElastic": "Elastic spring end (bouncy settle)",
            "easeInOutElastic": "Elastic both ends",
            "easeInBounce": "Bouncing start",
            "easeOutBounce": "Bouncing end (ball drop)",
            "easeInOutBounce": "Bouncing both ends",
        },
        "custom": {
            "format": "cubicBezier:x1,y1,x2,y2",
            "example": "cubicBezier:0.25,0.1,0.25,1.0",
            "description": "Custom cubic bezier curve. Values are control point coordinates (0-1 range for x, any range for y)",
        },
        "tips": [
            "easeOutCubic is the most natural for UI transitions",
            "easeInOutCubic works well for position animations",
            "easeOutBack gives a playful overshoot effect",
            "easeOutElastic is great for springy/bouncy animations",
            "linear is best for constant-speed movements like scrolling",
        ],
    }
    return json.dumps(easings, indent=2)


def get_animatable_properties() -> str:
    """Animatable property paths organized by node type."""
    props = {
        "universal": {
            "transform.position.x": "Horizontal position (world units)",
            "transform.position.y": "Vertical position (world units, Y-up)",
            "transform.rotation": "Rotation in degrees (0-360)",
            "transform.scale.x": "Horizontal scale multiplier",
            "transform.scale.y": "Vertical scale multiplier",
            "opacity": "Node opacity (0-1)",
        },
        "rectangle": {
            "width": "Rectangle width",
            "height": "Rectangle height",
        },
        "ellipse": {
            "radiusX": "Horizontal radius",
            "radiusY": "Vertical radius",
        },
        "polygon": {
            "radius": "Polygon radius",
        },
        "artboard": {
            "width": "Artboard width",
            "height": "Artboard height",
        },
        "path": {
            "points": "Shape tweening (morphs between path shapes)",
        },
        "color_properties": {
            "fills.0.color.r": "Fill red channel (0-255)",
            "fills.0.color.g": "Fill green channel (0-255)",
            "fills.0.color.b": "Fill blue channel (0-255)",
            "fills.0.color.a": "Fill alpha (0-1)",
            "fills.0.opacity": "Fill opacity (0-1)",
            "strokes.0.color.r": "Stroke red channel (0-255)",
            "strokes.0.color.g": "Stroke green channel (0-255)",
            "strokes.0.color.b": "Stroke blue channel (0-255)",
        },
        "text": {
            "fontSize": "Font size in pixels",
        },
        "coordinate_system": "Y-up: positive Y goes up visually. ArrowUp = +Y.",
    }
    return json.dumps(props, indent=2)


def get_color_format() -> str:
    """Color format used in Quar Animator."""
    info = {
        "format": {"r": "0-255", "g": "0-255", "b": "0-255", "a": "0-1 (alpha)"},
        "hex_input": "Tools accept '#RRGGBB' or '#RRGGBBAA' hex strings",
        "examples": {
            "red": {"r": 255, "g": 0, "b": 0, "a": 1},
            "blue_50_percent": {"r": 0, "g": 0, "b": 255, "a": 0.5},
            "hex_red": "#FF0000",
            "hex_green_half_transparent": "#00FF0080",
        },
    }
    return json.dumps(info, indent=2)
