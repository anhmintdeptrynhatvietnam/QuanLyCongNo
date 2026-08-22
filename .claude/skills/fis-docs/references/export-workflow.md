# Mode: export

Render a documentation markdown file to `.docx` using a FIS-format template. Documentation lives under `docs/` — there is no `artifacts/<id>/` chain and no mandatory artifact/role workflow.

## Trigger
`/fis:docs export <doc.md>`

## Template selection
Pick the docx template from the file's frontmatter `template:` key, resolved via the SKILL.md resolver (project `.fis/templates/<template>/` → kit `templates/docx-templates/`). Do not infer a template from an "artifact type" or an ID scheme.

```yaml
---
title: "CASAN — Phân tích yêu cầu"
template: sod          # which FIS docx skeleton to render into
version: "1.0"
status: "Chờ rà soát"
doc_code: "CASAN-SRS-01"
---
```

## Output
Next to the source file, in a sibling `exports/` folder:

`<dir-of-source>/exports/<source-basename>-v<version>.docx`

Example: `docs/casan-portal/01-phan-tich-yeu-cau.md` → `docs/casan-portal/exports/01-phan-tich-yeu-cau-v1.0.docx`

## Template chrome chuẩn FIS

### Trang bìa
- Logo FIS placeholder
- Project header: PROJECT_NAME + `doc_code`
- Title: document title (from frontmatter)
- Version + Status badge
- Date

### Bảng ghi nhận thay đổi (auto-fill từ frontmatter)
| Phiên bản | Ngày | Người sửa | Mô tả | CR ID |
|---|---|---|---|---|

### Trang ký (manual approval — tùy chọn)

Render bảng phê duyệt thủ công từ section "Trang ký" của tài liệu (nếu có). Để trống các cột chữ ký/ngày — người dùng/tổ chức tự ký. Kit KHÔNG auto-sign và KHÔNG enforce.

| Vai trò | Người ký | Chữ ký | Ngày |
|---|---|---|---|

### Body
Render markdown → Word styles:
- H1-H3 → Heading 1-3
- Tables → Light Grid Accent 1
- Lists → bullet/numbered
- Code → Inline code style

## Template mapping (by frontmatter `template:` key)

These are **document-format** templates, not an artifact chain — the kit never forces a PRD→TRD→Story sequence. Pick whichever format the document is.

| `template:` | Chrome | Điển hình dùng cho |
|---|---|---|
| `sod` / `prd` / `brd` | SOD-style | Phân tích yêu cầu / nghiệp vụ |
| `sad` / `trd` | SAD-style | Kiến trúc / thiết kế kỹ thuật |
| `ddd` / `dbdd` / `fsd` / `feature-spec` | DDD page | Thiết kế chi tiết / đặc tả tính năng |
| `test-spec` | Test Plan | Kế hoạch / đặc tả kiểm thử |
| `charter` / `risk-register` / `status-report` / `bug-report` | matching skeleton | Quản trị / vận hành |

Full template list: `SKILL.md` description. Add a project skeleton under `.fis/templates/<template>/` to override any of these per-project.

## Diagram rendering — pipeline 3-tier

Chi tiết: `claude/skills/fis-docs/references/diagram-pipeline.md`. Degrade gracefully theo thứ tự:

| Tier | Action | Output |
|---|---|---|
| 1 (preferred) | `/fis:drawio` → `.drawio` + export PNG/SVG | Enterprise flow/BPMN/ERD/architecture, editable, embed vào docx/MD |
| 2 | Figma `generate_diagram` MCP | FigJam URL + screenshot embed |
| 3 (inline / lightweight) | `templates/automation/render-diagrams.sh` (Mermaid) | Diagram đơn giản render inline, hoặc fallback khi draw.io CLI vắng |
| 4 (degraded) | Embed Mermaid source code + chú thích | View trong MD viewer hỗ trợ Mermaid |

**Mặc định flow/process/architecture dùng draw.io** (`/fis:drawio`) — Mermaid chỉ cho diagram-as-code render inline hoặc fallback. Excalidraw → `/fis:excalidraw` cho whiteboard look.
