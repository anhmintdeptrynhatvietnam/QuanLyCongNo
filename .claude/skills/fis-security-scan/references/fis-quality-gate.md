# FIS Quality Gate (08-QD/TKDA/HDCV/FPTIS)

FPT IS projects must pass the corporate Quality Gate before golive. The gate is measured by PQA/CSC-managed tools — **this skill's internal scan does not replace them**. Use this reference to (a) remind before golive, (b) check exported reports against the gate when the user provides them, (c) triage findings and propose fixes.

## Gate table (pass = ALL criteria met)

| Tool | Criterion | Threshold |
|---|---|---|
| SonarQube | Security Rating | ≥ B (no Major+ vulnerability) |
| SonarQube | Security Hotspots Reviewed | 100% |
| Coverity (SAST) | Security issues Critical / High / Medium | 0 |
| Black Duck (SCA) | Security issues Critical / High / Medium | 0 |
| Black Duck (SCA) | License issues | 0 unresolved (exceptions need CPO/CDO written approval) |
| OWASP ZAP (DAST) | Vulnerabilities after scan | 0 |
| Contract criteria | Customer-committed criteria in contract/plan | Mandatory |

Low/Minor findings from SonarQube/Coverity/Black Duck are non-blocking — the project reviews and fixes on its own schedule.

## Approval hierarchy for bypass requests (before golive)

| Issue type | Approver |
|---|---|
| License, SonarQube Security Hotspots | CPO (product projects) / CDO FPT IS (rank-A delivery) / CDO FISx (other ranks) |
| Security findings | CSC only |

Never suggest bypassing a gate; only point to this approval path when the user explicitly asks about exceptions.

## AI-generated code — extra attention

All gates apply to AI-generated code with no exceptions. Two AI-specific risks to check during triage:

1. **Hallucinated/typosquatted dependencies** — packages that don't exist or shadow popular names; cross-check new dependencies before they ever reach SCA.
2. **License contamination** — verbatim copyleft OSS blocks reproduced by the model; flag for Black Duck verification.

## How to use in practice

- When asked to scan before a release: run the internal scan, then print the gate table with a note that SonarQube/Coverity/Black Duck/ZAP results come from PQA/CSC.
- When given exported reports (CSV/JSON/PDF text): map each finding to the table above and output PASS/FAIL per criterion plus a fix list ordered by severity.
- Findings may be fixed with AI assistance (`/fis:fix`), then re-scanned; approval authority stays with PQA/CSC/CPO/CDO.
