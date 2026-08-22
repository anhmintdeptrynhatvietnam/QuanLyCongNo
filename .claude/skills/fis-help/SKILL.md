---
name: fis:help
description: "Open the FIS AI Kit help index. Use when users ask how to use the kit, what skills are available, or which workflow to run for their task."
user-invocable: true
when_to_use: "Use when the user asks how to use the kit, which skills are installed, or which workflow fits the task in front of them."
category: utilities
keywords: [help, index, catalog, skills, routing, discovery, workflow]
license: MIT
argument-hint: "[task or topic]"
metadata:
  author: fis-ai-kit
  version: "1.0.0"
---

# Help

Open the FIS AI Kit help index when users ask how to use the kit, what skills
are available, or which workflow fits their task.

Use the runtime's installed-skill catalog when available. Otherwise discover
current `SKILL.md` files from the active project and user skill roots, then read
frontmatter only for relevant candidates. Do not rely on a bundled catalog,
copied count, or remembered skill list.

Summarize only the candidates that fit the request. Route to the most specific
installed skill when the user's task is clear; state plainly when a referenced
skill is not installed.

When the user needs an invocation, read the installed kit's own documentation
surface — the skill's `SKILL.md`, its `argument-hint`, and any `README.md` or
docs shipped beside it — and keep examples scoped to what is installed here.
There is no global CLI: payload-local scripts are invoked from their own paths,
and the DAI desktop app owns installation and orchestration. Help prose is not a
command registry.
