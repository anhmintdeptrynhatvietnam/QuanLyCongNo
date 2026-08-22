# Mode: import

## Trigger
User input là path tới .docx/.xlsx.

## Auto-detect doc type

| Doc type | Trigger headings | → Kit document |
|---|---|---|
| SOD | "QUY TRÌNH NGHIỆP VỤ" + "Sự kiện kích hoạt" | PRD |
| SAD | "PHÂN LỚP KIẾN TRÚC" + "DATA STORAGE Layer" | TRD |
| DDD | "Sơ đồ màn hình" + "Bảng trường" | Story collection |
| DBDD | "ERD" + "Cấu trúc bảng" | TRD §IV |
| Test Plan | "AC Coverage Matrix" | TestSpec |

Confidence < 0.7 → ask user.

## Steps

### 1. Detect type
Cowork: native .docx read. Claude Code: Python `_shared/doc-bridge/`.

### 2. Auto-assign ID
Count existing → next ID.

### 3. Extract structure (per doc type mapping)

### 4. Preserve formatting
Tables → MD tables, lists, images → asset references.

### 5. Frontmatter chuẩn
```yaml
imported_from: "<docx-name>"
imported_at: "<today>"
mode: create
```

### 6. Round-trip validation (`--validate-round-trip`)

## Limitations
- Visio embed → image only
- Accuracy: ~85-90% SOD/SAD, ~75% DDD
- Manual review BẮT BUỘC
