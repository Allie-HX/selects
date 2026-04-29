import type { AppState, ShortlistEntry } from "./types";

const STORAGE_KEY = "selects-app-state";

const defaultState: AppState = {
  categories: ["Hero", "B-Roll", "Interview", "Cutaway", "Establishing"],
  shortlist: [],
  reviewedFiles: [],
  skippedFiles: [],
};

export function loadState(): AppState {
  if (typeof window === "undefined") return defaultState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      categories: parsed.categories ?? defaultState.categories,
      shortlist: parsed.shortlist ?? defaultState.shortlist,
      reviewedFiles: parsed.reviewedFiles ?? defaultState.reviewedFiles,
      skippedFiles: parsed.skippedFiles ?? defaultState.skippedFiles,
    };
  } catch {
    return defaultState;
  }
}

export function saveState(state: AppState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable
  }
}

export function addToShortlist(entry: ShortlistEntry): AppState {
  const state = loadState();
  state.shortlist.push(entry);
  saveState(state);
  return state;
}

export function markReviewed(fileKey: string): AppState {
  const state = loadState();
  if (!state.reviewedFiles.includes(fileKey)) {
    state.reviewedFiles.push(fileKey);
  }
  saveState(state);
  return state;
}

export function markSkipped(fileKey: string): AppState {
  const state = loadState();
  if (!state.skippedFiles.includes(fileKey)) {
    state.skippedFiles.push(fileKey);
  }
  saveState(state);
  return state;
}

export function addCategory(category: string): AppState {
  const state = loadState();
  if (!state.categories.includes(category)) {
    state.categories.push(category);
  }
  saveState(state);
  return state;
}

export function removeCategory(category: string): AppState {
  const state = loadState();
  state.categories = state.categories.filter((c) => c !== category);
  saveState(state);
  return state;
}

export function resetProgress(): AppState {
  const state = loadState();
  state.reviewedFiles = [];
  state.skippedFiles = [];
  saveState(state);
  return state;
}

export function getShortlistNameConflict(
  name: string,
  category: string,
  shortlist: ShortlistEntry[]
): string {
  const existing = shortlist.filter(
    (e) => e.category === category && e.clipName.startsWith(name)
  );
  if (existing.length === 0) return name;

  // Check exact match
  const exactMatch = existing.some((e) => e.clipName === name);
  if (!exactMatch) return name;

  // Find next available number
  let counter = 2;
  while (existing.some((e) => e.clipName === `${name} ${counter}`)) {
    counter++;
  }
  return `${name} ${counter}`;
}
