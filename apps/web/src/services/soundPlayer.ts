/**
 * Sound Player
 * The editor's playback of a timeline's sound clips (Web Audio): started
 * from a frame, each clip from where it has got to, and told each frame
 * shown so the timeline's playback can start it again from the frame it's
 * on when the two part (a loop, a jump of the playhead, a stalled tab).
 * Stopped, it plays a moment of the sounds at a frame as the playhead is
 * dragged or stepped there (scrubbing).
 */

import { playLevel, schedulePlayGain, soundsPlayed } from '@quar/animation';
import type { Sound, SoundClip } from '@quar/types';
import { decodedSound } from './soundFiles';

/** What plays: the clips of the timeline in view, up to where playing loops. */
export interface SoundsToPlay {
  clips: readonly SoundClip[] | undefined;
  sounds: readonly Sound[];
  frameRate: number;
  /** The last frame playing reaches before it loops or stops */
  lastFrame: number;
}

/** A moment to set the sounds going in (so they all start together, in time). */
const LEAD_SECONDS = 0.03;

/** How much of the sounds a frame scrubbed to plays, at least (shorter is a click). */
export const SCRUB_SECONDS = 0.08;
/** How long a scrubbed moment takes to rise and fall (no click at either end). */
const SCRUB_EDGE = 0.005;

export interface SoundPlayerOptions {
  createContext?: () => AudioContext;
  decode?: (sound: Sound) => Promise<AudioBuffer>;
}

export class SoundPlayer {
  private context: AudioContext | null = null;
  private playing: Array<{ source: AudioBufferSourceNode; gain: GainNode }> = [];
  /** Changed when playing stops or starts over: sounds decoded too late for a run aren't played */
  private run = 0;
  /** The frame playing started from, when (on the audio clock), at what rate */
  private origin: { frame: number; time: number; rate: number } | null = null;
  /** The sounds decoded so far, to scrub at once */
  private ready = new Map<string, AudioBuffer>();
  private readonly createContext: () => AudioContext;
  private readonly decode: (sound: Sound) => Promise<AudioBuffer>;

  constructor(options: SoundPlayerOptions = {}) {
    this.createContext = options.createContext ?? (() => new AudioContext());
    this.decode = options.decode ?? decodedSound;
  }

  /**
   * Gets the audio going ahead of playing (on a click or key press, as
   * browsers ask): a new audio clock takes a moment to start running.
   */
  warm(): void {
    this.context ??= this.createContext();
    if (this.context.state === 'suspended') void this.context.resume();
  }

  /** Decodes the library's sounds ahead, so they play (and scrub) at once; lets go of the rest. */
  prepare(sounds: readonly Sound[]): void {
    const kept = new Set(sounds.map((sound) => sound.id));
    for (const id of this.ready.keys()) if (!kept.has(id)) this.ready.delete(id);
    for (const sound of sounds) this.prepared(sound);
  }

  private prepared(sound: Sound): void {
    if (this.ready.has(sound.id)) return;
    this.decode(sound).then(
      (buffer) => this.ready.set(sound.id, buffer),
      // A sound that can't be decoded stays silent
      () => undefined
    );
  }

  /**
   * Plays a frame's worth of the clips sounding at `frame` (at least
   * SCRUB_SECONDS of them), cutting off the last frame's. Only sounds already
   * decoded are heard: one decoded late would be heard after the playhead
   * has moved on.
   */
  scrub(frame: number, what: SoundsToPlay): void {
    this.stop();
    const library = new Map(what.sounds.map((sound) => [sound.id, sound]));
    const rate = Math.max(1, what.frameRate);
    const last = frame + Math.max(1, Math.ceil(SCRUB_SECONDS * rate)) - 1;
    // Only what sounds at the frame itself
    const plays = soundsPlayed(what.clips, rate, frame, last).filter(
      (play) => play.at === 0 && library.has(play.soundId)
    );
    if (plays.length === 0) return;

    this.warm();
    const context = this.context;
    if (!context) return;
    const begin = context.currentTime + SCRUB_EDGE;
    for (const play of plays) {
      const buffer = this.ready.get(play.soundId);
      const sound = library.get(play.soundId);
      if (!buffer) {
        if (sound) this.prepared(sound);
        continue;
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      const level = play.gain * playLevel(play, 0);
      const end = begin + play.duration;
      const edge = Math.min(SCRUB_EDGE, play.duration / 2);
      gain.gain.setValueAtTime(0, begin);
      gain.gain.linearRampToValueAtTime(level, begin + edge);
      gain.gain.setValueAtTime(level, end - edge);
      gain.gain.linearRampToValueAtTime(0, end);
      source.connect(gain).connect(context.destination);
      source.start(begin, play.offset, play.duration);
      this.playing.push({ source, gain });
    }
  }

  /** Plays the clips from `frame` on (whatever was playing stops). */
  play(frame: number, what: SoundsToPlay): void {
    this.stop();
    const run = this.run;
    const library = new Map(what.sounds.map((sound) => [sound.id, sound]));
    const plays = soundsPlayed(what.clips, what.frameRate, frame, what.lastFrame).filter((play) =>
      library.has(play.soundId)
    );
    if (plays.length === 0) return;

    this.warm();
    const context = this.context;
    if (!context) return;
    const begin = context.currentTime + LEAD_SECONDS;
    this.origin = { frame, time: begin, rate: Math.max(1, what.frameRate) };

    for (const play of plays) {
      const sound = library.get(play.soundId);
      if (!sound) continue;
      this.decode(sound).then(
        (buffer) => {
          this.ready.set(sound.id, buffer);
          if (run !== this.run) return;
          // Decoded after it was due: from where it has got to
          const late = Math.max(0, context.currentTime - (begin + play.at));
          if (late >= play.duration) return;
          const source = context.createBufferSource();
          source.buffer = buffer;
          const gain = context.createGain();
          schedulePlayGain(gain.gain, play, begin + play.at + late, late);
          source.connect(gain).connect(context.destination);
          source.start(begin + play.at + late, play.offset + late, play.duration - late);
          this.playing.push({ source, gain });
        },
        // A sound that can't be decoded stays silent
        () => undefined
      );
    }
  }

  /**
   * Whether the frame shown is where the sounds have got to, within a tenth
   * of a second. (Out of step before they've begun, while a new audio clock
   * stands still, starting over from the frame shown is silent.)
   */
  inStep(frame: number): boolean {
    if (!this.origin || !this.context) return true;
    const { frame: from, time, rate } = this.origin;
    const due = from + Math.max(0, this.context.currentTime - time) * rate;
    return Math.abs(frame - due) <= Math.max(2, rate / 10);
  }

  stop(): void {
    this.run++;
    for (const { source, gain } of this.playing) {
      try {
        source.stop();
      } catch {
        // Not started yet, or ended
      }
      source.disconnect();
      gain.disconnect();
    }
    this.playing = [];
    this.origin = null;
  }

  dispose(): void {
    this.stop();
    void this.context?.close();
    this.context = null;
    this.ready.clear();
  }
}
