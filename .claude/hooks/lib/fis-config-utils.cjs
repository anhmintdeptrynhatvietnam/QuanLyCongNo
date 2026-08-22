/**
 * Shared utilities for FIS AI Kit hooks
 *
 * Contains config loading, path sanitization, and common constants
 * used by session-init.cjs and dev-rules-reminder.cjs
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const { deepMerge } = require('./deep-merge.cjs');
const { resolvePrefsPayload } = require('./fis-prefs-resolver.cjs');
const { toInternalConfig } = require('./fis-prefs-key-map.cjs');
const { createCandidateSessionStateContext } = require('./runtime-state-identity.cjs');
const sessionStore = require('./private-json-store.cjs');

const LOCAL_CONFIG_PATH = '.claude/.fisrc.json';
const GLOBAL_CONFIG_PATH = path.join(os.homedir(), '.claude', '.fisrc.json');
const SESSION_STATE_LOFIS_TIMEOUT_MS = 500;
const SESSION_STATE_LOFIS_RETRY_MS = 10;
const SESSION_STATE_LOFIS_STALE_MS = 5000;

// Legacy export for backward compatibility
const CONFIG_PATH = LOCAL_CONFIG_PATH;

/**
 * Sections `loadConfig` forwards without shaping. Each has a consumer that owns
 * its own defaults, so the loader must not invent values it would then have to
 * keep in sync — but it must not drop a user's setting either.
 */
const PASSTHROUGH_SECTIONS = Object.freeze([
  'privacyBlock',
  'simplify',
  'workflowArtifactGate',
  'git',
  'journal',
  'gemini',
  'extensions'
]);

const DEFAULT_CONFIG = {
  plan: {
    namingFormat: '{date}-{issue}-{slug}',
    dateFormat: 'YYMMDD-HHmm',
    issuePrefix: null,
    reportsDir: 'reports',
    resolution: {
      // CHANGED: Removed 'mostRecent' - only explicit session state activates plans
      // Branch matching now returns 'suggested' not 'active'
      order: ['session', 'pointer', 'branch'],
      branchPattern: '(?:feat|fix|chore|refactor|docs)/(?:[^/]+/)?(.+)'
    },
    validation: {
      mode: 'prompt',  // 'auto' | 'prompt' | 'off'
      minQuestions: 3,
      maxQuestions: 8,
      focusAreas: ['assumptions', 'risks', 'tradeoffs', 'architecture']
    }
  },
  paths: {
    docs: 'docs',
    plans: 'plans'
  },
  docs: {
    maxLoc: 800  // Maximum lines of code per doc file before warning
  },
  locale: {
    thinkingLanguage: null,  // Language for reasoning (e.g., "en" for precision)
    responseLanguage: null   // Language for user-facing output (e.g., "vi")
  },
  trust: {
    passphrase: null,
    enabled: false
  },
  project: {
    type: 'auto',
    packageManager: 'auto',
    framework: 'auto'
  },
  skills: {
    research: {
      useGemini: false  // Opt-in: set true only with working Gemini CLI
    }
  },
  assertions: [],
  statusline: 'full',
  statuslineColors: true,
  statuslineQuota: true,
  hooks: {
    'session-init': true,
    'subagent-init': true,
    'dev-rules-reminder': true,
    'usage-context-awareness': true,
    'context-tracking': true,
    'scout-block': true,
    'privacy-block': true,
    'simplify-gate': true,
    'session-state': true,
    'secret-output-guardrail': true,
    'precompact-capture': true
  }
};

/**
 * Load config from a specific file path
 * @param {string} configPath - Path to config file
 * @returns {Object|null} Parsed config or null if not found/invalid
 */
