import type { StoredWorkspaceState } from "./projects";

export const workspaceStorageKey = "ai-novel-platform-workspace-v2";
export const legacyWorkspaceStorageKey = "ai-novel-platform-workspace-v1";

export type LightweightWorkspaceState = {
  version: 2;
  mode: "lightweight";
  mirrorLinks: StoredWorkspaceState["mirrorLinks"];
  activeProjectId?: string;
  selectedRecordId?: string;
  projectSummaries: Array<{ id: string; title: string }>;
};

export type ParsedWorkspaceStorageState = {
  kind: "lightweight";
  projects: [];
  mirrorLinks: StoredWorkspaceState["mirrorLinks"];
  activeProjectId?: string;
  selectedRecordId?: string;
};

type BrowserStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function clearLegacyWorkspaceStorage(
  storage: Pick<Storage, "removeItem">,
): void {
  storage.removeItem(legacyWorkspaceStorageKey);
  storage.removeItem(workspaceStorageKey);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function serializedByteLength(value: string): number {
  return new Blob([value]).size;
}

export function createLightweightWorkspaceState(
  state: StoredWorkspaceState,
): LightweightWorkspaceState {
  return {
    version: 2,
    mode: "lightweight",
    mirrorLinks: state.mirrorLinks,
    activeProjectId: state.activeProjectId,
    selectedRecordId: state.selectedRecordId,
    projectSummaries: state.projects.map((project) => ({ id: project.id, title: project.title })),
  };
}

export function parseWorkspaceStorageState(
  value: string | null,
): ParsedWorkspaceStorageState | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !isRecord(parsed)
      || parsed.version !== 2
      || parsed.mode !== "lightweight"
      || !isRecord(parsed.mirrorLinks)
      || !Array.isArray(parsed.projectSummaries)
    ) {
      return undefined;
    }
    return {
      kind: "lightweight",
      projects: [],
      mirrorLinks: parsed.mirrorLinks as StoredWorkspaceState["mirrorLinks"],
      activeProjectId: typeof parsed.activeProjectId === "string" ? parsed.activeProjectId : undefined,
      selectedRecordId: typeof parsed.selectedRecordId === "string" ? parsed.selectedRecordId : undefined,
    };
  } catch {
    return undefined;
  }
}

export function canRemoveLegacyWorkspaceState(
  databaseHasProjects: boolean,
  lightweightSnapshotPersisted: boolean,
): boolean {
  return databaseHasProjects && lightweightSnapshotPersisted;
}

export function persistWorkspaceState(
  storage: BrowserStorage,
  fullState: StoredWorkspaceState,
  options: { preferFull: boolean; maxFullBytes: number },
): { mode: "full" | "lightweight" | "lightweight-quota"; persisted: boolean } {
  const lightweightState = createLightweightWorkspaceState(fullState);
  const lightweightJson = JSON.stringify(lightweightState);
  const writeLightweight = (mode: "lightweight" | "lightweight-quota") => {
    try {
      storage.setItem(workspaceStorageKey, lightweightJson);
      return { mode, persisted: true };
    } catch {
      // The page must remain usable even if the browser rejects all local storage writes.
      return { mode, persisted: false };
    }
  };

  if (!options.preferFull) return writeLightweight("lightweight");

  const fullJson = JSON.stringify(fullState);
  if (serializedByteLength(fullJson) > options.maxFullBytes) {
    return writeLightweight("lightweight-quota");
  }

  try {
    storage.setItem(legacyWorkspaceStorageKey, fullJson);
    return { mode: "full", persisted: true };
  } catch {
    return writeLightweight("lightweight-quota");
  }
}
