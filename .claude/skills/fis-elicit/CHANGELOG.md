# fis:elicit changelog

## v1.1.0 — 2026-07-16

- Output location moved from `artifacts/elicitation/` to `docs/elicitation/` to align with the outcome-first layout (docs/ + issue/PR as the system of record).

## v1.0.0 — 2026-05-05

- Initial release. 4 modes: interview / event-storm / impact-map / five-whys.
- JTBD Switch Interview with 4 forces (Push/Pull/Anxiety/Habit).
- Event Storming canvas markdown sticky-note format.
- Impact Mapping Goal-Actor-Impact-Deliverable tree.
- 5 Whys root-cause chain with stop conditions.
- Question bias check rubric (leading question detector + neutral rewrites).
- Vietnamese-first JTBD intro với ví dụ banking + EVN.
- Output `artifacts/elicitation/EL-NNNN-<slug>.md` với frontmatter.
- Optional `--feed-to=<issue-ID>` để link làm input cho /fis:requirements.
