# Walkthrough: SOD → PRD

## Input

## Detection
```json
{
  "type": "sod",
  "kit_artifact": "prd",
  "confidence": 1.0
}
```

## Extraction

### Step 1: Identify sections
- "TỔNG QUAN" → §I
- "ĐỐI TƯỢNG SỬ DỤNG" → §IV
- "QUY TRÌNH NGHIỆP VỤ" → §V

### Step 2: Map content

**§I:** Mục đích / Phạm vi / Thuật ngữ table → §I.1-3
**§V:** Mỗi quy trình con → §V.X.1-5 (Yêu cầu / Trigger / Next / BPMN / Steps)

### Step 3: Output

```yaml
---
id: PRD-0001
type: prd
title: "BSS Phân tích Luồng Nghiệp Vụ"
status: Draft
mode: create
---

# PRD-0001: BSS Phân tích Luồng Nghiệp Vụ

## I. Tổng quan
### 1.1 Mục đích
Tài liệu mô tả quy trình nghiệp vụ hệ thống quản lý khách hàng

### 1.3 Thuật ngữ
| STT | Thuật ngữ | Mô tả |
|---|---|---|
| 1 | CSDL | Cơ sở dữ liệu |

## V. Quy trình nghiệp vụ
### 5.1 Quy trình đấu nối thuê bao Mobile trả trước
...
```

### Step 4: Verify
- Word table count match MD count
- Heading hierarchy preserved
- Asset references valid

### Step 5: Complete
