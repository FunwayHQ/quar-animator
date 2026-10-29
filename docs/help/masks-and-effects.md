---
title: Masks, blending and effects
order: 9
summary: Show layers through a shape, combine shapes into one, blend layers with what's behind them, and add shadows and blur.
---

A mask shows layers only through a shape. A boolean group joins shapes, or
cuts one out of another, while keeping them editable. Opacity, blend modes and
effects change how a layer meets what's behind it. All of them can be animated
like anything else.

## Mask layers {#masks}

1. Put the shape that will be the mask on top of the layers it masks, in the
   same group or artboard. It can be a rectangle, an ellipse, a polygon or
   star, a path, text or a [picture](pictures-and-svg.md).
2. In the Layers panel, select the mask and the layers to mask: click one and
   Shift+click the others, or [[Mod]]+click them.
3. Right-click one of them and choose **Create Clip Mask**, **Create Alpha
   Mask** or **Create Luminance Mask** (1).

![The Layers panel with a circle and three rectangles selected, their right-click menu open at the three mask items](img/masks-and-effects-create.png 'Four layers selected, and the menu that masks them (1).')

They go into a new group called Mask, which is selected. The topmost of them
that can be a mask becomes the mask: it isn't drawn itself, it decides what of
the others shows.

![Tutorial 6's mask page: in the Layers panel, the Mask group with its Clip badge and the Window circle marked as its mask source; on the canvas, coloured stripes showing only inside the circle](img/masks-and-effects-mask.png 'The mask group, its kind (1) and its mask (2). The stripes show through the round window.')

In the Layers panel, the group shows its kind (1) — **Clip**, **Alpha** or
**Luma** — and the mask is marked **Mask source** (2).

| Kind          | The layers show                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Clip**      | inside the mask's shape, fully. How opaque the mask is makes no difference.                                               |
| **Alpha**     | as much as the mask is opaque: fully where it's solid, not at all where it's transparent, faded where it fades.           |
| **Luminance** | as much as the mask is bright: fully where it's white, not at all where it's black. A gradient from white to black fades. |

**Change the kind:** right-click the mask group in the Layers panel and
choose **Set Clip Mask**, **Set Alpha Mask** or **Set Luminance Mask** (the
one in use is ticked). **Remove Mask** there makes it an ordinary group again,
with the mask drawn as a layer like the others.

**Add a layer** to the mask: drag its row into the mask group in the Layers
panel. The mask and the masked layers each move and animate on their own, so
you can slide artwork past a still window, as the tutorial does, or move the
window over still artwork.

> [!TIP]
> Tutorial 6, Groups, symbols & masks, has a mask to try on its third page.

## Combine shapes {#booleans}

A boolean group draws two or more shapes as one: joined, cut, overlapped or
excluded. The shapes stay in it, so you can still move or reshape them.

1. Select two or more shapes: rectangles, ellipses, polygons, stars, paths or
   other boolean groups.
2. Choose one of these from **Edit › Boolean**, the canvas's right-click menu,
   or the **Boolean Operations** buttons that the Properties panel shows for
   them:

| Choose        | Shortcut        | The result                                       |
| ------------- | --------------- | ------------------------------------------------ |
| **Union**     | [[Mod+Shift+U]] | all the shapes, joined                           |
| **Subtract**  | [[Mod+Shift+D]] | the bottom shape, with the ones above it cut out |
| **Intersect** | [[Mod+Shift+I]] | only where the shapes overlap                    |
| **Exclude**   | [[Mod+Shift+X]] | where they don't overlap                         |

The group, called Boolean Union, Boolean Subtract and so on, takes its fill
and stroke from the bottom shape. With it selected:

- **Boolean Operation** in the Properties panel (or **Change to…** in the
  canvas's right-click menu) switches to another operation.
- **Flatten Boolean** makes the result one path.
- **Release Boolean** separates the shapes again.

## Opacity {#opacity}

**Opacity**, under Appearance in the Properties panel, makes a whole layer
more or less see-through: drag the slider or type a percentage. A group's
opacity fades everything in it. Each fill and stroke also has an opacity of
its own, beside its color.

## Blend modes {#blend}

A layer's **Blend Mode**, near the end of the Properties panel, mixes its
colors with what's behind it, instead of covering it. **Normal** covers.

| Modes                                              | What they do                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Darken**, **Multiply**, **Color Burn**           | darken: white parts of the layer disappear                                                                          |
| **Lighten**, **Screen**, **Color Dodge**           | lighten: black parts of the layer disappear                                                                         |
| **Overlay**, **Soft Light**, **Hard Light**        | add contrast: darken the darks and lighten the lights                                                               |
| **Difference**, **Exclusion**                      | invert what's behind where the layer is light                                                                       |
| **Hue**, **Saturation**, **Color**, **Luminosity** | take part of the layer's color — its hue, its saturation, both, or its brightness — and the rest from what's behind |

## Shadows and blur {#effects}

The **Effects** section of the Properties panel adds effects to the selected
layer. Click **+** (1) and choose:

- **Drop Shadow:** a shadow behind the layer.
- **Inner Shadow:** a shadow inside its edges.
- **Layer Blur:** blurs the layer itself.

![A blue rectangle on a white artboard with a soft shadow below and to the right of it, and its Drop Shadow settings in the Effects section](img/masks-and-effects-effects.png 'A drop shadow. Add effects with + (1); hide one with its eye (2), remove it with × (3).')

A shadow has a color (click the swatch), **Op** (its opacity), **X** and **Y**
(how far it falls from the layer: a positive Y moves it down), **Blur** (how
soft it is) and **Spread** (how much bigger than the layer it is). A blur has
a **Radius**. Type the values, or drag the names left and right.

A layer can have several effects. The eye (2) hides one for a while; the ×
(3) removes it. With [**Auto-Keyframe**](keyframes.md#auto-keyframe) on,
changing an effect's values adds keyframes, so a shadow can grow or a blur can
clear over time.

> [!NOTE]
> Effects and blend modes are drawn for shapes, text, pictures, boolean groups
> and symbol instances. A plain group's own effects and blend mode don't
> reach the layers in it: to give a group of layers one shadow, make them a
> [symbol](symbols.md) and give the instance the shadow.
