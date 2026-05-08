import type { AppState, ShortlistEntry } from "./types";

const PROJECTS_KEY = "selects-projects";
const ACTIVE_PROJECT_KEY = "selects-active-project";

function projectKey(name: string): string {
  return `selects-project-${name}`;
}

const defaultState: AppState = {
  categories: ["Hero", "B-Roll", "Interview", "Cutaway", "Establishing"],
  shortlist: [],
  reviewedFiles: [],
  skippedFiles: [],
};

export function listProjects(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveProjectList(projects: string[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

export function getActiveProject(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_PROJECT_KEY);
}

export function setActiveProject(name: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_PROJECT_KEY, name);
  const projects = listProjects();
  if (!projects.includes(name)) {
    projects.push(name);
    saveProjectList(projects);
  }
}

export function createProject(name: string): AppState {
  setActiveProject(name);
  const state = { ...defaultState, shortlist: [], reviewedFiles: [], skippedFiles: [] };
  saveState(state);
  return state;
}

export function deleteProject(name: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(projectKey(name));
  const projects = listProjects().filter((p) => p !== name);
  saveProjectList(projects);
  if (getActiveProject() === name) {
    localStorage.setItem(ACTIVE_PROJECT_KEY, projects[0] ?? "");
  }
}

export function loadState(): AppState {
  if (typeof window === "undefined") return defaultState;

  const active = getActiveProject();
  if (!active) {
    const migrated = migrateOldState();
    if (migrated) return migrated;
    return defaultState;
  }

  try {
    const raw = localStorage.getItem(projectKey(active));
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
  const active = getActiveProject();
  if (!active) return;
  try {
    localStorage.setItem(projectKey(active), JSON.stringify(state));
  } catch {
    // Storage full or unavailable
  }
}

function migrateOldState(): AppState | null {
  const OLD_KEY = "selects-app-state";
  try {
    const raw = localStorage.getItem(OLD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const state: AppState = {
      categories: parsed.categories ?? defaultState.categories,
      shortlist: parsed.shortlist ?? defaultState.shortlist,
      reviewedFiles: parsed.reviewedFiles ?? defaultState.reviewedFiles,
      skippedFiles: parsed.skippedFiles ?? defaultState.skippedFiles,
    };
    if (state.shortlist.length > 0 || state.reviewedFiles.length > 0) {
      setActiveProject("Imported Project");
      saveState(state);
      localStorage.removeItem(OLD_KEY);
      return state;
    }
    localStorage.removeItem(OLD_KEY);
    return null;
  } catch {
    return null;
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

  const exactMatch = existing.some((e) => e.clipName === name);
  if (!exactMatch) return name;

  let counter = 2;
  while (existing.some((e) => e.clipName === `${name} ${counter}`)) {
    counter++;
  }
  return `${name} ${counter}`;
}