function loadConfigFromPath(configPath) {
  try {
    if (!fs.existsSync(configPath)) return null;
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * Session state comes in two forms while the store migrates.
 *
 * A string session id is the original flat file, `$TMP/fis-session-<id>.json`.
 * A context object is the identity-keyed store in `private-json-store.cjs`, which
 * isolates state by project, runtime, and user, and journals writes so concurrent
 * hooks cannot erase one another.
 *
 * Every accessor below takes either, so existing callers keep working unchanged
 * while callers that build a context get the newer store. The flat file stays
 * readable for one release: a session already running through an upgrade would
 * otherwise lose the state it wrote minutes earlier.
 */
function isStateContext(target) {
  return Boolean(target && typeof target === 'object');
}

/** The flat file for a session id — the pre-context location. */
function legacySessionTempPath(sessionId) {
  return path.join(os.tmpdir(), `fis-session-${sessionId}.json`);
}

function readLegacySessionState(sessionId) {
  if (!sessionId) return null;
  const tempPath = legacySessionTempPath(sessionId);
  try {
    if (!fs.existsSync(tempPath)) return null;
    return JSON.parse(fs.readFileSync(tempPath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeLegacySessionState(sessionId, state) {
  if (!sessionId) return false;
  const tempPath = legacySessionTempPath(sessionId);
  const tmpFile = tempPath + '.' + Math.random().toString(36).slice(2);
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2));
    fs.renameSync(tmpFile, tempPath);
    return true;
  } catch (e) {
    try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }
    return false;
  }
}

/**
 * Build a session context, or null when this is not a real session.
 *
 * `bindSession` claims the session's identity and is for the hook that starts a
 * session. `requireBinding` refuses unless that already happened, which is what
 * every later hook wants: no binding means no session was initialized here.
 *
 * @param {Object} options - sessionId, cwd, bindSession, requireBinding, storageRoot
 * @returns {Object|null} Frozen context, or null
 */
function createSessionStateContext(options = {}) {
  const candidate = createCandidateSessionStateContext(options);
  if (!candidate) return null;
  if (options.bindSession === true) return sessionStore.bindSessionStateContext(candidate);
  if (options.requireBinding === true) return sessionStore.resolveBoundSessionContext(candidate);
  return candidate;
}

/**
 * Get session state file path
 * @param {string|Object} target - Session id or session context
 * @returns {string} Path to the session state file
 */
function getSessionTempPath(target) {
  return isStateContext(target) ? sessionStore.getSessionTempPath(target) : legacySessionTempPath(target);
}

/**
 * Read session state
 * @param {string|Object} target - Session id or session context
 * @returns {Object|null} Session state or null
 */
function readSessionState(target) {
  if (!isStateContext(target)) return readLegacySessionState(target);
  const state = sessionStore.readSessionState(target);
  if (state) return state;
  // Nothing in the new store yet: a session that began before the upgrade still
  // has its flat file, and losing it mid-session would look like amnesia.
  return readLegacySessionState(target.normalizedSessionId);
}

/**
 * Write session state
 * @param {string|Object} target - Session id or session context
 * @param {Object} state - State object to persist
 * @returns {boolean} Success status
 */
function writeSessionState(target, state) {
  return isStateContext(target)
    ? sessionStore.writeSessionState(target, state)
    : writeLegacySessionState(target, state);
}

function sleepSync(ms) {
  if (ms <= 0) return;

  if (typeof SharedArrayBuffer === 'function' && typeof Atomics === 'object' && typeof Atomics.wait === 'function') {
    const signal = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(signal, 0, 0, ms);
    return;
  }

  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Busy wait is a last-resort fallback when Atomics.wait is unavailable.
  }
}

/** Legacy path only: the context store journals instead of locking. */
function getSessionStateLockPath(sessionId) {
  return `${legacySessionTempPath(sessionId)}.lock`;
}

function removeStaleSessionStateLock(lockPath, now = Date.now()) {
  try {
    const stats = fs.statSync(lockPath);
    if (now - stats.mtimeMs < SESSION_STATE_LOFIS_STALE_MS) return false;
    fs.unlinkSync(lockPath);
    return true;
  } catch {
    return false;
  }
}

function acquireSessionStateLock(sessionId) {
  const lockPath = getSessionStateLockPath(sessionId);
  const deadline = Date.now() + SESSION_STATE_LOFIS_TIMEOUT_MS;

  while (Date.now() <= deadline) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, String(process.pid));
      return { fd, lockPath };
    } catch (error) {
      if (error?.code !== 'EEXIST') return null;
      removeStaleSessionStateLock(lockPath);
      sleepSync(SESSION_STATE_LOFIS_RETRY_MS);
    }
  }

  return null;
}

function releaseSessionStateLock(lock) {
  if (!lock) return;
  try { fs.closeSync(lock.fd); } catch (_) { /* ignore */ }
  try { fs.unlinkSync(lock.lockPath); } catch (_) { /* ignore */ }
}

/**
 * Update session state by merging or transforming the existing value.
 * @param {string|Object} target - Session id or session context
 * @param {Object|Function} updater - Partial state or transform function
 * @returns {boolean} Success status
 */
function updateSessionState(target, updater) {
  if (!target) return false;
  // The context store serializes through its revision journal, so the flat-file
  // lock below applies only to the legacy path.
  if (isStateContext(target)) return sessionStore.updateSessionState(target, updater);

  const lock = acquireSessionStateLock(target);
  if (!lock) return false;

  try {
    const current = readSessionState(target) || {};
    const next = typeof updater === 'function'
      ? updater({ ...current })
      : { ...current, ...(updater || {}) };

    if (!next || typeof next !== 'object') return false;
    return writeSessionState(target, next);
  } finally {
    releaseSessionStateLock(lock);
  }
}

