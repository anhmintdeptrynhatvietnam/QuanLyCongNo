#!/usr/bin/env node
/**
 * SessionStart Hook - Initializes session environment with project detection
 *
 * Fires: Once per session (startup, resume, clear, compact)
 * Purpose: Load config, detect project info, persist to env vars, output context
 *
 * Exit Codes:
 *   0 - Success (non-blocking, allows continuation)
 *
 * Core detection logic extracted to lib/project-detector.cjs for OpenCode plugin reuse.
 */

// Crash wrapper
try {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const {
    createSessionStateContext,
    loadConfig,
    readSessionState,
    writeEnv,
    updateSessionState,
    resolvePlanPath,
    getReportsPath,
    resolveNamingPattern,
    extractTaskListId,
    isDirectivePlan,
    isHookEnabled
  } = require('./lib/fis-config-utils.cjs');
  const { createHookTimer, logHookCrash } = require('./lib/hook-logger.cjs');
  const { resolvePlanAccessor } = require('./lib/context-builder.cjs');
  const {
    loadProjectCheckpoint,
    loadState,
    refreshStatuslineSnapshot
  } = require('./lib/session-state-manager.cjs');
  const { createEmptyActivitySnapshot } = require('./lib/statusline-session-cache.cjs');
  const { renderSessionState, safeDisplayValue } = require('./lib/session-state-renderer.cjs');

  // Early exit if hook disabled in config
  if (!isHookEnabled('session-init')) {
    process.exit(0);
  }

  // Import shared project detection logic
  const {
    detectProjectType,
    detectPackageManager,
    detectFramework,
    getGitBranch,
    getGitRoot,
    getCodingLevelStyleName,
    getCodingLevelGuidelines,
    buildContextOutput
  } = require('./lib/project-detector.cjs');

/**
 * One-time cleanup for orphaned .shadowed/ directories from skill-dedup hook (Issue #422)
 * The hook is disabled, but existing orphaned skills still need recovery on startup.
 */
function cleanupOrphanedShadowedSkills() {
  const shadowedDir = path.join(process.cwd(), '.claude', 'skills', '.shadowed');
  if (!fs.existsSync(shadowedDir)) return { restored: [], skipped: [], kept: [] };

  const skillsDir = path.join(process.cwd(), '.claude', 'skills');
  const restored = [];
  const skipped = [];
  const kept = [];

  try {
    const entries = fs.readdirSync(shadowedDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const src = path.join(shadowedDir, entry.name);
      const dest = path.join(skillsDir, entry.name);

      try {
        if (!fs.existsSync(dest)) {
          fs.renameSync(src, dest);
          restored.push(entry.name);
          continue;
        }

        const orphanedSkill = path.join(src, 'SKILL.md');
        const localSkill = path.join(dest, 'SKILL.md');
        if (fs.existsSync(orphanedSkill) && fs.existsSync(localSkill)) {
          const orphanedContent = fs.readFileSync(orphanedSkill, 'utf8');
          const localContent = fs.readFileSync(localSkill, 'utf8');
          if (orphanedContent === localContent) {
            fs.rmSync(src, { recursive: true, force: true });
            skipped.push(entry.name);
          } else {
            kept.push(entry.name);
          }
        } else {
          fs.rmSync(src, { recursive: true, force: true });
          skipped.push(entry.name);
        }
      } catch (error) {
        process.stderr.write(`[session-init] Failed to process "${entry.name}": ${error.message}\n`);
      }
    }

    const manifestFile = path.join(shadowedDir, '.dedup-manifest.json');
    if (fs.existsSync(manifestFile)) fs.unlinkSync(manifestFile);
    if (fs.existsSync(shadowedDir) && fs.readdirSync(shadowedDir).length === 0) {
      fs.rmdirSync(shadowedDir);
    }

    return { restored, skipped, kept };
  } catch (error) {
    process.stderr.write(`[session-init] Shadowed cleanup error: ${error.message}\n`);
    return { restored, skipped, kept };
  }
}

/**
 * Detect if this session is running inside an Agent Team.
 * Scans ~/.claude/teams/ for active team configs and checks membership.
 * Note: Returns first team found — Claude Code supports one team per session.
 * Note: Team lifecycle (creation/cleanup) is managed by Claude Code, not this hook.
 * @returns {{ teamName: string, memberCount: number } | null}
 */
function detectAgentTeam() {
  try {
    const teamsDir = path.join(os.homedir(), '.claude', 'teams');
    if (!fs.existsSync(teamsDir)) return null;

    const teams = fs.readdirSync(teamsDir, { withFileTypes: true });
    for (const entry of teams) {
      if (!entry.isDirectory()) continue;
      const configPath = path.join(teamsDir, entry.name, 'config.json');
      if (!fs.existsSync(configPath)) continue;
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.members && config.members.length > 0) {
          return { teamName: entry.name, memberCount: config.members.length };
        }
      } catch { /* skip malformed configs */ }
    }
    return null;
  } catch {
    return null;
  }
}

