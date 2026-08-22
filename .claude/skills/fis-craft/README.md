# Craft Skill

End-to-end feature implementation with smart intent detection.

## Installation

Copy the `fis-craft/` folder to the canonical installed path:
```bash
cp -R fis-craft ~/.claude/skills/fis-craft
```

## Usage

```bash
/fis:craft <natural language task OR plan path>
```

The skill automatically detects your intent and routes to the appropriate workflow.

## Examples

```bash
# Interactive mode (default)
/fis:craft implement user authentication

# Execute existing plan
/fis:craft plans/260120-auth

# Fast mode (skip research)
/fis:craft quick fix for login bug
/fis:craft implement feature --fast

# Auto mode (trust me bro)
/fis:craft implement dashboard trust me
/fis:craft implement feature --auto

# Parallel mode (multi-agent)
/fis:craft implement auth, payments, notifications
/fis:craft implement feature --parallel

# No-test mode
/fis:craft implement feature --no-test

# TDD mode (composable with any workflow)
/fis:craft refactor auth middleware --tdd
/fis:craft plans/260120-auth/phase-02-api.md --tdd
```

## Modes

| Mode | Research | Testing | Review | Use Case |
|------|----------|---------|--------|----------|
| interactive | ✓ | ✓ | User approval | Default, full control |
| auto | ✓ | ✓ | Auto if score≥9.5 | Trusted, hands-off |
| fast | ✗ | ✓ | Simplified | Quick fixes |
| parallel | Optional | ✓ | User approval | Multi-feature work |
| no-test | ✓ | ✗ | User approval | Speed priority |
| code | ✗ | ✓ | User approval | Existing plans |

## Intent Detection

The skill detects mode from:
1. **Explicit flags:** `--interactive`, `--fast`, `--auto`, `--parallel`, `--no-test`
   - `--tdd` is composable and does not change the detected mode
2. **Plan paths:** `./plans/*`, `plan.md`, `phase-*.md`
3. **Keywords:** "fast", "quick", "trust me", "auto", "no test"
4. **Feature count:** 3+ features → parallel mode

## Workflow

```
[Intent Detection] → [Research?] → [Plan] → [Implement] → [Test?] → [Review] → [Finalize]
```

## Files

```
fis-craft/
├── SKILL.md                           # Main skill definition
├── README.md                          # This file
└── references/
    ├── intent-detection.md            # Detection rules
    ├── workflow-steps.md              # Step definitions
    ├── review-cycle.md                # Review process
    └── subagent-patterns.md           # Subagent usage
```

## Version

2.1.1 - Added `--tdd` guidance and stronger implementation conformance rules
2.1.0 - Review gates added for human-in-the-loop mode
2.0.0 - Smart intent detection (hybrid approach)
