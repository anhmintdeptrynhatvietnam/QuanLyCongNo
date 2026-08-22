# Walkthrough: PRD → SOD

## Input
`docs/prd/PRD-0042.md` Approved.

## Generation

### Step 1: Pick template
type=prd → SOD chrome.

### Step 2: Compose docx

```
[Title page]
  Logo FIS
  Project: FIS Internal Apps
  Document: PRD-0042 — SSO Login
  Version: 2.0
  Status: Approved

[Bảng ghi nhận thay đổi]
| 2.0 | 2026-05-01 | (BA) | Generated from kit | - |

[Trang ký]
| BA Author | Sarah | (placeholder) | 2026-05-01 |
| SA Reviewer | Marcus | | 2026-05-01 |

[Body — render MD]
```

### Step 3: Render markdown

| MD | → Word |
|---|---|
| `# H1` | Heading 1 (28pt bold) |
| `## H2` | Heading 2 (20pt bold) |
| `**bold**` | Bold run |
| Tables | Light Grid Accent 1 |
| Lists `-` | List Bullet |
| Code | Inline code style |
| Mermaid | PNG via mmdc, embed |

### Step 4: Output
`docs/prd/exports/PRD-0042-v2.docx` (78 KB, 14 tables, 3 diagrams).

### Step 5: Verify
```python
import docx
d = docx.Document("PRD-0042-v2.docx")
print(f"Paragraphs: {len(d.paragraphs)}")
print(f"Tables: {len(d.tables)}")
```
