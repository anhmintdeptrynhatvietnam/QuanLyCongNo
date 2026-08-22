# Visual Explanation Routing

Use this file when a workflow asks for a visual explanation, diagram, slide deck,
diff review, or recap. Load `../SKILL.md` first for command syntax, then use this
file to choose the mode.

Resolve each capability against the runtime's live installed-skill catalog. The
FIS skill named in parentheses is the current owner of that capability; if it is
not installed, use whatever installed skill covers the capability instead of
synthesizing a command.

## Mode Selection

| Need | Preview mode |
|---|---|
| View an existing Markdown file or directory | `/fis:preview <path>` |
| Explain a concept or code path | `/fis:preview --explain <topic>` |
| Generate a focused architecture/data-flow diagram | `/fis:preview --diagram <topic>` |
| Terminal-friendly diagram only | `/fis:preview --ascii <topic>` |
| Self-contained HTML explanation | `/fis:preview --html --explain <topic>` |
| Slide deck | `/fis:preview --html --slides <topic>` |
| Visual diff review for a branch, merge/pull request, or commit | `/fis:preview --html --diff [ref]` |
| Compare an implementation plan to code | `/fis:preview --html --plan-review <plan>` |
| Recap recent project context | `/fis:preview --html --recap [timeframe]` |

## Specialist Handoffs

- Mermaid syntax: load the Mermaid capability (`/fis:mermaidjs-v11`).
- Publish-grade SVG/PNG architecture diagrams: use the technical-diagram
  capability (`/fis:tech-graph`).
- Hand-drawn or whiteboard-style diagrams: use the sketch-diagram capability
  (`/fis:excalidraw`).
- Editable stencil diagrams for hand-off to non-agent tools: use the
  draw.io capability (`/fis:drawio`).
- Generated images or multimodal analysis: use the multimodal capability
  (`/fis:ai-multimodal`).
- UI/UX style selection for slides or high-polish HTML: use the design-system
  capability (`/fis:ui-ux-pro-max`).
- Documentation update after a durable visual: use the documentation
  maintenance capability (`/fis:docs update`) and
  `.claude/rules/documentation-management.md`.

## Output Rules

- Prefer the active plan's `visuals/` folder when a plan exists. Resolve the
  active plan through the plan accessor whose path the session context injects
  (`node <accessor> use`, falling back to `node <accessor> resolve`) — never
  hardcode a plan path.
- If no plan exists, save under `plans/visuals/`.
- For HTML output, always include the theme toggle required by
  `html-css-patterns.md`.
- For diagrams, render and inspect the output; syntax validity alone is not
  enough. See `generation-modes.md` → "Visual Self-Review".