/**
 * Present a path the way a person reads it. Windows separators become forward
 * slashes so an injected path does not arrive full of escape sequences; POSIX
 * paths are already display-ready.
 * @param {string} pathValue
 * @returns {string}
 */
function toDisplayPath(pathValue) {
  if (!pathValue || typeof pathValue !== 'string') return pathValue;
  if (path.sep !== '\\') return pathValue;
  return pathValue.replace(/\\/g, '/');
}

/**
 * Characters invalid in filenames across Windows, macOS, Linux
 * Windows: < > : " / \ | ? *
 * macOS/Linux: / and null byte
 * Also includes control characters and other problematic chars
 */
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f\x7f]/g;

/**
 * Sanitize slug for safe filesystem usage
 * - Removes invalid filename characters
 * - Replaces non-alphanumeric (except hyphen) with hyphen
 * - Collapses multiple hyphens
 * - Removes leading/trailing hyphens
 * - Limits length to prevent filesystem issues
 *
 * @param {string} slug - Slug to sanitize
 * @returns {string} Sanitized slug (empty string if nothing valid remains)
 */
function sanitizeSlug(slug) {
  if (!slug || typeof slug !== 'string') return '';

  let sanitized = slug
    // Remove invalid filename chars first
    .replace(INVALID_FILENAME_CHARS, '')
    // Replace any non-alphanumeric (except hyphen) with hyphen
    .replace(/[^a-z0-9-]/gi, '-')
    // Collapse multiple consecutive hyphens
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Limit length (most filesystems support 255, but keep reasonable)
    .slice(0, 100);

  return sanitized;
}

/**
 * Extract feature slug from git branch name
 * Pattern: (?:feat|fix|chore|refactor|docs)/(?:[^/]+/)?(.+)
 * @param {string} branch - Git branch name
 * @param {string} pattern - Regex pattern (optional)
 * @returns {string|null} Extracted slug or null
 */
function extractSlugFromBranch(branch, pattern) {
  if (!branch) return null;
  const defaultPattern = /(?:feat|fix|chore|refactor|docs)\/(?:[^\/]+\/)?(.+)/;
  const regex = pattern ? new RegExp(pattern) : defaultPattern;
  const match = branch.match(regex);
  return match ? sanitizeSlug(match[1]) : null;
}

/**
 * Find most recent plan folder by timestamp prefix
 * @param {string} plansDir - Plans directory path
 * @returns {string|null} Most recent plan path or null
 */
