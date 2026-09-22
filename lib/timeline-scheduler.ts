/**
 * Timeline Scheduler for Dubbing & Voiceover
 *
 * Prevents voice overlap collisions ("les voix qui parlent l'une sur l'autre").
 * Ensures that every line finishes completely before the next one starts,
 * with a natural studio breathing pause (e.g. 120-150ms).
 * Automatically resynchronizes to video timecode at any pause.
 */

export interface InputClip {
  index: number;
  startTimeMs: number;
  endTimeMs: number;
  filePath: string;
  url?: string;
  estimatedDurationMs: number;
}

export interface ScheduledClip extends InputClip {
  scheduledDelayMs: number;
  tempo: number;
  effectiveDurationMs: number;
  endMs: number;
  shiftedMs: number;
  collidedWithPrevious: boolean;
}

export interface TimelineScheduleResult {
  scheduledClips: ScheduledClip[];
  totalDurationMs: number;
  collisionCount: number;
  maxShiftMs: number;
  resyncCount: number;
}

export interface TimelineOptions {
  timeOffsetMs?: number;
  minGapMs?: number; // Default: 150ms
  speechRate?: number; // Base speech rate, default: 1.05
  paceMode?: 'smart' | 'gentle' | 'strict' | 'stable'; // Default: 'smart'
  antiCollision?: boolean; // Default: true (never allow two voices to overlap)
  maxAutoRate?: number; // Maximum tempo speedup allowed (default 1.35)
}

export function buildCollisionFreeTimeline(
  rawClips: InputClip[],
  options: TimelineOptions = {}
): TimelineScheduleResult {
  if (!rawClips.length) {
    return {
      scheduledClips: [],
      totalDurationMs: 0,
      collisionCount: 0,
      maxShiftMs: 0,
      resyncCount: 0,
    };
  }

  const {
    timeOffsetMs = 0,
    minGapMs = 150,
    speechRate = 1.05,
    paceMode = 'smart',
    antiCollision = true,
    maxAutoRate = 1.35,
  } = options;

  // Sort strictly chronologically by subtitle startTimeMs
  const clips = [...rawClips].sort((a, b) => a.startTimeMs - b.startTimeMs);

  const scheduledClips: ScheduledClip[] = [];
  let prevDialogueEndMs = 0;
  let collisionCount = 0;
  let maxShiftMs = 0;
  let resyncCount = 0;

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    // Baseline nominal start relative to optional timeOffset (e.g. direct-start)
    const nominalStart = Math.max(0, clip.startTimeMs - timeOffsetMs);
    let actualStart = nominalStart;
    let collided = false;

    // Strict non-overlap guarantee: clip i can NEVER start while clip i-1 is still talking
    if (antiCollision && i > 0) {
      const earliestAllowed = prevDialogueEndMs + minGapMs;
      if (actualStart < earliestAllowed) {
        // COLLISION PREVENTED: Shift dialogue to immediately after previous speaker + breathing gap
        actualStart = earliestAllowed;
        collided = true;
        collisionCount++;
        const shift = actualStart - nominalStart;
        if (shift > maxShiftMs) {
          maxShiftMs = shift;
        }
      } else if (actualStart > prevDialogueEndMs + minGapMs) {
        // Natural pause in video
        resyncCount++;
      }
    }

    // Dynamic pace / speech rate adaptation to fit dialogue in time
    let tempo = speechRate;
    const nextClip = clips[i + 1];
    const nominalWindow = clip.endTimeMs > clip.startTimeMs
      ? clip.endTimeMs - clip.startTimeMs
      : clip.estimatedDurationMs;

    if (paceMode === 'smart') {
      // Calculate available space before next sentence or natural window
      let availableWindow = nominalWindow;
      if (nextClip) {
        const nextNominal = Math.max(0, nextClip.startTimeMs - timeOffsetMs);
        if (nextNominal > actualStart) {
          availableWindow = nextNominal - actualStart - minGapMs;
        }
      }

      if (availableWindow > 300 && clip.estimatedDurationMs > availableWindow) {
        // Sentence is too long for the allocated time! Speed it up gracefully so it fits
        const neededRatio = (clip.estimatedDurationMs / availableWindow) * 1.02;
        tempo = Math.min(maxAutoRate, Math.max(speechRate, Number(neededRatio.toFixed(2))));
      }
    } else if (paceMode === 'gentle') {
      if (nextClip) {
        const nextNominal = Math.max(0, nextClip.startTimeMs - timeOffsetMs);
        const availableWindow = nextNominal - actualStart - minGapMs;
        if (availableWindow > 350 && clip.estimatedDurationMs > availableWindow) {
          const neededRatio = clip.estimatedDurationMs / availableWindow;
          tempo = Math.min(1.20, Math.max(speechRate, neededRatio * speechRate));
        }
      }
    } else if (paceMode === 'strict') {
      if (nominalWindow > 350 && clip.estimatedDurationMs > nominalWindow) {
        const neededRatio = clip.estimatedDurationMs / nominalWindow;
        tempo = Math.min(maxAutoRate, Math.max(speechRate, neededRatio * speechRate));
      }
    }

    // Calculate effective duration after tempo processing
    const effectiveDurationMs = Math.round(clip.estimatedDurationMs / tempo);
    const endMs = actualStart + effectiveDurationMs;
    prevDialogueEndMs = endMs;

    scheduledClips.push({
      ...clip,
      scheduledDelayMs: actualStart,
      tempo,
      effectiveDurationMs,
      endMs,
      shiftedMs: actualStart - nominalStart,
      collidedWithPrevious: collided,
    });
  }

  // Calculate master audio total duration
  const lastScheduled = scheduledClips[scheduledClips.length - 1];
  const lastNominalEnd = Math.max(
    ...scheduledClips.map((c) => Math.max(0, c.endTimeMs - timeOffsetMs))
  );
  const totalDurationMs = Math.max(
    (lastScheduled?.endMs ?? 0) + 1500,
    lastNominalEnd + 1500
  );

  return {
    scheduledClips,
    totalDurationMs,
    collisionCount,
    maxShiftMs,
    resyncCount,
  };
}
