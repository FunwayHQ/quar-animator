---
title: Symbols
order: 10
summary: Draw something once and use it as often as you like — every copy changes when you edit the symbol.
---

A symbol is artwork kept once in the project. Each use of it on a page is an
**instance**: when you edit the symbol, every instance changes with it. Use
symbols for things that appear many times — a logo, a tree, a button, a
character's eye.

Symbols belong to the whole project: the Symbols panel, below the Layers
panel, lists them on every page.

## Make a symbol {#create}

1. Select the layers that make it up.
2. Choose **Edit › Create Symbol** ([[Mod+Shift+K]]).

The layers become a symbol, listed in the Symbols panel (1), and in their place
on the canvas is one instance of it (2), selected. A symbol made of one layer
takes that layer's name; one made of several is called Symbol 1, Symbol 2 and
so on.

![Tutorial 6's symbols page: the Badge symbol in the Symbols panel, and three instances of it in the Layers panel and on the canvas, one selected](img/symbols-panel.png 'The Badge symbol (1), and one of its three instances (2).')

In the Layers panel an instance has an icon of four small diamonds, and no
layers inside it: they're the symbol's.

## Add instances {#place}

- **Click a symbol** in the Symbols panel: a new instance of it is added at the
  middle of the page, where both rulers read 0, and selected. It goes at the
  top of the page's layers, outside any artboard; drag its row into one if you
  want it there.
- **Duplicate an instance** ([[Mod+D]]), or copy and paste it.

Copied into another project, an instance brings its symbol with it.

## Edit a symbol {#edit}

1. Double-click the symbol in the Symbols panel. (Or right-click it and choose
   **Edit Symbol**, or select an instance and click **Edit Symbol** in the
   Properties panel.)
2. The canvas now shows only the symbol's layers, with a banner above them:
   "Editing Symbol: Badge — Click or press Escape to exit" (1). Change them as
   you would any layers.
3. When you're done, click the banner, or click the canvas and press [[Esc]].

![Editing the Badge symbol: its two layers, Star and Disc, in the Layers panel, the badge alone on the canvas, and the banner at the top](img/symbols-editing.png 'Editing a symbol. Click the banner (1) to go back to the page.')

You're back on the page, and every instance shows the change. While you're in
a symbol, undo and redo only go through the changes you make there; the page's
own history comes back with you.

## What an instance can change {#instances}

Each instance has a place of its own on the page. You can:

- move it, resize it with its handles, rotate it and flip it;
- change its **Opacity** and **Blend Mode**, and give it effects such as a
  drop shadow;
- [animate](keyframes.md#animate) all of these, as you would any layer.

What's in it — its shapes, colors and layers — comes from the symbol, the
same in every instance. The **Size** fields don't take typing for an instance:
resize it with its handles.

To change one instance's artwork without changing the others, detach it:
select it and click **Detach** in the Symbol section of the Properties panel
(2), or choose **Edit › Detach Instance**. It becomes an ordinary group of
layers, no longer linked to the symbol.

![The Symbol section of the Properties panel for an instance of Badge, with Edit Symbol and Detach](img/symbols-instance.png 'An instance’s Symbol section: Edit Symbol (1) and Detach (2).')

## Rename or delete a symbol {#manage}

Right-click the symbol in the Symbols panel:

- **Rename:** type the new name and press [[Enter]] ([[Esc]] keeps the old
  one).
- **Delete Symbol:** the symbol goes, and each of its instances becomes
  ordinary layers again (a group of them, when the symbol had several),
  looking just as it did.

> [!CAUTION]
> Undo doesn't bring back a deleted symbol. If you might want it again,
> download a backup first (see [Keep a backup](getting-started.md#backups)).
> Its former instances stay on the page, so you can also make a new symbol from
> one of them.
