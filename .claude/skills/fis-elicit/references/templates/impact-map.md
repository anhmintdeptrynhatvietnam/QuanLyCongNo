---
id: EL-{{NNNN}}
type: elicitation
technique: impact-map
goal: "{{goal-quantified}}"
target_artifact: "{{PRD-NNNN | empty}}"
date: "{{YYYY-MM-DD}}"
project_code: ""
document_code: ""
---

# Impact Map — {{goal}}

> Goal → Actors → Impacts → Deliverables tree. Help PM/BA decide what to build từ business goal.

## 1. GOAL

> 1 sentence quantified với deadline.

**Format:** [Verb] [target metric] từ X lên Y trong [timeframe].

```
{{Quantified goal statement}}

Vd: "Tăng số tài khoản mở mới tháng 12 từ 5k lên 8k"
```

## 2. Tree (markdown indented)

```
GOAL
├── Actor 1: ___
│   ├── Impact 1.1: [behavior change]
│   │   ├── Deliverable 1.1.1: ___
│   │   └── Deliverable 1.1.2: ___
│   └── Impact 1.2: ___
│       └── Deliverable 1.2.1: ___
└── Actor 2: ___
    └── Impact 2.1: ___
        └── Deliverable 2.1.1: ___
```

## 3. Mermaid mindmap

```mermaid
mindmap
  root(({{Goal}}))
    Actor1
      Impact11
        Del111
        Del112
      Impact12
        Del121
    Actor2
      Impact21
        Del211
```

## 4. Detailed table

### Actor 1: ___

| Impact | Deliverable | Priority (MoSCoW) | Owner |
|---|---|---|---|
| 1.1 | 1.1.1 | Must |  |
| 1.1 | 1.1.2 | Should |  |
| 1.2 | 1.2.1 | Could |  |

### Actor 2: ___

| Impact | Deliverable | Priority (MoSCoW) | Owner |
|---|---|---|---|

## 5. Anti-actors (block goal)

| Anti-actor | Negative behavior | Mitigation deliverable |
|---|---|---|
| Vd Fraud network | Fake CCCD onboard | eKYC chip verify |

## 6. Assumptions (validate before commit)

- [ ] Assumption 1 (test bằng cách nào)
- [ ] Assumption 2

## 7. Deliverables → MoSCoW priority

### Must (block goal — phải có)
- [ ] ___
- [ ] ___

### Should (high impact, deferrable)
- [ ] ___

### Could (nice-to-have)
- [ ] ___

### Won't (out of scope this iteration)
- [ ] ___

## 8. Insights for PRD

| Map element | → PRD section |
|---|---|
| Goal | §II.4 Success metrics |
| Actors | §IV Personas |
| Impacts | §V Quy trình (impact = behavior change observable) |
| Deliverables Must | §III.1 FR list |
| Anti-actors | §VIII Risks |

## 9. Follow-up actions

- [ ] Validate top 2 assumptions trước khi build
- [ ] Run `/fis:requirements` with EL-NNNN as input → capture acceptance criteria
- [ ] Cross-check deliverable feasibility with `/fis:architecture` if design decisions needed

## Reference

- Source: Gojko Adzic — impactmapping.org
