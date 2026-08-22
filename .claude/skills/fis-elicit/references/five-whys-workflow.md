# Mode: five-whys — Root cause chain

## Trigger
"5 Whys cho [problem]" / "Root cause" / "Tại sao [phenomenon]" / "Đào nguyên nhân gốc"

## Khi dùng

- Bug report cần root cause analysis
- CR triggered by recurring issue
- Post-mortem incident
- Pre-mortem risk discovery

## Steps

### 1. Auto-assign EL ID

### 2. Capture initial problem statement

AskUserQuestion: "Problem cụ thể (1 câu, observable)?"

Vd:
- "Khách hàng bỏ giữa chừng thanh toán hóa đơn online"
- "Tỷ lệ phê duyệt khoản vay giảm 20% tháng 4"
- "App crash khi user upload ảnh > 10MB"

### 3. Why chain (5 levels)

For each Why level, AskUserQuestion: "Tại sao [previous answer]?"

**Level 1 (closest to symptom):** Tại sao [problem]?
**Level 2:** Tại sao [answer 1]?
**Level 3:** Tại sao [answer 2]?
**Level 4:** Tại sao [answer 3]?
**Level 5 (root cause):** Tại sao [answer 4]?

### 4. Stop conditions check

After level 5, validate root cause:
- ✅ STOP nếu chạm tới: business policy / regulation / strategic decision / org assumption
- ❌ KHÔNG STOP nếu vẫn ở: technical implementation detail / individual mistake

Nếu chưa stop → tiếp tục Why thêm 1-2 level.

### 5. Identify mitigation

AskUserQuestion: "Mitigation cho root cause này? (Process change / Tool / Policy / Training / Architecture refactor)"

### 6. Save chain

Output `docs/elicitation/EL-NNNN-<slug>.md` theo template `references/templates/five-whys.md`:

```markdown
## Problem
[Initial statement]

## Why Chain

| Level | Why? | Answer |
|---|---|---|
| 1 | Tại sao [problem]? | [A1] |
| 2 | Tại sao [A1]? | [A2] |
| 3 | Tại sao [A2]? | [A3] |
| 4 | Tại sao [A3]? | [A4] |
| 5 (root) | Tại sao [A4]? | [A5 — ROOT CAUSE] |

## Stop justification

Reached: [business policy / regulation / strategic decision] — không phải implementation detail.

## Mitigation

- [ ] [Mitigation 1] — owner: [team]
- [ ] [Mitigation 2] — owner: [team]
- [ ] [Mitigation 3] — owner: [team]

## Risk if not addressed

- [Consequence if root cause persists]
```

## Anti-patterns to detect

- "Tại sao code làm vậy?" → too low-level, redirect to "Tại sao yêu cầu code làm vậy?"
- "Vì developer X làm sai" → blame game; redirect to "Tại sao process không catch lỗi này?"
- Stop chỉ ở 2-3 Whys → chưa đủ depth, prompt continue
- Loop (cùng answer ở 2 levels) → flag user, redirect different angle

## Reference

- `references/templates/five-whys.md`
- Source: Toyota Production System — Taiichi Ohno
