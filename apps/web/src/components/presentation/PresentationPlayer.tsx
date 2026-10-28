/**
 * The presentation player: the page's artboards full screen, one at a
 * time, each playing its own timeline (and sounds) once from the start and
 * holding on its last frame. ↓ / Page Down for the next, ↑ / Page Up for
 * the one before (on the first, to start it over), Escape (or leaving full
 * screen) to go back to editing.
 * It draws a copy of the page as it was when it began, so the editor
 * behind it doesn't move.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { scopeSounds } from '@quar/animation';
import { copyScene, createFrameRenderer, preloadShots } from '@quar/export';
import type { FrameRenderOptions, FrameRendererHandle, FrameSlide } from '@quar/export';

import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { exportRig, getSlides, slideShow } from '../../services/exportScene';
import { SoundPlayer } from '../../services/soundPlayer';
import { useEditorStore } from '../../stores/editorStore';
import { frameAt, moveFor, stopPresentation, usePresentation } from './presentation';
import styles from './PresentationPlayer.module.css';

type Sounds = Pick<SoundPlayer, 'play' | 'stop' | 'prepare' | 'warm' | 'dispose'>;

interface PlayerProps {
  /** Stand-ins, for tests */
  createRenderer?: (options: FrameRenderOptions) => FrameRendererHandle;
  createSoundPlayer?: () => Sounds;
}

/** How long the keys stay on screen at the start. */
const HINT_MS = 3500;
/** How long the pointer stays shown once it stops. */
const POINTER_MS = 2000;

export function PresentationHost(props: PlayerProps) {
  const open = usePresentation((state) => state.open);
  return open ? <PresentationPlayer {...props} /> : null;
}

/** The slides, from a copy of the page as it is now. */
function useDeck() {
  const sceneGraph = useSceneGraph();
  const [deck] = useState(() => {
    const state = useEditorStore.getState();
    const scene = copyScene(sceneGraph);
    const { timeline } = state;
    return {
      slides: getSlides(scene, timeline),
      base: {
        sceneGraph: scene,
        timeline,
        rig: exportRig(state, timeline.frameRate),
        symbols: state.symbols,
      },
      timeline,
      background: state.documentBackground,
      sounds: state.sounds,
    };
  });
  return deck;
}

