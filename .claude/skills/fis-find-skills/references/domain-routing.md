# Domain Routing

Use this file when choosing between skills that are **already installed**. If
the user wants to discover or install a skill they do not have yet, return to
`../SKILL.md` and use the Skills CLI flow.

## Where the authority lives

The capability map is owned by `.claude/rules/skill-domain-routing.md`, which is
always loaded. It maps user intent to a capability. This file adds only the
layer that rule deliberately leaves out: which installed FIS domain pack serves
a domain-knowhow capability today.

Nothing here restates the capability map. A copied intent table goes stale the
moment kit composition changes.

## Resolution procedure

1. Read the live installed-skill catalog the runtime supplies this session.
2. Match the user's primary intent to a capability in the routing rule.
3. Select an installed skill whose own metadata covers that capability.
4. Read that skill's complete instructions before acting.
5. No installed skill matches? Continue with the primary workflow and native
   capabilities, and name the gap. Do not recommend or invoke an absent skill.

## Routing rules

- If the user names a skill, use that skill.
- Pick one primary skill per distinct intent. Mention secondary skills only as
  follow-up helpers, never as co-owners of the same step.
- Prefer the more specific domain skill over a generic workflow skill when the
  two overlap.
- If the task needs a multi-step sequence, choose the primary skill first, then
  read `.claude/rules/skill-workflow-routing.md` and
  `../../fis-outcome/references/chaining-patterns.md` for the sequence.

## Installed domain packs

These serve the Domain Knowhow capabilities in the routing rule. They carry
business-domain knowledge, not implementation technique.

| Domain-knowhow capability (per the rule) | Installed pack |
|------------------------------------------|----------------|
| Telecom billing: mediation, rating, charging, invoicing, dunning, revenue assurance | `/fis:bss-billing` |
| MVNO architecture: subscriber registry, BSS/OSS layering, MVNE handoff, SIM lifecycle | `/fis:mvno` |
| Telecom self-care portal and app patterns | `/fis:telco-self-care` |
| SAP ERP and S/4HANA | `/fis:sap` |
| Vietnam government human-resource platform | `/fis:ehrp` |
| Utility billing: tiered tariffs, metering, supply contracts | `/fis:utility-billing` |
| Vietnam fintech integration: banking, QR payment, e-invoice, accounting | `/fis:fintech-vn` |
| Vietnam locale rules: identifiers, addresses, phone numbers, currency | `/fis:vn-locale` |

Domain packs are additive and never activate by default. A billing feature
normally pairs one pack with a technique capability — backend, database,
frontend — from the same rule's capability map. That pairing is a genuine
cross-domain task, not a reason to select two packs for one intent.
