"""Prompt templates for common animation tasks."""

from __future__ import annotations


def animate_node(
    task: str = "bounce",
    node_type: str = "rectangle",
    duration_frames: int = 60,
) -> str:
    """Generate a prompt for creating animations on a node.

    Args:
        task: Animation type — bounce, fade, slide, spin, pulse, or a custom description
        node_type: The type of node being animated
        duration_frames: How many frames the animation should span
    """
    return f"""You are animating a {node_type} node in Quar Animator.

Task: Create a "{task}" animation spanning {duration_frames} frames.

Steps:
1. First use `list_nodes` to find the target node
2. Use `list_animatable_properties` to see what can be animated
3. Use `add_keyframe` to set keyframes at key frames

Animation guidelines:
- Frame 0 is the start, frame {duration_frames} is the end
- Use appropriate easing (easeOutCubic for natural motion, easeOutBack for overshoot)
- For bounce: animate transform.position.y with easeOutBounce
- For fade: animate opacity from 0→1 with easeOutCubic
- For slide: animate transform.position.x with easeInOutCubic
- For spin: animate transform.rotation from 0→360 with linear
- For pulse: animate transform.scale.x and .y with easeInOutSine

Coordinate system: Y-up (positive Y goes up visually).
Color channels: r,g,b are 0-255, alpha is 0-1.
"""


def design_scene(
    description: str = "simple animation with shapes",
) -> str:
    """Generate a prompt for designing an animation scene from scratch.

    Args:
        description: Description of the desired scene
    """
    return f"""You are designing an animation scene in Quar Animator.

Description: {description}

Steps:
1. Use `create_project` to start fresh (or `open_project` for existing)
2. Use `add_node` to create shapes (rectangle, ellipse, polygon, path, text)
3. Position nodes using the `x` and `y` parameters
4. Set colors with `fill_color` (hex, e.g., "#FF6B6B")
5. Use `group_nodes` to organize related elements
6. Use `add_keyframe` to animate properties
7. Use `save_project` when done

Tips:
- Layer order: last added = on top
- Group related elements for easier animation
- Use artboards for fixed-size compositions
- Coordinate system is Y-up (origin at center)
- Common canvas sizes: 1920x1080, 1280x720, 800x600
"""