function PresentationPlayer({
  createRenderer = createFrameRenderer,
  createSoundPlayer = () => new SoundPlayer(),
}: PlayerProps) {
  const deck = useDeck();
  const stage = useRef<HTMLDivElement>(null);
  // The slide shown, and how many times it has been started over
  const [{ index, take }, setShown] = useState({ index: 0, take: 0 });
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [sound] = useState(createSoundPlayer);
  const [hint, setHint] = useState(true);
  const [idle, setIdle] = useState(false);
  // What the drawing loop reads (it runs between React's renders): the
  // slide, and when it began — on its first frame drawn, its pictures loaded
  const showing = useRef<{ index: number; began: number | null }>({ index: 0, began: null });
  const ready = useRef<{ renderer: FrameRendererHandle; show: FrameSlide[] } | null>(null);
  const count = deck.slides.length;
  const slide = deck.slides[index];

  // Nothing to show: straight back
  useEffect(() => {
    if (count === 0) stopPresentation();
  }, [count]);

  // Full screen (where the browser allows it); leaving it ends the presentation
  useEffect(() => {
    const element = stage.current;
    element?.focus();
    // The editor's own playing stops, its sound with it
    useEditorStore.getState().setIsPlaying(false);
    let entered = false;
    void element?.requestFullscreen?.()?.then(
      () => {
        entered = true;
      },
      () => undefined
    );
    const changed = () => {
      if (entered && !document.fullscreenElement) stopPresentation();
    };
    document.addEventListener('fullscreenchange', changed);
    const hide = setTimeout(() => setHint(false), HINT_MS);
    return () => {
      clearTimeout(hide);
      document.removeEventListener('fullscreenchange', changed);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  // The screen's size (it changes once full screen is in)
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const measure = () => {
      const width = element.clientWidth || window.innerWidth;
      const height = element.clientHeight || window.innerHeight;
      setSize((was) => (was?.width === width && was.height === height ? was : { width, height }));
    };
    // The first at once; later ones once a resize settles
    const resized = () => {
      clearTimeout(settle);
      settle = setTimeout(measure, 150);
    };
    measure();
    window.addEventListener('resize', resized);
    document.addEventListener('fullscreenchange', resized);
    return () => {
      clearTimeout(settle);
      window.removeEventListener('resize', resized);
      document.removeEventListener('fullscreenchange', resized);
    };
  }, []);

  // A renderer for the screen's size, each slide fitted to it
  useEffect(() => {
    if (!size || count === 0) return;
    const renderer = createRenderer({
      width: size.width,
      height: size.height,
      multiplier: Math.min(window.devicePixelRatio || 1, 2),
      backgroundColor: deck.background,
    });
    const show = slideShow(deck.slides, deck.base, size.width, size.height);
    let alive = true;
    // Its pictures first (a picture it can't load is drawn as it would be in an export)
    const loaded = () => {
      if (alive) ready.current = { renderer, show };
    };
    void preloadShots(
      renderer,
      show.map((one) => ({ ctx: one.ctx, frame: 0 }))
    ).then(loaded, loaded);
    return () => {
      alive = false;
      if (ready.current?.renderer === renderer) ready.current = null;
      renderer.dispose();
    };
  }, [size, count, deck, createRenderer]);

  // The sounds, decoded ahead; gone with the player
  useEffect(() => {
    sound.warm();
    sound.prepare(deck.sounds);
    return () => sound.dispose();
  }, [sound, deck]);

  // A slide starts from its first frame, shown or started over (the sounds
  // playing stop with the one before, and start again with it)
  useEffect(() => {
    showing.current = { index, began: null };
    return () => sound.stop();
  }, [index, take, sound]);

  // Each screen refresh: the frame the slide has got to, drawn when it changes
  useEffect(() => {
    let frameRequest = 0;
    let drawn: { renderer: FrameRendererHandle; index: number; frame: number } | null = null;
    const tick = () => {
      frameRequest = requestAnimationFrame(tick);
      const shown = ready.current;
      const at = showing.current;
      const current = shown?.show[at.index];
      const slide = deck.slides[at.index];
      if (!shown || !current || !slide) return;
      // Its clock and its sounds start together, with its first frame
      if (at.began === null) {
        at.began = performance.now();
        sound.play(0, {
          clips: scopeSounds(deck.timeline, slide.node.id),
          sounds: deck.sounds,
          frameRate: deck.timeline.frameRate,
          lastFrame: slide.frameCount - 1,
        });
      }
      const frame = frameAt(
        performance.now() - at.began,
        deck.timeline.frameRate,
        current.frameCount
      );
      if (drawn?.renderer === shown.renderer && drawn.index === at.index && drawn.frame === frame) {
        return;
      }
      const canvas = shown.renderer.renderFrame(current.ctx, frame);
      const element = stage.current;
      if (element && canvas.parentElement !== element) {
        element.querySelector('canvas')?.remove();
        canvas.className = styles.frame ?? '';
        element.prepend(canvas);
      }
      drawn = { renderer: shown.renderer, index: at.index, frame };
    };
    frameRequest = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRequest);
  }, [deck, sound]);

  // The keys are the presentation's while it's on: none reach the editor
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      event.stopImmediatePropagation();
      if (event.type !== 'keydown') return;
      if (event.key === 'Escape') {
        event.preventDefault();
        stopPresentation();
        return;
      }
      if (moveFor(event.key, 0, count) === null) return;
      event.preventDefault();
      setShown((at) => {
        const move = moveFor(event.key, at.index, count);
        if (move?.again) return { index: at.index, take: at.take + 1 };
        return move && move.to !== at.index ? { index: move.to, take: 0 } : at;
      });
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('keyup', key, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('keyup', key, true);
    };
  }, [count]);

  // The pointer hides when it rests
  useEffect(() => {
    if (idle) return;
    const rest = setTimeout(() => setIdle(true), POINTER_MS);
    return () => clearTimeout(rest);
  }, [idle]);

  const { r, g, b } = deck.background;
  return createPortal(
    <div
      ref={stage}
      className={styles.stage}
      style={{ background: `rgb(${r} ${g} ${b})` }}
      role="dialog"
      aria-modal="true"
      aria-label="Presentation"
      tabIndex={-1}
      data-own-keys
      data-idle={idle || undefined}
      onPointerMove={() => setIdle(false)}
      data-testid="presentation"
    >
      {slide && (
        <span key={`${index}:${take}`} className={styles.count} aria-hidden="true">
          {index + 1} / {count}
        </span>
      )}
      <span className="visually-hidden" aria-live="polite">
        {slide ? `Slide ${index + 1} of ${count}: ${slide.node.name}` : ''}
      </span>
      {hint && (
        <div className={styles.hint} aria-hidden="true">
          <kbd>↑</kbd>
          <kbd>↓</kbd>
          <span>slides</span>
          <span className={styles.dot} />
          <kbd>Esc</kbd>
          <span>leaves</span>
        </div>
      )}
    </div>,
    document.body
  );
}
