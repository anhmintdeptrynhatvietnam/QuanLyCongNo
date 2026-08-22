---
id: EL-{{NNNN}}
type: elicitation
technique: five-whys
problem: "{{problem-statement}}"
target_artifact: "{{BG-NNNN | CR-NNNN | empty}}"
date: "{{YYYY-MM-DD}}"
project_code: ""
document_code: ""
---

# 5 Whys Root Cause — {{problem}}

> Chain question pattern. Đào root cause thay vì symptom fix. Stop khi chạm business policy / regulation / strategic decision.

## 1. Problem statement

> 1 câu, observable, không blame individual.

```
{{Problem mô tả cụ thể}}

Vd: "Khách hàng bỏ giữa chừng thanh toán hóa đơn online (tỷ lệ 35%)"
```

## 2. Why Chain

| Level | Why? | Answer |
|---|---|---|
| 1 | Tại sao [problem]? | [A1] |
| 2 | Tại sao [A1]? | [A2] |
| 3 | Tại sao [A2]? | [A3] |
| 4 | Tại sao [A3]? | [A4] |
| **5 (root)** | Tại sao [A4]? | **[A5 — ROOT CAUSE]** |

### Sample (EVN bill abandonment):

| Level | Why? | Answer |
|---|---|---|
| 1 | Tại sao khách bỏ thanh toán online? | Vì đến bước OTP họ thoát |
| 2 | Tại sao OTP làm họ thoát? | Vì đợi SMS quá 60s, nghĩ app lỗi |
| 3 | Tại sao SMS đến chậm? | Vì SMS Gateway tier 2 latency cao peak hours |
| 4 | Tại sao mình dùng tier 2? | Vì budget tiết kiệm 30% so với tier 1 |
| 5 (root) | Tại sao budget không cho phép tier 1? | **Biz case ban đầu giả định OTP optional, không phải mandatory** |

## 3. Stop justification

✅ **Reached root cause:** [business policy / regulation / strategic decision / org assumption]

❌ **NOT stopped at:** technical implementation / individual mistake / "code làm vậy"

**Justify:** [Why this level qualifies as root cause]

## 4. Mitigation actions

### Quick fix (≤ 1 sprint)
- [ ] [Action 1] — owner: [team]
- [ ] [Action 2] — owner: [team]

### Long-term (process / architecture)
- [ ] [Action 1] — owner: [team]
- [ ] [Action 2] — owner: [team]

### Prevention (avoid recurrence)
- [ ] [Process change / Tool / Policy / Training]

## 5. Risk if not addressed

- **Short-term:** [Symptom recurrence rate / business impact]
- **Long-term:** [Compounding effect, customer trust erosion]

## 6. Cross-team impact

| Team | Impact | Action required |
|---|---|---|
| BA | Update PRD assumptions | Re-validate biz case |
| SA | Re-evaluate SMS Gateway architecture | ADR with cost/latency trade-off |
| QA | Add OTP latency test | TestSpec update |
| PM | Budget approval | Escalate stakeholder |

## 7. Follow-up actions

- [ ] Update related PRD/TRD với corrected assumption
- [ ] Create CR-NNNN nếu impact existing approved artifact
- [ ] Schedule post-mortem nếu incident
- [ ] Add learning vào team retrospective doc

## Reference

- Source: Toyota Production System — Taiichi Ohno
- Bài học: focus on root cause "Why this happened", not "Who is to blame"
