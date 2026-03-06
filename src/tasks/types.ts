export type TaskStatus =
  | "drafting"
  | "processing"
  | "validating:slugger"
  | "validating:ari"
  | "collaborating"
  | "paused"
  | "blocked"
  | "done"

export type CanonicalTaskType = "one-shot" | "ongoing" | "habit"

export type CanonicalTaskCollection = "one-shots" | "ongoing" | "habits"

export interface TaskFile {
  path: string
  name: string
  stem: string
  type: CanonicalTaskType
  collection: CanonicalTaskCollection
  category: string
  title: string
  status: TaskStatus
  created: string
  updated: string
  frontmatter: Record<string, unknown>
  body: string
}

export interface TaskIndex {
  root: string
  tasks: TaskFile[]
  invalidFilenames: string[]
  parseErrors: string[]
  fingerprint: string
}

export interface TransitionResult {
  ok: boolean
  from: TaskStatus
  to: TaskStatus
  reason?: string
}

export interface ValidationResult {
  ok: boolean
  reason?: string
  missingFields?: string[]
}

export interface SpawnValidation {
  ok: boolean
  reason?: string
}

export interface BoardResult {
  compact: string
  full: string
  byStatus: Record<TaskStatus, string[]>
  actionRequired: string[]
  unresolvedDependencies: string[]
  activeSessions: string[]
}

export interface CreateTaskInput {
  title: string
  type: CanonicalTaskType | string
  category: string
  body: string
  status?: TaskStatus | string
}

export interface TaskModule {
  scan(): TaskIndex
  getBoard(): BoardResult
  getTask(name: string): TaskFile | null
  createTask(input: CreateTaskInput): string
  updateStatus(name: string, toStatus: string): TransitionResult & { path?: string; archived?: string[] }
  validateWrite(filePath: string, content: string): ValidationResult
  validateTransition(from: TaskStatus, to: TaskStatus): TransitionResult
  validateSpawn(taskName: string, spawnType: string): SpawnValidation
  detectStale(thresholdDays: number): TaskFile[]
  boardStatus(status: string): string[]
  boardAction(): string[]
  boardDeps(): string[]
  boardSessions(): string[]
}