function shouldWarmStatuslineCache(source, snapshot) {
  if (!['startup', 'resume', 'compact'].includes(source)) return false;
  return !snapshot || snapshot.warmed !== true;
}

/**
 * Render the state worth showing at the top of a session.
 *
 * Compaction keeps the same session, so its own snapshot is what was lost;
 * a fresh start inherits from whichever session checkpointed last. Agents are
 * only meaningful in the first case, since agents from a finished session are
 * already gone.
 */
function renderRecoveryState(sessionContext, source) {
  if (!sessionContext) return '';
  const compact = source === 'compact';
  const state = compact
    ? readSessionState(sessionContext)
    : loadProjectCheckpoint(sessionContext);
  if (!state) return '';

  return renderSessionState({
    ...state,
    agents: compact ? state.statusline?.agents : undefined,
    todos: compact ? state.statusline?.todos : state.todos
  }, source);
}

/**
 * Main hook execution
 */
async function main() {
  const timer = createHookTimer('session-init', { event: 'SessionStart' });
  try {
    const shadowedCleanup = cleanupOrphanedShadowedSkills();
    const stdin = fs.readFileSync(0, 'utf-8').trim();
    const data = stdin ? JSON.parse(stdin) : {};
    const envFile = process.env.CLAUDE_ENV_FILE;
    const source = data.source || 'unknown';
    const sessionId = data.session_id || null;
    // This is the hook that starts a session, so it claims the identity every
    // later hook resolves against. Without a binding they fall back to the
    // session-id file, which is what installs upgrading mid-session still have.
    const sessionContext = createSessionStateContext({
      sessionId,
      cwd: data.cwd || process.cwd(),
      bindSession: true
    });
    const stateTarget = sessionContext || sessionId;
    const existingSession = stateTarget ? readSessionState(stateTarget) : null;

    const config = loadConfig();
    const sessionStateEnabled = config.hooks?.['session-state'] !== false;

    const detections = {
      type: detectProjectType(config.project?.type),
      pm: detectPackageManager(config.project?.packageManager),
      framework: detectFramework(config.project?.framework)
    };

    // Resolve plan - now returns { path, resolvedBy }
    const resolved = resolvePlanPath(null, config);

    if (stateTarget) {
      updateSessionState(stateTarget, prev => ({
        ...prev,
        sessionOrigin: process.cwd(),
        activePlan: isDirectivePlan(resolved.resolvedBy) ? resolved.path : null,
        suggestedPlan: resolved.resolvedBy === 'branch' ? resolved.path : null,
        timestamp: Date.now(),
        source,
        statusline: prev.statusline || createEmptyActivitySnapshot()
      }));
    }

    if (sessionStateEnabled && stateTarget && shouldWarmStatuslineCache(source, existingSession?.statusline)) {
      await (sessionContext
        ? refreshStatuslineSnapshot(sessionContext, data)
        : refreshStatuslineSnapshot(data));
    }

    // Reports path only uses active plans, not suggested ones. Resolved against
    // the working directory here rather than joined later: an active plan path is
    // already absolute, and joining it onto the base directory would double it.
    const reportsPath = getReportsPath(resolved.path, resolved.resolvedBy, config.plan, config.paths, process.cwd());

    // Extract task list ID for Claude Code Tasks coordination (shared helper)
    const taskListId = extractTaskListId(resolved);

    // Keep startup metadata cheap. Expensive enrichment is intentionally deferred.
    const staticEnv = {
      nodeVersion: process.version,
      osPlatform: process.platform,
      gitBranch: getGitBranch(),
      gitRoot: getGitRoot(),
      user: process.env.USERNAME || process.env.USER || process.env.LOGNAME || os.userInfo().username,
      locale: process.env.LANG || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      claudeSettingsDir: path.resolve(__dirname, '..')
    };

    // Compute base directory for absolute paths (Issue #327: use CWD for subdirectory support)
    // Git root is kept in staticEnv for reference, but CWD determines where files are created
    const baseDir = process.cwd();

    // Compute resolved naming pattern (date + issue resolved, {slug} kept as placeholder)
    const namePattern = resolveNamingPattern(config.plan, staticEnv.gitBranch);

    if (envFile) {
      // Session & plan config
      writeEnv(envFile, 'FIS_SESSION_ID', sessionId || '');
      writeEnv(envFile, 'FIS_PLAN_NAMING_FORMAT', config.plan.namingFormat);
      writeEnv(envFile, 'FIS_PLAN_DATE_FORMAT', config.plan.dateFormat);
      writeEnv(envFile, 'FIS_PLAN_ISSUE_PREFIX', config.plan.issuePrefix || '');
      writeEnv(envFile, 'FIS_PLAN_REPORTS_DIR', config.plan.reportsDir);

      // NEW: Resolved naming pattern for DRY file naming in agents
      // Example: "251212-1830-GH-88-{slug}" or "251212-1830-{slug}"
      // Agents use: `{agent-type}-$FIS_NAME_PATTERN.md` and substitute {slug}
      writeEnv(envFile, 'FIS_NAME_PATTERN', namePattern);

      // Plan resolution
      writeEnv(envFile, 'FIS_ACTIVE_PLAN', isDirectivePlan(resolved.resolvedBy) ? resolved.path : '');
      writeEnv(envFile, 'FIS_SUGGESTED_PLAN', resolved.resolvedBy === 'branch' ? resolved.path : '');

      // Claude Code Tasks integration - enables multi-session/subagent coordination
      // Task list ID = plan directory name (shared across all sessions working on same plan)
      if (taskListId) {
        writeEnv(envFile, 'CLAUDE_CODE_TASK_LIST_ID', taskListId);
      }

      // Where the plan accessor lives for this install scope, so skills and
      // agents never hardcode a path that only exists in one of them
      const planAccessor = resolvePlanAccessor({ absolute: true });
      if (planAccessor) {
        writeEnv(envFile, 'FIS_PLAN_ACCESSOR', planAccessor);
      }

      // Paths - use absolute paths based on CWD for subdirectory workflow support (Issue #327)
      writeEnv(envFile, 'FIS_GIT_ROOT', staticEnv.gitRoot || '');
      writeEnv(envFile, 'FIS_REPORTS_PATH', reportsPath);
      writeEnv(envFile, 'FIS_DOCS_PATH', path.join(baseDir, config.paths.docs));
      writeEnv(envFile, 'FIS_PLANS_PATH', path.join(baseDir, config.paths.plans));
      writeEnv(envFile, 'FIS_PROJECT_ROOT', process.cwd());

      // Project detection
      writeEnv(envFile, 'FIS_PROJECT_TYPE', detections.type || '');
      writeEnv(envFile, 'FIS_PACKAGE_MANAGER', detections.pm || '');
      writeEnv(envFile, 'FIS_FRAMEWORK', detections.framework || '');

      // NEW: Static environment info (so other hooks don't need to recompute)
      writeEnv(envFile, 'FIS_NODE_VERSION', staticEnv.nodeVersion);
      writeEnv(envFile, 'FIS_OS_PLATFORM', staticEnv.osPlatform);
      writeEnv(envFile, 'FIS_GIT_BRANCH', staticEnv.gitBranch || '');
      writeEnv(envFile, 'FIS_USER', staticEnv.user);
      writeEnv(envFile, 'FIS_LOCALE', staticEnv.locale);
      writeEnv(envFile, 'FIS_TIMEZONE', staticEnv.timezone);
      writeEnv(envFile, 'FIS_CLAUDE_SETTINGS_DIR', staticEnv.claudeSettingsDir);

      // Locale config
      if (config.locale?.thinkingLanguage) {
        writeEnv(envFile, 'FIS_THINKING_LANGUAGE', config.locale.thinkingLanguage);
      }
      if (config.locale?.responseLanguage) {
        writeEnv(envFile, 'FIS_RESPONSE_LANGUAGE', config.locale.responseLanguage);
      }

      // Plan validation config (for /fis:plan validate, /fis:plan --hard, /fis:plan --parallel)
      const validation = config.plan?.validation || {};
      writeEnv(envFile, 'FIS_VALIDATION_MODE', validation.mode || 'prompt');
      writeEnv(envFile, 'FIS_VALIDATION_MIN_QUESTIONS', validation.minQuestions || 3);
      writeEnv(envFile, 'FIS_VALIDATION_MAX_QUESTIONS', validation.maxQuestions || 8);
      writeEnv(envFile, 'FIS_VALIDATION_FOCUS_AREAS', (validation.focusAreas || ['assumptions', 'risks', 'tradeoffs', 'architecture']).join(','));

      // Coding level config (for output style selection)
      const codingLevel = config.codingLevel ?? 5;
      writeEnv(envFile, 'FIS_CODING_LEVEL', codingLevel);
      writeEnv(envFile, 'FIS_CODING_LEVEL_STYLE', getCodingLevelStyleName(codingLevel));

    }

    // Agent Teams detection — detect once, used for env vars and console output
    const teamInfo = detectAgentTeam();
    if (envFile && teamInfo) {
      writeEnv(envFile, 'FIS_AGENT_TEAM', teamInfo.teamName);
      writeEnv(envFile, 'FIS_AGENT_TEAM_MEMBERS', teamInfo.memberCount);
    }

    console.log(`Session ${source}. ${buildContextOutput(config, detections, resolved, staticEnv.gitRoot)}`);

    const hasCleanup =
      shadowedCleanup.restored.length > 0 ||
      shadowedCleanup.skipped.length > 0 ||
      shadowedCleanup.kept.length > 0;
    if (hasCleanup) {
      console.log(`\n[!] SKILL-DEDUP CLEANUP (Issue #422):`);
      console.log(`Recovered orphaned .shadowed/ directory from disabled skill-dedup hook.`);
      if (shadowedCleanup.restored.length > 0) {
        console.log(`Restored ${shadowedCleanup.restored.length} skill(s): ${shadowedCleanup.restored.join(', ')}`);
      }
      if (shadowedCleanup.skipped.length > 0) {
        console.log(`Removed ${shadowedCleanup.skipped.length} duplicate(s): ${shadowedCleanup.skipped.join(', ')}`);
      }
      if (shadowedCleanup.kept.length > 0) {
        console.log(`[!] Kept ${shadowedCleanup.kept.length} skill(s) for manual review (content differs): ${shadowedCleanup.kept.join(', ')}`);
        console.log(`    Review .claude/skills/.shadowed/ and merge changes manually.`);
      }
    }

    if (sessionStateEnabled && (source === 'startup' || source === 'compact')) {
      // Structured state first: on compact it is this session's own snapshot, on
      // startup it is the checkpoint a previous session left behind. The markdown
      // state below is the fallback for sessions with neither.
      const renderedState = renderRecoveryState(sessionContext, source);
      if (renderedState) {
        console.log(`\n${renderedState}\n`);
        console.log(source === 'compact'
          ? 'Context was compacted. Re-read the active plan and todo list before continuing.'
          : 'Review the previous-session status data, then continue or start fresh.');
      }

      const previousState = renderedState ? null : loadState(process.cwd());
      if (previousState) {
        if (source === 'compact') {
          console.log('\n--- Session State (Post-Compaction Recovery) ---');
          console.log(previousState);
          console.log('--- End Session State ---\n');
          console.log('Context was compacted. Above is your last saved progress. Resume from where you left off.');
          console.log('IMPORTANT: Re-read active plan files and todo list. Do NOT re-do completed work.');
        } else {
          console.log('\n--- Previous Session State ---');
          console.log(previousState);
          console.log('--- End Session State ---\n');
          console.log('Review above state from your last session. Continue where you left off or start fresh.');
        }
      }
    }

    // Agent Teams: Show team context if running inside a team (uses cached result)
    if (teamInfo) {
      console.log(`[i] Agent Team detected: "${teamInfo.teamName}" (${teamInfo.memberCount} members)`);
      console.log(`    Team config: ~/.claude/teams/${teamInfo.teamName}/config.json`);
      console.log(`    Use /fis:team skill for orchestration templates.`);
    }

    // Info: Show git root when running from subdirectory (Issue #327: now supported)
    if (staticEnv.gitRoot && staticEnv.gitRoot !== process.cwd()) {
      console.log(`📁 Subdirectory mode: Plans/docs will be created in current directory`);
      console.log(`   Git root: ${staticEnv.gitRoot}`);
    }

    // MITIGATION: Issue #277 - Auto-compact can bypass AskUserQuestion approval gates
    // When context is compacted mid-workflow, the summarization may lose "pending approval" state.
    // This warning reminds Claude to verify if user approval was pending before proceeding.
    // Upstream bug: Claude Code CLI should preserve pending interactive state during compaction.
    if (source === 'compact') {
      console.log(`\n⚠️ CONTEXT COMPACTED - APPROVAL STATE CHECK:`);
      console.log(`If you were waiting for user approval via AskUserQuestion (e.g., Step 4 review gate),`);
      console.log(`you MUST re-confirm with the user before proceeding. Do NOT assume approval was given.`);
      console.log(`Use AskUserQuestion to verify: "Context was compacted. Please confirm approval to continue."`);

      // Compaction can drop the record of background processes started earlier
      // this session (PIDs, ports, worktrees). The reminder belongs here rather
      // than in PreCompact, whose stdout never reaches the model.
      console.log(`\n🧹 ORPHAN PROCESS CHECK:`);
      console.log(`Before continuing, reconcile the background processes you started earlier this`);
      console.log(`session (dev servers, watchers, tunnels). Note the still-needed ones (command,`);
      console.log(`PID, port, worktree) and stop the rest so orphaned processes do not pile up and`);
      console.log(`exhaust device memory. See .claude/rules/process-management.md.`);

      // precompact-capture.cjs recorded the derivable orientation before
      // compaction; surface it here and ask for the parts a hook cannot derive.
      const recovery = sessionContext ? readSessionState(sessionContext)?.compactRecovery : null;
      console.log(`\n🧭 CONTEXT RECOVERY:`);
      if (recovery) {
        if (recovery.worktree) console.log(`  Worktree: ${safeDisplayValue(recovery.worktree)}`);
        if (recovery.mainRoot) console.log(`  Root project: ${safeDisplayValue(recovery.mainRoot)}`);
        if (recovery.branch) {
          const head = recovery.head ? ` @ ${safeDisplayValue(recovery.head)}` : '';
          const dirty = recovery.dirtyCount ? ` (${recovery.dirtyCount} uncommitted)` : '';
          console.log(`  Branch: ${safeDisplayValue(recovery.branch)}${head}${dirty}`);
        }
        if (recovery.activePlan) console.log(`  Active plan: ${safeDisplayValue(recovery.activePlan)}`);
      }
      console.log(`Re-establish before continuing: the issues/PRs in flight, the active plan and`);
      console.log(`current phase, what is done vs. still pending, any failures and their cause, and`);
      console.log(`why the current approach was chosen. Re-read the active plan and notes first.`);
    }

    // Auto-inject coding level guidelines (if not disabled)
    const codingLevel = config.codingLevel ?? -1;
    const guidelines = getCodingLevelGuidelines(codingLevel);
    if (guidelines) {
      console.log(`\n${guidelines}`);
    }

    if (config.assertions?.length > 0) {
      console.log(`\nUser Assertions:`);
      config.assertions.forEach((assertion, i) => {
        console.log(`  ${i + 1}. ${assertion}`);
      });
    }

    timer.end({ status: 'ok', exit: 0, note: source || 'session-start' });
    process.exit(0);
  } catch (error) {
    console.error(`SessionStart hook error: ${error.message}`);
    logHookCrash('session-init', error, { event: 'SessionStart' });
    process.exit(0);
  }
  }

  main();
} catch (e) {
  try {
    const { logHookCrash } = require('./lib/hook-logger.cjs');
    logHookCrash('session-init', e, { event: 'SessionStart' });
  } catch (_) {}
  process.exit(0); // fail-open
}
