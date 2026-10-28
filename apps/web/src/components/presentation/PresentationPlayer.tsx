/**
 * The presentation player: the page's artboards full screen, one at a
 * time, each playing its own timeline (and sounds) once from the start and
 * holding on its last frame. ↓ / Page Down for the next, ↑ / Page Up for
 * the one before (on the first, to start it over), Escape (or leaving full
 * screen) to go back to editing.
 * Moving on plays the transition into the next slide, if it has one: the
 * outgoing slide held on the frame it got to, the incoming one on its
 * first; then the incoming slide's timeline and sounds start. ↓ again
 * during it skips to its end. Going back (and Home, End) cuts.
 * It draws a copy of the page as it was when it began, so the editor
 * behind it doesn't move. The first slide starts once all of them are
 * ready (their pictures, the sounds they play, their fonts); a loading
 * screen shows how far that has got, if it takes more than a moment.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { scopeSounds } from '@quar/animation';
import { copyScene, createFrameRenderer, createShotRenderer, preloadShots } from '@quar/export';
import type {
  FrameRenderOptions,
  FrameRendererHandle,
  FrameSlide,
  ShotRenderer,
} from '@quar/export';
import { transitionDirection } from '@quar/animation';
import type { SlideTransition } from '@quar/types';

import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { fontsToLoad, googleFontsUsed, loadFont, type FontUse } from '../../services/documentFonts';
import { exportRig, getSlides, slideShow } from '../../services/exportScene';
import { SoundPlayer } from '../../services/soundPlayer';
import { useEditorStore } from '../../stores/editorStore';
import {
  FORWARD,
  frameAt,
  moveFor,
  stopPresentation,
  transitionAt,
  transitionFor,
  usePresentation,
} from './presentation';
import { PresentationLoader, type Preparing } from './PresentationLoader';
import styles from './PresentationPlayer.module.css';

type Sounds = Pick<SoundPlayer, 'play' | 'stop' | 'prepare' | 'warm' | 'dispose'>;

interface PlayerProps {
  /** Stand-ins, for tests */
  createRenderer?: (options: FrameRenderOptions) => FrameRendererHandle;
  createSoundPlayer?: () => Sounds;
  loadFont?: (font: FontUse) => Promise<unknown>;
}

/** How long the keys stay on screen once the first slide starts. */
const HINT_MS = 3500;
/** How long the pointer stays shown once it stops. */
const POINTER_MS = 2000;
/** How long getting ready may take before the loading screen comes up (less, and it would flash). */
export const LOADER_DELAY_MS = 180;
/** How long the loading screen stays up at least, once it's up (so it can be read, not flashed). */
export const LOADER_MIN_MS = 500;
/** How long the loading screen takes to fade, the first slide's first frame under it. */
export const LOADER_LEAVE_MS = 280;
/** How long a font may take to arrive before the slides start without it (it comes from the network). */
const FONT_WAIT_MS = 8000;

/**
 * Where the player is: getting ready (quietly at first, then with the
 * loading screen up), the loading screen going, then playing.
 */
type Phase = 'quiet' | 'loading' | 'leaving' | 'playing';

const later = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** How a slide came on: through the transition into it from slide `from`, held on `frame`. */
interface Entrance {
  from: number;
  frame: number;
  transition: SlideTransition;
}

/** What the drawing loop is showing (it runs between React's renders). */
interface Showing {
  index: number;
  /** When the slide's own timeline began (with its first frame drawn, once playing) */
  began: number | null;
  /** The frame of its timeline last drawn */
  frame: number;
  /** The transition it's coming on through, while it plays (when it began: on its first frame drawn) */
  entering: (Entrance & { began: number | null }) | null;
}

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
    const slides = getSlides(scene, timeline);
    // What they wait for: the sounds their clips play, the fonts their text is in
    const played = new Set(
      slides.flatMap((slide) => scopeSounds(timeline, slide.node.id).map((clip) => clip.soundId))
    );
    const shown = slides.flatMap((slide) => [slide.node, ...scene.getDescendants(slide.node.id)]);
    return {
      slides,
      base: {
        sceneGraph: scene,
        timeline,
        rig: exportRig(state, timeline.frameRate),
        symbols: state.symbols,
      },
      timeline,
      background: state.documentBackground,
      sounds: state.sounds,
      played: state.sounds.filter((sound) => played.has(sound.id)),
      fonts: fontsToLoad(googleFontsUsed(shown, state.symbols)),
    };
  });
  return deck;
}

