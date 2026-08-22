# Mode: event-storm — Event Storming canvas

## Trigger
"Event storm cho domain X" / "process discovery" / "domain workshop" / "phân tích quy trình mới"

## Khi dùng

- Domain mới chưa rõ event flow (banking onboarding, EVN billing)
- Cross-team align mental model (BA + SA + DEV cùng workshop)
- Pre-Epic decomposition — input cho `/fis:plan`
- Discovery edge case mà interview không capture được

## Steps

### 1. Auto-assign EL ID
Count `docs/elicitation/EL-*.md` → next ID.

### 2. Phase 1 — Timeline of business events

AskUserQuestion: "Liệt kê 5-10 event chính (past tense) trong domain này, theo thứ tự thời gian."

Format event: past tense Vietnamese + entity. Vd:
- "Đơn hàng đã tạo"
- "Thanh toán đã xác nhận"
- "Kho đã trừ"
- "Đơn đã giao"

### 3. Phase 2 — Commands + Actors

Cho mỗi event, hỏi: "Command nào (action present tense) gây ra event này? Actor nào execute command?"

Format: `[Actor] command → Event`. Vd:
- `[Customer] Tạo đơn hàng → Đơn hàng đã tạo`
- `[System] Validate inventory → Kho đã kiểm tra`
- `[Manager] Duyệt đơn lớn → Đơn đã được duyệt`

### 4. Phase 3 — Policies (rules)

AskUserQuestion: "Policy nào tự động trigger event tiếp theo? (Rule format: Khi [event], thì [reaction])"

Vd:
- "Khi Đơn hàng đã tạo + amount > 1tr, thì Auto giảm giá"
- "Khi Thanh toán đã xác nhận, thì Email xác nhận gửi"
- "Khi OTP wrong 3 lần, thì Block account 30 phút"

### 5. Phase 4 — Read Models (data views)

AskUserQuestion: "Data view nào cần để stakeholder/user theo dõi quy trình này?"

Vd:
- "Báo cáo doanh số ngày"
- "Dashboard tồn kho realtime"
- "Audit log mọi giao dịch"

### 6. Save canvas

Output `docs/elicitation/EL-NNNN-<slug>.md` theo template `references/templates/event-storm-canvas.md`:

```markdown
## Timeline (events)
| # | Event (past tense) | Note |

## Commands + Actors
| Actor | Command | Event |

## Policies (rules)
| Trigger event | Policy | Result event |

## Read Models
| Read model | Purpose | Source events |

## Mermaid sequence preview
```

### 7. Generate Mermaid sequence (auto)

From event list + commands → produce Mermaid sequence diagram preview làm reference cho `/fis:plan`.

## Convergence indicator

Workshop convergence khi:
- ≥ 5 events identified
- ≥ 3 commands per event đầu (root cause completeness)
- ≥ 1 policy
- ≥ 1 read model

Less → re-prompt user với hint examples.

## Reference

- `references/templates/event-storm-canvas.md`
- Output feeds `/fis:plan` → Epic + Story breakdown
