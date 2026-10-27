/**
 * Sound Player
 * The editor's playback of a timeline's sound clips (Web Audio): started
 * from a frame, each clip from where it has got to, and told each frame
 * shown so the timeline's playback can start it again from the frame it's
 * on when the two part (a loop, a jump of the playhead, a stalled tab).
 */

import { soundsPlayed } from '@quar/animation';
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
          if (run !== this.run) return;
          // Decoded after it was due: from where it has got to
          const late = Math.max(0, context.currentTime - (begin + play.at));
          if (late >= play.duration) return;
          const source = context.createBufferSource();
          source.buffer = buffer;
          const gain = context.createGain();
          gain.gain.value = play.gain;
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
  }
}
