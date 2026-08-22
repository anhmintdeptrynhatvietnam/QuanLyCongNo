# Skill Domain Routing

Route domain work from the runtime's live installed-skill catalog. Kit
composition can replace an entire skill set, so a copied command inventory in
this shared rule is never authoritative.

## Routing Procedure

1. Read the live skill catalog supplied by the runtime.
2. Match the user's primary intent to a capability below.
3. Select an installed skill whose metadata explicitly covers that capability.
4. Read that skill's complete instructions before acting.
5. If no installed skill matches, continue with the primary workflow and
   available native capabilities. Do not recommend or invoke an absent skill.

## Capability Map

| User intent | Capability to match |
|-------------|---------------------|
| Replicate, build, style, or audit a UI | Frontend design, frontend development, UI styling, accessibility, or performance |
| Locate code or understand a repository | File scouting, semantic navigation, repository packing, or knowledge mapping |
| Build an API, authentication flow, or payment integration | Backend development, authentication, or payments |
| Design schemas or optimize database behavior | Database design and operations |
| Deploy an application or change infrastructure | Deployment or DevOps |
| Audit security or investigate threats | Security review, vulnerability scanning, or threat intelligence |
| Build or improve an AI workflow | Context engineering, agent development, or multimodal processing |
| Build, expose, or use MCP tooling | MCP construction, agentization, or MCP execution |
| Test code or drive a browser | Testing, browser testing, or browser automation |
| Process or generate media | Media processing or image generation |
| Create or maintain documentation | Documentation maintenance, current-doc lookup, diagrams, or publishing |
| Work with office documents | Word, PDF, presentation, or spreadsheet processing |
| Write marketing content or design a brand | Copywriting, brand design, or visual design |
| Work in a specific application framework | Match the exact framework named by the user |

## Domain Knowhow Capabilities

These carry business-domain knowledge rather than implementation technique. They
answer "what does this domain require" and pair with a technique capability from
the map above, which answers "how do we build it".

| User intent | Capability to match |
|-------------|---------------------|
| Rate, charge, invoice, or collect on telecom usage | Telecom billing: mediation, rating, charging, invoicing, dunning, revenue assurance |
| Design or reverse-engineer a virtual operator | MVNO architecture: subscriber registry, BSS/OSS layering, MVNE handoff, SIM lifecycle |
| Build subscriber-facing account, top-up, or plan-change flows | Telecom self-care portal and app patterns |
| Work with ERP modules, scope items, or fit-to-standard scoping | SAP ERP and S/4HANA |
| Handle Vietnamese public-sector HR: salary grades, allowances, insurance | Vietnam government human-resource platform |
| Compute tiered electricity or utility charges | Utility billing: tiered tariffs, metering, supply contracts |
| Integrate Vietnamese banking, QR payment, e-invoice, or accounting | Vietnam fintech integration |
| Validate Vietnamese identifiers, addresses, phone numbers, or currency | Vietnam locale rules |

Domain capabilities are additive: a billing feature usually needs one domain
capability plus backend and database capabilities. That is a genuine
cross-domain task, not a reason to pick two skills from the same column.

## Usage Rules

- Pick one primary skill per distinct intent; add a secondary skill only when
  the task genuinely crosses domains.
- Treat installed skill metadata as the availability and routing authority.
- Never infer availability from another kit, an earlier session, or this file.
- Run selected domain skills inside `primary-workflow.md`; do not restate its
  delivery sequence here.