function PresentationPlayer({
  createRenderer = createFrameRenderer,
  createSoundPlayer = () => new SoundPlayer(),
  loadFont: loadEach = loadFont,
}: PlayerProps) {
  const deck = useDeck();
  const stage = useRef<HTMLDivElement>(null);
  // The slide shown, how many times it has been started over, and how it came on
  const [{ index, take, entrance }, setShown] = useState<{
    index: number;
    take: number;
    entrance: Entrance | null;
  }>({ index: 0, take: 0, entrance: null });
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [sound] = useState(createSoundPlayer);
  const [load] = useState(() => loadEach);
  const [hint, setHint] = useState(true);
  const [idle, setIdle] = useState(false);
  const [phase, setPhase] = useState<Phase>('quiet');
  // Getting ready: how far each part has got; the pictures of the renderer
  // in use loaded; the sounds decoded and the fonts in
  const [preparing, setPreparing] = useState<Preparing>(() => ({
    slides: { done: 0, total: deck.slides.length },
    sounds: { done: 0, total: deck.played.length },
    fonts: { done: 0, total: deck.fonts.length },
  }));
  const [pictures, setPictures] = useState(false);
  const [assets, setAssets] = useState(false);
  // What the drawing loop reads (it runs between React's renders): the
  // slide, and when it began (with its first frame drawn, once playing),
  // the renderer whose pictures are in, and the phase
  const showing = useRef<Showing>({ index: 0, began: null, frame: 0, entering: null });
  const ready = useRef<{
    renderer: FrameRendererHandle;
    shots: ShotRenderer;
    show: FrameSlide[];
  } | null>(null);
  const phaseNow = useRef<Phase>(phase);
  const loaderUp = useRef(0);
  const count = deck.slides.length;
  const slide = deck.slides[index];
  const first = deck.slides[0];
  const playing = phase === 'playing';

  // Nothing to show: straight back
  useEffect(() => {
    if (count === 0) stopPresentation();
  }, [count]);

  useEffect(() => {
    phaseNow.current = phase;
  }, [phase]);

  // Not ready in a moment: the loading screen comes up
  useEffect(() => {
    if (phase !== 'quiet') return;
    const wait = setTimeout(() => {
      loaderUp.current = performance.now();
      setPhase('loading');
    }, LOADER_DELAY_MS);
    return () => clearTimeout(wait);
  }, [phase]);

  // Ready: straight on, or the loading screen goes, once it has been up long enough to read
  useEffect(() => {
    if (!pictures || !assets) return;
    if (phase === 'quiet') {
      setPhase('playing');
      return;
    }
    if (phase !== 'loading') return;
    const shownFor = performance.now() - loaderUp.current;
    const wait = setTimeout(() => setPhase('leaving'), Math.max(0, LOADER_MIN_MS - shownFor));
    return () => clearTimeout(wait);
  }, [pictures, assets, phase]);

  // The loading screen fades over the first slide's first frame; then it plays
  useEffect(() => {
    if (phase !== 'leaving') return;
    const wait = setTimeout(() => setPhase('playing'), LOADER_LEAVE_MS);
    return () => clearTimeout(wait);
  }, [phase]);

  // The keys, for a while once the first slide starts
  useEffect(() => {
    if (!playing) return;
    const hide = setTimeout(() => setHint(false), HINT_MS);
    return () => clearTimeout(hide);
  }, [playing]);

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
    return () => {
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
      if (!alive) return;
      // Transitions drawn from the two slides' held frames, over the page's background
      ready.current = {
        renderer,
        shots: createShotRenderer(renderer, { background: deck.background }),
        show,
      };
      setPictures(true);
    };
    // Told slide by slide (a renderer made again for a new size loads them
    // again, but what's shown doesn't go back)
    const progress = (done: number) => {
      if (!alive) return;
      setPreparing((was) =>
        done > was.slides.done ? { ...was, slides: { ...was.slides, done } } : was
      );
    };
    void preloadShots(
      renderer,
      show.map((one) => ({ ctx: one.ctx, frame: 0 })),
      progress
    ).then(loaded, loaded);
    return () => {
      alive = false;
      if (ready.current?.renderer === renderer) ready.current = null;
      setPictures(false);
      renderer.dispose();
    };
  }, [size, count, deck, createRenderer]);

  // The sounds the slides play, decoded ahead, and the fonts their text is
  // set in (each given a while); the sounds gone with the player
  useEffect(() => {
    let alive = true;
    const step = (part: 'sounds' | 'fonts') => () => {
      if (!alive) return;
      setPreparing((was) => ({ ...was, [part]: { ...was[part], done: was[part].done + 1 } }));
    };
    sound.warm();
    const sounds = sound.prepare(deck.played, step('sounds'));
    const fonts = deck.fonts.map((font) =>
      Promise.race([load(font).catch(() => null), later(FONT_WAIT_MS)]).then(step('fonts'))
    );
    const done = () => {
      if (alive) setAssets(true);
    };
    void Promise.all([sounds, ...fonts]).then(done, done);
    return () => {
      alive = false;
      sound.dispose();
    };
  }, [sound, deck, load]);

  // A slide starts from its first frame, shown or started over — after the
  // transition into it, if it came on through one (the sounds playing stop
  // with the one before, and start again with it)
  useEffect(() => {
    showing.current = {
      index,
      began: null,
      frame: 0,
      entering: entrance ? { ...entrance, began: null } : null,
    };
    return () => sound.stop();
  }, [index, take, entrance, sound]);

  // Each screen refresh: the frame the slide has got to, drawn when it changes
  useEffect(() => {
    let frameRequest = 0;
    // What's on screen: a slide's frame, or a transition into it (how far it had got)
    let drawn: {
      renderer: FrameRendererHandle;
      index: number;
      frame: number;
      progress: number | null;
    } | null = null;
    const put = (canvas: HTMLCanvasElement) => {
      const element = stage.current;
      if (element && canvas.parentElement !== element) {
        element.querySelector('canvas')?.remove();
        canvas.className = styles.frame ?? '';
        element.prepend(canvas);
      }
    };
    const tick = () => {
      frameRequest = requestAnimationFrame(tick);
      const shown = ready.current;
      const at = showing.current;
      const current = shown?.show[at.index];
      const slide = deck.slides[at.index];
      const now = phaseNow.current;
      // Nothing while getting ready; as the loading screen goes, the first frame, waiting
      if (!shown || !current || !slide || now === 'quiet' || now === 'loading') return;
      // Coming on through a transition: the two slides held, blended as far as it has got
      const entering = at.entering;
      const outgoing = entering ? shown.show[entering.from] : undefined;
      if (entering && outgoing && now === 'playing') {
        entering.began ??= performance.now();
        const { progress, done } = transitionAt(
          performance.now() - entering.began,
          entering.transition
        );
        if (!done) {
          if (
            drawn?.renderer !== shown.renderer ||
            drawn.index !== at.index ||
            drawn.progress !== progress
          ) {
            put(
              shown.shots.render({
                ctx: current.ctx,
                frame: 0,
                transition: {
                  from: { ctx: outgoing.ctx, frame: entering.frame },
                  type: entering.transition.type,
                  direction: transitionDirection(entering.transition),
                  progress,
                },
              })
            );
            drawn = { renderer: shown.renderer, index: at.index, frame: 0, progress };
          }
          return;
        }
        // Over: the slide itself, from its start
        at.entering = null;
      }
      // Its clock and its sounds start together, with its first frame
      if (at.began === null && now === 'playing') {
        at.began = performance.now();
        sound.play(0, {
          clips: scopeSounds(deck.timeline, slide.node.id),
          sounds: deck.sounds,
          frameRate: deck.timeline.frameRate,
          lastFrame: slide.frameCount - 1,
        });
      }
      const frame =
        at.began === null
          ? 0
          : frameAt(performance.now() - at.began, deck.timeline.frameRate, current.frameCount);
      if (
        drawn?.renderer === shown.renderer &&
        drawn.index === at.index &&
        drawn.frame === frame &&
        drawn.progress === null
      ) {
        return;
      }
      put(shown.shots.render({ ctx: current.ctx, frame }));
      at.frame = frame;
      drawn = { renderer: shown.renderer, index: at.index, frame, progress: null };
    };
    frameRequest = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRequest);
  }, [deck, sound]);

  // The keys are the presentation's while it's on: none reach the editor.
  // Escape leaves at any time; the slides move once the first has started
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
      if (!playing) return;
      // ↓ during a transition: straight to its end, the slide under way
      const live = showing.current;
      if (live.entering && FORWARD.has(event.key)) {
        live.entering = null;
        return;
      }
      setShown((at) => {
        const move = moveFor(event.key, at.index, count);
        if (move?.again) return { index: at.index, take: at.take + 1, entrance: null };
        if (!move || move.to === at.index) return at;
        // On to the next: the transition into it, from the frame this one got to; else a cut
        const transition = transitionFor(
          event.key,
          at.index,
          move.to,
          deck.slides[move.to]?.transition
        );
        return {
          index: move.to,
          take: 0,
          entrance: transition ? { from: at.index, frame: live.frame, transition } : null,
        };
      });
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('keyup', key, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('keyup', key, true);
    };
  }, [count, playing, deck]);

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
      {playing && slide && (
        <span key={`${index}:${take}`} className={styles.count} aria-hidden="true">
          {index + 1} / {count}
        </span>
      )}
      <span className="visually-hidden" aria-live="polite">
        {playing && slide ? `Slide ${index + 1} of ${count}: ${slide.node.name}` : ''}
      </span>
      {first && (phase === 'loading' || phase === 'leaving') && (
        <PresentationLoader
          preparing={preparing}
          first={{ name: first.node.name, aspect: first.bounds.width / first.bounds.height }}
          count={count}
          leaving={phase === 'leaving'}
        />
      )}
      {playing && hint && (
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