function findMostRecentPlan(plansDir) {
  try {
    if (!fs.existsSync(plansDir)) return null;
    const entries = fs.readdirSync(plansDir, { withFileTypes: true });
    const planDirs = entries
      .filter(e => e.isDirectory() && /^\d{6}/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse();
    return planDirs.length > 0 ? path.join(plansDir, planDirs[0]) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Default timeout for git commands (5 seconds)
 * Prevents indefinite hangs on network mounts or corrupted repos
 */
const DEFAULT_EXEC_TIMEOUT_MS = 5000;

/**
 * Safely execute shell command (internal helper)
 * SECURITY: Only accepts whitelisted git read commands
 * @param {string} cmd - Command to execute
 * @param {Object} options - Execution options
 * @param {string} options.cwd - Working directory (optional)
 * @param {number} options.timeout - Timeout in ms (default: 5000)
 * @returns {string|null} Command output or null
 */
function execSafe(cmd, options = {}) {
  const allowedCommands = {
    'git branch --show-current': ['git', ['branch', '--show-current']],
    'git rev-parse --abbrev-ref HEAD': ['git', ['rev-parse', '--abbrev-ref', 'HEAD']],
    'git rev-parse --show-toplevel': ['git', ['rev-parse', '--show-toplevel']]
  };
  const commandSpec = allowedCommands[cmd];
  if (!commandSpec) {
    return null;
  }

  const { cwd = undefined, timeout = DEFAULT_EXEC_TIMEOUT_MS } = options;
  const [file, args] = commandSpec;

  try {
    return execFileSync(file, args, {
      encoding: 'utf8',
      timeout,
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    }).trim();
  } catch (e) {
    return null;
  }
}

/**
 * Resolve active plan path using cascading resolution with tracking
 *
 * Resolution semantics:
 * - 'session': Explicitly set via set-active-plan.cjs → ACTIVE (directive)
 * - 'pointer': Pinned for this worktree and branch, surviving restarts → ACTIVE (directive)
 * - 'branch': Matched from git branch name → SUGGESTED (hint only)
 * - 'mostRecent': REMOVED - was causing stale plan pollution
 *
 * @param {string} sessionId - Session identifier (optional)
 * @param {Object} config - FIS AI Kit config
 * @param {Object} [options] - Options
 * @param {string} [options.cwd] - Directory to resolve the worktree and plans dir from
 * @returns {{ path: string|null, resolvedBy: 'session'|'pointer'|'branch'|null }} Resolution result with tracking
 */
function resolvePlanPath(sessionId, config, options = {}) {
  // The pointer and the branch match are both worktree-scoped, so a caller
  // working outside the process directory (a subagent with its own payload cwd,
  // or `--cwd`) has to be able to say which directory it means.
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  // Anchored on the worktree, not the working directory: `plans/` belongs to the
  // project, so a branch match has to find it from a subdirectory too.
  const configuredPlans = config?.paths?.plans || 'plans';
  const plansDir = path.isAbsolute(configuredPlans)
    ? configuredPlans
    : path.join(getGitRoot(cwd) || cwd, configuredPlans);
  const resolution = config?.plan?.resolution || {};
  const order = resolution.order || ['session', 'pointer', 'branch'];
  const branchPattern = resolution.branchPattern;

  for (const method of order) {
    switch (method) {
      case 'session': {
        const state = readSessionState(sessionId);
        if (state?.activePlan) {
          // Issue #335: Handle both absolute and relative paths
          // - Absolute paths (from updated set-active-plan.cjs): use as-is
          // - Relative paths (legacy): resolve using sessionOrigin if available
          let resolvedPath = state.activePlan;
          if (!path.isAbsolute(resolvedPath) && state.sessionOrigin) {
            // Resolve relative path using session origin directory
            resolvedPath = path.join(state.sessionOrigin, resolvedPath);
          }
          return { path: resolvedPath, resolvedBy: 'session' };
        }
        break;
      }
      case 'pointer': {
        // Required lazily: the pointer store reads this module for git scope, so
        // requiring it at load time would be circular.
        try {
          const { getPointer } = require('./plan-pointer.cjs');
          const pinned = getPointer({ cwd });
          if (pinned.planDir) return { path: pinned.planDir, resolvedBy: 'pointer' };
        } catch (e) {
          // A missing or unreadable pointer store is a resolution miss, not an error
        }
        break;
      }
      case 'branch': {
        try {
          const branch = execSafe('git branch --show-current', { cwd });
          const slug = extractSlugFromBranch(branch, branchPattern);
          if (slug && fs.existsSync(plansDir)) {
            const entries = fs.readdirSync(plansDir, { withFileTypes: true })
              .filter(e => e.isDirectory() && e.name.includes(slug));
            if (entries.length > 0) {
              return {
                path: path.join(plansDir, entries[entries.length - 1].name),
                resolvedBy: 'branch'
              };
            }
          }
        } catch (e) {
          // Ignore errors reading plans dir
        }
        break;
      }
      // NOTE: 'mostRecent' case intentionally removed - was causing stale plan pollution
    }
  }
  return { path: null, resolvedBy: null };
}

/**
 * Normalize path value (trim, remove trailing slashes, handle empty)
 * @param {string} pathValue - Path to normalize
 * @returns {string|null} Normalized path or null if invalid
 */
function normalizePath(pathValue) {
  if (!pathValue || typeof pathValue !== 'string') return null;

  // Trim whitespace
  let normalized = pathValue.trim();

  // Empty after trim = invalid
  if (!normalized) return null;

  // Remove trailing slashes (but keep root "/" or "C:\")
  normalized = normalized.replace(/[/\\]+$/, '');

  // If it became empty (was just slashes), return null
  if (!normalized) return null;

  return normalized;
}

/**
 * Check if path is absolute
 * @param {string} pathValue - Path to check
 * @returns {boolean} True if absolute path
 */
function isAbsolutePath(pathValue) {
  if (!pathValue) return false;
  // Unix absolute: starts with /
  // Windows absolute: starts with drive letter (C:\) or UNC (\\)
  return path.isAbsolute(pathValue);
}

/**
 * Sanitize path values
 * - Normalizes path (trim, remove trailing slashes)
 * - Allows absolute paths (for consolidated plans use case)
 * - Prevents obvious security issues (null bytes, etc.)
 *
 * @param {string} pathValue - Path to sanitize
 * @param {string} projectRoot - Project root for relative path resolution
 * @returns {string|null} Sanitized path or null if invalid
 */
function sanitizePath(pathValue, projectRoot) {
  // Normalize first
  const normalized = normalizePath(pathValue);
  if (!normalized) return null;

  // Block null bytes and other dangerous chars
  if (/[\x00]/.test(normalized)) return null;

  // Allow absolute paths (user explicitly wants consolidated plans elsewhere)
  if (isAbsolutePath(normalized)) {
    return normalized;
  }

  // For relative paths, resolve and validate
  const resolved = path.resolve(projectRoot, normalized);

  // Prevent path traversal outside project (../ attacks)
  // But allow if user explicitly set absolute path
  if (!resolved.startsWith(projectRoot + path.sep) && resolved !== projectRoot) {
    // This is a relative path trying to escape - block it
    return null;
  }

  return normalized;
}

/**
 * Validate and sanitize config paths
 */
function sanitizeConfig(config, projectRoot) {
  const result = { ...config };

  if (result.plan) {
    result.plan = { ...result.plan };
    if (!sanitizePath(result.plan.reportsDir, projectRoot)) {
      result.plan.reportsDir = DEFAULT_CONFIG.plan.reportsDir;
    }
    // Merge resolution defaults
    result.plan.resolution = {
      ...DEFAULT_CONFIG.plan.resolution,
      ...result.plan.resolution
    };
    // Merge validation defaults
    result.plan.validation = {
      ...DEFAULT_CONFIG.plan.validation,
      ...result.plan.validation
    };
  }

  if (result.paths) {
    result.paths = { ...result.paths };
    if (!sanitizePath(result.paths.docs, projectRoot)) {
      result.paths.docs = DEFAULT_CONFIG.paths.docs;
    }
    if (!sanitizePath(result.paths.plans, projectRoot)) {
      result.paths.plans = DEFAULT_CONFIG.paths.plans;
    }
  }

  if (result.locale) {
    result.locale = { ...result.locale };
  }

  return result;
}

/**
 * Load config with cascading resolution across both config formats.
 *
 * Resolution order (each layer overrides the previous):
 *   1. DEFAULT_CONFIG (hardcoded defaults)
 *   2. User legacy config (~/.claude/.fisrc.json)
 *   3. User config (~/.fis/config.yaml)
 *   4. Project legacy config (./.claude/.fisrc.json)
 *   5. Project config (./.fis/config.yaml)
 *
 * Scope is the primary axis: a project setting always outranks a user setting,
 * whichever file it lives in. Within one scope the newer `.fis/config.yaml`
 * wins, because a project that has migrated to it has moved its settings there.
 *
 * @param {Object} options - Options for config loading
 * @param {boolean} options.includeProject - Include project section (default: true)
 * @param {boolean} options.includeAssertions - Include assertions (default: true)
 * @param {boolean} options.includeLocale - Include locale section (default: true)
 * @param {string} options.cwd - Project directory to resolve from (default: process.cwd())
 */
function loadConfig(options = {}) {
  const {
    includeProject = true,
    includeAssertions = true,
    includeLocale = true,
    cwd = process.cwd()
  } = options;
  const projectRoot = cwd;

  // Legacy .fisrc.json layers
  const globalConfig = loadConfigFromPath(GLOBAL_CONFIG_PATH);
  const localConfig = loadConfigFromPath(path.resolve(projectRoot, LOCAL_CONFIG_PATH));

  // Two-tier .fis/config.yaml layers, translated into the internal spelling
  const payload = resolvePrefsPayload({ cwd: projectRoot });
  const userPrefs = payload ? toInternalConfig(payload.layers.user) : null;
  const projectPrefs = payload ? toInternalConfig(payload.layers.project) : null;

  const hasAny = globalConfig || localConfig
    || (userPrefs && Object.keys(userPrefs).length > 0)
    || (projectPrefs && Object.keys(projectPrefs).length > 0);

  // No config files found - use defaults
  if (!hasAny) {
    return getDefaultConfig(includeProject, includeAssertions, includeLocale);
  }

  try {
    let merged = deepMerge({}, DEFAULT_CONFIG);
    if (globalConfig) merged = deepMerge(merged, globalConfig);
    if (userPrefs) merged = deepMerge(merged, userPrefs);
    if (localConfig) merged = deepMerge(merged, localConfig);
    if (projectPrefs) merged = deepMerge(merged, projectPrefs);

    // Build result with optional sections
    const result = {
      plan: merged.plan || DEFAULT_CONFIG.plan,
      paths: merged.paths || DEFAULT_CONFIG.paths,
      docs: merged.docs || DEFAULT_CONFIG.docs
    };

    if (includeLocale) {
      result.locale = merged.locale || DEFAULT_CONFIG.locale;
    }
    // Always include trust config for verification
    result.trust = merged.trust || DEFAULT_CONFIG.trust;
    if (includeProject) {
      result.project = merged.project || DEFAULT_CONFIG.project;
    }
    if (includeAssertions) {
      result.assertions = merged.assertions || [];
    }
    // Coding level for output style selection (-1 to 5, default: -1 = disabled)
    // -1 = disabled (no injection, saves tokens)
    // 0-5 = inject corresponding level guidelines
    result.codingLevel = merged.codingLevel ?? -1;
    // Skills configuration
    result.skills = merged.skills || DEFAULT_CONFIG.skills;
    // Hooks configuration
    result.hooks = merged.hooks || DEFAULT_CONFIG.hooks;
    // Statusline mode
    result.statusline = merged.statusline || 'full';
    result.statuslineColors = merged.statuslineColors ?? true;
    result.statuslineQuota = merged.statuslineQuota ?? true;
    result.statuslineLayout = merged.statuslineLayout || undefined;

    // Sections carried through verbatim when set, so a caller reading them gets
    // the merged value and can apply its own defaults for anything absent.
    for (const section of PASSTHROUGH_SECTIONS) {
      if (merged[section] !== undefined) result[section] = merged[section];
    }

    return sanitizeConfig(result, projectRoot);
  } catch (e) {
    return getDefaultConfig(includeProject, includeAssertions, includeLocale);
  }
}

/**
 * Get default config with optional sections
 */
function getDefaultConfig(includeProject = true, includeAssertions = true, includeLocale = true) {
  const result = {
    plan: { ...DEFAULT_CONFIG.plan },
    paths: { ...DEFAULT_CONFIG.paths },
    docs: { ...DEFAULT_CONFIG.docs },
    codingLevel: -1,  // Default: disabled (no injection, saves tokens)
    skills: { ...DEFAULT_CONFIG.skills },
    hooks: { ...DEFAULT_CONFIG.hooks },
    statusline: 'full',
    statuslineColors: true,
    statuslineQuota: true
  };
  if (includeLocale) {
    result.locale = { ...DEFAULT_CONFIG.locale };
  }
  if (includeProject) {
    result.project = { ...DEFAULT_CONFIG.project };
  }
  if (includeAssertions) {
    result.assertions = [];
  }
  return result;
}

/**
 * Escape shell special characters for env file values
 * Handles: backslash, double quote, dollar sign, backtick
 */
function escapeShellValue(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/\\/g, '\\\\')   // Backslash first
    .replace(/"/g, '\\"')     // Double quotes
    .replace(/\$/g, '\\$')    // Dollar sign
    .replace(/`/g, '\\`');    // Backticks (command substitution)
}

/**
 * Write environment variable to CLAUDE_ENV_FILE (with escaping)
 */
function writeEnv(envFile, key, value) {
  if (envFile && value !== null && value !== undefined) {
    const escaped = escapeShellValue(String(value));
    fs.appendFileSync(envFile, `export ${key}="${escaped}"\n`);
  }
}

/**
 * Get reports path based on plan resolution
 * Only uses plan-specific path for 'session' resolved plans (explicitly active)
 * Branch-matched (suggested) plans use default path to avoid pollution
 *
 * @param {string|null} planPath - The plan path
 * @param {string|null} resolvedBy - How plan was resolved ('session'|'pointer'|'branch'|null)
 * @param {Object} planConfig - Plan configuration
 * @param {Object} pathsConfig - Paths configuration
 * @param {string|null} baseDir - Optional base directory for absolute path resolution
 * @returns {string} Reports path (absolute if baseDir provided, relative otherwise)
 */
function getReportsPath(planPath, resolvedBy, planConfig, pathsConfig, baseDir = null) {
  const reportsDir = normalizePath(planConfig?.reportsDir) || 'reports';
  const plansDir = normalizePath(pathsConfig?.plans) || 'plans';

  let reportPath;
  // Only use plan-specific reports path if explicitly active (session or pointer)
  // Issue #327: Validate normalized path to prevent whitespace-only paths creating invalid directories
  const normalizedPlanPath = planPath && isDirectivePlan(resolvedBy) ? normalizePath(planPath) : null;
  if (normalizedPlanPath) {
    reportPath = `${normalizedPlanPath}/${reportsDir}`;
  } else {
    // Default path for no plan or suggested (branch-matched) plans
    reportPath = `${plansDir}/${reportsDir}`;
  }

  // Return absolute path if baseDir provided
  // Guard: if reportPath is already absolute (Issue #335 made planPath absolute),
  // don't double-join with baseDir — path.join concatenates, not resolves
  if (baseDir) {
    return path.isAbsolute(reportPath) ? reportPath : path.join(baseDir, reportPath);
  }
  return reportPath + '/';
}

/**
 * Format issue ID with prefix
 */
function formatIssueId(issueId, planConfig) {
  if (!issueId) return null;
  return planConfig.issuePrefix ? `${planConfig.issuePrefix}${issueId}` : `#${issueId}`;
}

/**
 * Extract issue ID from branch name
 */
function extractIssueFromBranch(branch) {
  if (!branch) return null;
  const patterns = [
    /(?:issue|gh|fix|feat|bug)[/-]?(\d+)/i,
    /[/-](\d+)[/-]/,
    /#(\d+)/
  ];
  for (const pattern of patterns) {
    const match = branch.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Format date according to dateFormat config
 * Supports: YYMMDD, YYMMDD-HHmm, YYYYMMDD, etc.
 * @param {string} format - Date format string
 * @returns {string} Formatted date
 */
function formatDate(format) {
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');

  const tokens = {
    'YYYY': now.getFullYear(),
    'YY': String(now.getFullYear()).slice(-2),
    'MM': pad(now.getMonth() + 1),
    'DD': pad(now.getDate()),
    'HH': pad(now.getHours()),
    'mm': pad(now.getMinutes()),
    'ss': pad(now.getSeconds())
  };

  let result = format;
  for (const [token, value] of Object.entries(tokens)) {
    result = result.replace(token, value);
  }
  return result;
}

/**
 * Validate naming pattern result
 * Ensures pattern resolves to a usable directory name
 *
 * @param {string} pattern - Resolved naming pattern
 * @returns {{ valid: boolean, error?: string }} Validation result
 */
function validateNamingPattern(pattern) {
  if (!pattern || typeof pattern !== 'string') {
    return { valid: false, error: 'Pattern is empty or not a string' };
  }

  // After removing {slug} placeholder, should still have content
  const withoutSlug = pattern.replace(/\{slug\}/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!withoutSlug) {
    return { valid: false, error: 'Pattern resolves to empty after removing {slug}' };
  }

  // Check for remaining unresolved placeholders (besides {slug})
  const unresolvedMatch = withoutSlug.match(/\{[^}]+\}/);
  if (unresolvedMatch) {
    return { valid: false, error: `Unresolved placeholder: ${unresolvedMatch[0]}` };
  }

  // Pattern must contain {slug} for agents to substitute
  if (!pattern.includes('{slug}')) {
    return { valid: false, error: 'Pattern must contain {slug} placeholder' };
  }

  return { valid: true };
}

/**
 * Resolve naming pattern with date and optional issue prefix
 * Keeps {slug} as placeholder for agents to substitute
 *
 * Example: namingFormat="{date}-{issue}-{slug}", dateFormat="YYMMDD-HHmm", issue="GH-88"
 * Returns: "251212-1830-GH-88-{slug}" (if issue exists)
 * Returns: "251212-1830-{slug}" (if no issue)
 *
 * @param {Object} planConfig - Plan configuration
 * @param {string|null} gitBranch - Current git branch (for issue extraction)
 * @returns {string} Resolved naming pattern with {slug} placeholder
 */
function resolveNamingPattern(planConfig, gitBranch) {
  const { namingFormat, dateFormat, issuePrefix } = planConfig;
  const formattedDate = formatDate(dateFormat);

  // Try to extract issue ID from branch name
  const issueId = extractIssueFromBranch(gitBranch);
  const fullIssue = issueId && issuePrefix ? `${issuePrefix}${issueId}` : null;

  // Build pattern by substituting {date} and {issue}, keep {slug}
  let pattern = namingFormat;
  pattern = pattern.replace('{date}', formattedDate);

  if (fullIssue) {
    pattern = pattern.replace('{issue}', fullIssue);
  } else {
    // Remove {issue} and any trailing/leading dash
    pattern = pattern.replace(/-?\{issue\}-?/, '-').replace(/--+/g, '-');
  }

  // Clean up the result:
  // - Remove leading/trailing hyphens
  // - Collapse multiple hyphens (except around {slug})
  pattern = pattern
    .replace(/^-+/, '')           // Remove leading hyphens
    .replace(/-+$/, '')           // Remove trailing hyphens
    .replace(/-+(\{slug\})/g, '-$1')  // Single hyphen before {slug}
    .replace(/(\{slug\})-+/g, '$1-')  // Single hyphen after {slug}
    .replace(/--+/g, '-');        // Collapse other multiple hyphens

  // Validate the resulting pattern
  const validation = validateNamingPattern(pattern);
  if (!validation.valid) {
    // Log warning but return pattern anyway (fail-safe)
    if (process.env.FIS_DEBUG) {
      console.error(`[fis-config] Warning: ${validation.error}`);
    }
  }

  return pattern;
}

/**
 * Get current git branch (safe execution)
 * @param {string|null} cwd - Working directory to run git command from (optional)
 * @returns {string|null} Current branch name or null
 */
function getGitBranch(cwd = null) {
  return execSafe('git branch --show-current', { cwd: cwd || undefined });
}

/**
 * Get git repository root directory
 * @param {string|null} cwd - Working directory to run git command from (optional)
 * @returns {string|null} Git root absolute path or null if not in git repo
 */
function getGitRoot(cwd = null) {
  return execSafe('git rev-parse --show-toplevel', { cwd: cwd || undefined });
}

/**
 * Whether a resolution came from an explicit act by the user.
 *
 * Session state and the worktree pointer are both deliberate — someone named the
 * plan. A branch-name match is inference, so it stays a suggestion and never
 * becomes the active plan on its own.
 *
 * @param {string|null} resolvedBy - Resolution source
 * @returns {boolean} Whether the plan is directive rather than suggested
 */
function isDirectivePlan(resolvedBy) {
  return resolvedBy === 'session' || resolvedBy === 'pointer';
}

/**
 * Extract task list ID from plan resolution for Claude Code Tasks coordination
 * Only returns ID for explicitly activated plans, not branch-suggested ones
 *
 * Cross-platform: path.basename() handles both Unix/Windows separators
 *
 * @param {{ path: string|null, resolvedBy: 'session'|'pointer'|'branch'|null }} resolved - Plan resolution result
 * @returns {string|null} Task list ID (plan directory name) or null
 */
function extractTaskListId(resolved) {
  if (!resolved || !isDirectivePlan(resolved.resolvedBy) || !resolved.path) {
    return null;
  }
  return path.basename(resolved.path);
}

/**
 * Words a YAML 1.1 writer reaches for that this parser reads as a plain string,
 * because it follows the 1.2 core schema where only `true`/`false` are boolean.
 * A truthy string would silently leave a hook running, so a toggle accepts them.
 * The check is here rather than in the parser: `no` is also the language code for
 * Norwegian, and `locale.response_language: no` must stay a string.
 */
const FALSE_WORDS = new Set(['false', 'no', 'off', 'n', '0']);

/**
 * Check if a hook is enabled in config
 * Returns true if hook is not defined (default enabled)
 *
 * @param {string} hookName - Hook name (script basename without .cjs)
 * @param {Object} [options] - Options
 * @param {string} [options.cwd] - Project directory to resolve from
 * @returns {boolean} Whether hook is enabled
 */
function isHookEnabled(hookName, options = {}) {
  const config = loadConfig({
    includeProject: false,
    includeAssertions: false,
    includeLocale: false,
    cwd: options.cwd
  });
  const hooks = config.hooks || {};
  const setting = hooks[hookName];

  if (setting === false) return false;
  if (typeof setting === 'string' && FALSE_WORDS.has(setting.trim().toLowerCase())) return false;

  // Undefined means enabled: a hook the config does not mention still runs.
  return true;
}

module.exports = {
  CONFIG_PATH,
  LOCAL_CONFIG_PATH,
  GLOBAL_CONFIG_PATH,
  DEFAULT_CONFIG,
  PASSTHROUGH_SECTIONS,
  INVALID_FILENAME_CHARS,
  deepMerge,
  loadConfigFromPath,
  loadConfig,
  normalizePath,
  isAbsolutePath,
  sanitizePath,
  sanitizeSlug,
  sanitizeConfig,
  escapeShellValue,
  writeEnv,
  createSessionStateContext,
  getSessionTempPath,
  readSessionState,
  writeSessionState,
  updateSessionState,
  readContextState: sessionStore.readContextState,
  writeContextState: sessionStore.writeContextState,
  toDisplayPath,
  resolvePlanPath,
  extractSlugFromBranch,
  findMostRecentPlan,
  getReportsPath,
  formatIssueId,
  extractIssueFromBranch,
  formatDate,
  validateNamingPattern,
  resolveNamingPattern,
  getGitBranch,
  getGitRoot,
  extractTaskListId,
  isDirectivePlan,
  isHookEnabled
};

