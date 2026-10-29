/**
 * The Slide section of the Properties panel, for an artboard at the top of
 * a page: how its slide comes on after the one before when the page's
 * artboards play as slides (the presentation player, slides exports). The
 * transition (or none), the way it moves where it moves, how long it takes,
 * how it eases, and a button putting it on every slide. A small preview
 * plays it, one slide number giving way to the next. The first slide opens
 * the show, so nothing plays into it: its controls are shown, disabled.
 */

import { useEffect, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CopyCheck } from 'lucide-react';
import {
  DEFAULT_TRANSITION_SECONDS,
  EASING_CATEGORIES,
  SLIDE_TRANSITION_DIRECTIONS,
  SLIDE_TRANSITION_TYPES,
  getEasingDisplayName,
  scopeTransition,
  slideTransition,
  transitionDirection,
  transitionEasing,
  transitionMoves,
  transitionSeconds,
  withTransitionEasing,
} from '@quar/animation';
import { artboardsInOrder } from '@quar/core';
import type { SceneGraph } from '@quar/core';
import type {
  ArtboardNode,
  EasingType,
  SlideTransition,
  SlideTransitionDirection,
  SlideTransitionType,
} from '@quar/types';
import { useEditorStore } from '../../stores/editorStore';
import styles from './PropertiesPanel.module.css';

export const TRANSITION_LABELS: Record<SlideTransitionType, string> = {
  fade: 'Fade',
  'fade-through': 'Fade Through',
  push: 'Push',
  'slide-over': 'Slide Over',
  wipe: 'Wipe',
};

const DIRECTIONS: Record<
  SlideTransitionDirection,
  { label: string; title: string; Icon: typeof ArrowLeft; dx: number; dy: number }
> = {
  left: { label: 'Left', title: 'Moves left: in from the right', Icon: ArrowLeft, dx: -1, dy: 0 },
  right: { label: 'Right', title: 'Moves right: in from the left', Icon: ArrowRight, dx: 1, dy: 0 },
  up: { label: 'Up', title: 'Moves up: in from below', Icon: ArrowUp, dx: 0, dy: -1 },
  down: { label: 'Down', title: 'Moves down: in from above', Icon: ArrowDown, dx: 0, dy: 1 },
};

/**
 * The easings a transition can have, in the Easing Editor's families: the
 * named ones (a transition's easing is a name, not a curve), Linear first.
 */
const EASING_FAMILIES = EASING_CATEGORIES.flatMap(({ name, items }) => {
  const easings = items.flatMap(({ value }) => (typeof value === 'string' ? [value] : []));
  return easings.length > 1 ? [{ name, easings }] : [];
});

/** Seconds as the field shows them: 0.5, 1.25, 2. */
const shownSeconds = (seconds: number) => String(Math.round(seconds * 100) / 100);

const same = (a: SlideTransition | null, b: SlideTransition | null) =>
  JSON.stringify(a) === JSON.stringify(b);

