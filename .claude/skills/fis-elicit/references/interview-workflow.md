# Mode: interview — Stakeholder/Persona deep-dive

## Trigger
"Phỏng vấn [persona]" / "interview customer" / "JTBD switch" / "đào sâu requirement"

## Sub-techniques

| `--technique=` | Khi dùng | Output |
|---|---|---|
| `jtbd-switch` (default) | Phỏng vấn user vừa đổi product. Hiểu Push/Pull/Anxiety/Habit | JTBD statement + 4-force scores |
| `persona-deep-dive` | Define persona detail cho project mới | Persona profile (role/pain/goal/tools) |
| `ac-clarify` | AC ambiguous từ Story → đào ngữ nghĩa | List edge case + spec-by-example seed |
| `edge-case-probe` | Tìm edge case business cho feature | Edge case list (empty/error/permission/scale) |

## Steps

### 1. Resolve technique
- Nếu user pass `--technique=X` → dùng X
- Else AskUserQuestion 4 options chọn technique
- Nếu user pass `--persona=<role>` → bind interview với persona đó (đọc `personas/PERSONAS.md` nếu có)

### 2. Auto-assign EL ID
Count `docs/elicitation/EL-*.md` → next ID padded 4 digits.

### 3. Run technique-specific question ladder

**JTBD Switch (default):**
1. **Situation:** "Lần đầu bạn nghĩ đến giải pháp này là khi nào? Đang làm gì?"
2. **Push:** "Cái cũ làm bạn khó chịu chỗ nào nhất?"
3. **Pull:** "Giải pháp mới hấp dẫn ở đâu?"
4. **Anxiety:** "Khi cân nhắc đổi, bạn lo nhất chuyện gì?"
5. **Habit:** "Tại sao không đổi sớm hơn?"

→ Synthesize: "Khi [situation], tôi muốn [motivation], để [outcome]."
→ Score 4 forces 1-5. Switch likelihood = (Push+Pull) - (Anxiety+Habit) > 0?

**Persona deep-dive (cho persona setup):**
1. Role + responsibility
2. Daily tools used
3. Success metric (KPI cá nhân)
4. Top 3 pain
5. Top 3 wish
6. Influence trong tổ chức (decision maker / influencer / user)

**AC clarify:**
1. Show AC, ask: "Given X = cụ thể nào? Counter-example?"
2. "When Y trigger — manual / scheduled / system event?"
3. "Then Z observable bởi cách nào? UI badge / API status / log entry?"
4. "Edge: nếu X xảy ra cùng lúc với W?"
5. Generate 3+ concrete examples per ambiguous AC (spec-by-example seed)

**Edge case probe:**
1. Empty state: data trống thì sao?
2. Error state: external system fail?
3. Permission: user thiếu quyền?
4. Scale: 1k vs 100k record?
5. Concurrent: 2 user cùng lúc?
6. Latency: chậm > 5s?
7. Cancel mid-flow: user F5 / close browser?

### 4. Question bias check
Sau mỗi câu hỏi tự generate, run check qua `references/question-bias-check.md` rubric. Flag leading questions, propose neutral rewrite.

### 5. Save EL-NNNN
Output `docs/elicitation/EL-NNNN-<slug>.md` theo template `references/templates/jtbd-interview.md` (cho JTBD) hoặc generic interview format.

### 6. Optional feed
Nếu user `--feed-to=PRD-NNNN`:
- Append link vào PRD frontmatter `elicitation_refs: [EL-NNNN]`
- Suggest: "EL-NNNN có thể nhập vào PRD §II.1 (Problem) + §IV (Persona)"

## Constraints

- Max 5 câu hỏi per AskUserQuestion batch (avoid fatigue)
- Total interview ≤ 15 câu (offer save+resume nếu cần thêm)

## Reference

- `references/templates/jtbd-interview.md` — Switch interview script template
- `references/question-bias-check.md` — Bias rubric
