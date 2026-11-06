export const PRACTICE_CAPTURE_PREFIX = 'o2i-practice-capture:';
export const EXPECTED_SECONDS: Record<string, number> = { easy: 120, medium: 240, hard: 360 };
export interface SelectionStep { option_id: string; elapsed_seconds: number }
export interface PracticeCapture {
  milliseconds: number; selected: string; trajectory: SelectionStep[] | null;
  complete: boolean; frozen: boolean; paused: boolean;
}
export function emptyCapture(complete: boolean): PracticeCapture {
  return { milliseconds: 0, selected: '', trajectory: [], complete, frozen: false, paused: false };
}
export function readCapture(raw: string | null, options: string[]): PracticeCapture | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as PracticeCapture;
    if (!Number.isFinite(c.milliseconds) || c.milliseconds < 0 || c.milliseconds > 86400000
      || typeof c.complete !== 'boolean' || typeof c.frozen !== 'boolean' || typeof c.paused !== 'boolean'
      || (c.selected !== '' && !options.includes(c.selected)) || (c.complete && c.trajectory === null)) return null;
    if (c.trajectory !== null) {
      if (!Array.isArray(c.trajectory) || c.trajectory.length > 256) return null;
      let previous = -1, option = '';
      for (const step of c.trajectory) {
        if (!options.includes(step.option_id) || step.option_id === option || !Number.isInteger(step.elapsed_seconds)
          || step.elapsed_seconds < 0 || step.elapsed_seconds < previous || step.elapsed_seconds > Math.floor(c.milliseconds / 1000)) return null;
        previous = step.elapsed_seconds; option = step.option_id;
      }
      if (option !== c.selected) return null;
    }
    if (c.frozen && !c.selected) return null;
    return c;
  } catch { return null; }
}
export function advanceCapture(c: PracticeCapture, delta: number): PracticeCapture {
  return { ...c, milliseconds: Math.min(86400000, c.milliseconds + Math.max(0, delta)) };
}
export function selectCapture(c: PracticeCapture, option: string): PracticeCapture {
  if (c.frozen || c.selected === option) return c;
  const trajectory = c.trajectory && c.trajectory.length < 256
    ? [...c.trajectory, { option_id: option, elapsed_seconds: Math.floor(c.milliseconds / 1000) }] : null;
  return { ...c, selected: option, trajectory, complete: c.complete && trajectory !== null };
}
export function clearPracticeCaptures(storage: Storage, keepUserId?: string) {
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (key?.startsWith(PRACTICE_CAPTURE_PREFIX) && (!keepUserId || !key.startsWith(`${PRACTICE_CAPTURE_PREFIX}${keepUserId}:`))) storage.removeItem(key);
  }
}

/** A newly opened tab can inherit sessionStorage from its opener, but not its window name. */
export function initializePracticeCaptureTab(storage: Storage, windowName: string, newId: string): string {
  if (windowName.startsWith('o2i-practice-tab:') && storage.getItem('o2i-practice-tab') === windowName) return windowName;
  clearPracticeCaptures(storage);
  const name = 'o2i-practice-tab:' + newId;
  storage.setItem('o2i-practice-tab', name);
  return name;
}