export function SlideSection({
  artboard,
  sceneGraph,
}: {
  artboard: ArtboardNode;
  sceneGraph: SceneGraph;
}) {
  const transition = useEditorStore((state) => scopeTransition(state.timeline, artboard.id));
  // Every slide's, to tell whether Apply to all would change anything
  const timeline = useEditorStore((state) => state.timeline);
  const setSlideTransition = useEditorStore((state) => state.setSlideTransition);
  const applyToAll = useEditorStore((state) => state.applyTransitionToAllSlides);

  const boards = artboardsInOrder(sceneGraph);
  const slides = boards.filter((board) => board.visible);
  const number = slides.findIndex((slide) => slide.id === artboard.id) + 1;
  const first = number === 1;
  const everyOne = boards.every((board) => same(scopeTransition(timeline, board.id), transition));

  const set = (next: SlideTransition | null) => setSlideTransition(sceneGraph, artboard.id, next);
  const moves = transition !== null && transitionMoves(transition.type);
  const direction = transition ? transitionDirection(transition) : 'left';

  return (
    <div className={styles.section} data-testid="slide-section">
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Slide</span>
        <span className={styles.slideNumber} data-testid="slide-number">
          {number > 0 ? `${number} / ${slides.length}` : 'Hidden'}
        </span>
      </div>
      <div className={styles.sectionContent}>
        <div className={styles.propertyRow}>
          <label className={styles.propertyLabel} htmlFor="slide-transition">
            Transition in
          </label>
          <div className={styles.propertyInputs}>
            <select
              id="slide-transition"
              className={styles.select}
              value={transition?.type ?? 'none'}
              disabled={first}
              onChange={(e) => {
                const type = e.target.value;
                set(
                  type === 'none' ? null : slideTransition(type as SlideTransitionType, transition)
                );
              }}
              data-testid="slide-transition"
            >
              <option value="none">None</option>
              {SLIDE_TRANSITION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TRANSITION_LABELS[type]}
                </option>
              ))}
            </select>
            <TransitionPreview
              transition={first ? null : transition}
              from={number > 1 ? number - 1 : 1}
              to={number > 1 ? number : 2}
            />
          </div>
        </div>

        {moves && (
          <div className={styles.propertyRow}>
            <span className={styles.propertyLabel}>Direction</span>
            <div
              className={`${styles.alignToggle} ${styles.slideDirections}`}
              role="group"
              aria-label="Direction"
              data-testid="slide-direction"
            >
              {SLIDE_TRANSITION_DIRECTIONS.map((way) => {
                const { label, title, Icon } = DIRECTIONS[way];
                return (
                  <button
                    key={way}
                    type="button"
                    className={`${styles.alignOption} ${styles.slideDirection} ${direction === way ? styles.alignOptionActive : ''}`}
                    onClick={() => transition && set({ ...transition, direction: way })}
                    disabled={first}
                    title={title}
                    aria-label={label}
                    aria-pressed={direction === way}
                    data-testid={`slide-direction-${way}`}
                  >
                    <Icon size={12} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {transition && (
          <div className={styles.propertyRow}>
            <label className={styles.propertyLabel} htmlFor="slide-transition-duration">
              Duration
            </label>
            <div className={styles.propertyInputs}>
              <SecondsField
                seconds={transition.duration}
                disabled={first}
                onChange={(duration) => set({ ...transition, duration })}
              />
            </div>
          </div>
        )}

        {transition && (
          <div className={styles.propertyRow}>
            <label className={styles.propertyLabel} htmlFor="slide-transition-easing">
              Easing
            </label>
            <div className={styles.propertyInputs}>
              <select
                id="slide-transition-easing"
                className={styles.select}
                value={transitionEasing(transition)}
                disabled={first}
                onChange={(e) =>
                  set(withTransitionEasing(transition, e.target.value as EasingType))
                }
                data-testid="slide-transition-easing"
              >
                <option value="linear">{getEasingDisplayName('linear')}</option>
                {EASING_FAMILIES.map(({ name, easings }) => (
                  <optgroup key={name} label={name}>
                    {easings.map((easing) => (
                      <option key={easing} value={easing}>
                        {getEasingDisplayName(easing)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
        )}

        <button
          type="button"
          className={`${styles.booleanOpButton} ${styles.slideApplyAll}`}
          onClick={() => applyToAll(sceneGraph, artboard.id)}
          disabled={first || everyOne}
          title={
            everyOne
              ? 'Every slide has this transition'
              : 'Put this transition on every slide of the page'
          }
          data-testid="slide-transition-apply-all"
        >
          <CopyCheck size={12} />
          Apply to all slides
        </button>

        {first && (
          <p className={styles.slideNote} data-testid="slide-first-note">
            The first slide opens the show: no transition plays into it.
          </p>
        )}
        {number === 0 && (
          <p className={styles.slideNote}>Hidden artboards aren’t played as slides.</p>
        )}
      </div>
    </div>
  );
}

/**
 * The duration, in seconds: typed and kept on Enter or leaving the field
 * (Escape puts it back), or stepped with ↑/↓ — a tenth, Shift a whole second.
 */
function SecondsField({
  seconds,
  disabled,
  onChange,
}: {
  seconds: number;
  disabled: boolean;
  onChange: (seconds: number) => void;
}) {
  const [draft, setDraft] = useState(shownSeconds(seconds));
  useEffect(() => setDraft(shownSeconds(seconds)), [seconds]);

  const keep = (text: string) => {
    const value = parseFloat(text);
    if (!Number.isFinite(value)) {
      setDraft(shownSeconds(seconds));
      return;
    }
    const next = transitionSeconds(value);
    setDraft(shownSeconds(next));
    if (next !== seconds) onChange(next);
  };

  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      keep(e.currentTarget.value);
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setDraft(shownSeconds(seconds));
      e.currentTarget.blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 1 : 0.1);
      keep(String((parseFloat(draft) || DEFAULT_TRANSITION_SECONDS) + step));
    }
  };

  return (
    <div className={styles.inputGroup}>
      <input
        id="slide-transition-duration"
        type="text"
        inputMode="decimal"
        className={styles.input}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => keep(e.target.value)}
        onKeyDown={key}
        data-testid="slide-transition-duration"
      />
      <span className={styles.inputUnit} aria-hidden="true">
        s
      </span>
    </div>
  );
}

/**
 * The transition played in miniature: slide `from` giving way to slide `to`.
 * It plays once when it changes, and again when the pointer comes over it;
 * at rest (and with reduced motion) it shows the incoming slide.
 */
function TransitionPreview({
  transition,
  from,
  to,
}: {
  transition: SlideTransition | null;
  from: number;
  to: number;
}) {
  const [take, setTake] = useState(0);
  const type = transition?.type ?? 'none';
  const way = DIRECTIONS[transition ? transitionDirection(transition) : 'left'];
  const style = {
    '--dx': way.dx,
    '--dy': way.dy,
    // A wipe's revealed part grows from the edge it comes in at
    '--wipe-top': way.dy < 0 ? '100%' : '0%',
    '--wipe-right': way.dx > 0 ? '100%' : '0%',
    '--wipe-bottom': way.dy > 0 ? '100%' : '0%',
    '--wipe-left': way.dx < 0 ? '100%' : '0%',
  } as CSSProperties;
  return (
    <div
      className={styles.slidePreview}
      data-type={type}
      style={style}
      onPointerEnter={() => setTake((n) => n + 1)}
      aria-hidden="true"
      data-testid="slide-transition-preview"
    >
      <span
        key={`from:${type}:${way.label}:${take}`}
        className={`${styles.slidePane} ${styles.slidePaneFrom}`}
      >
        {from}
      </span>
      <span
        key={`to:${type}:${way.label}:${take}`}
        className={`${styles.slidePane} ${styles.slidePaneTo}`}
      >
        {to}
      </span>
    </div>
  );
}
