# Question Bias Check — Rubric + Neutral Rewrites

Skill `fis-elicit` invoke check này TRƯỚC khi gửi câu hỏi qua AskUserQuestion. Flag leading bias, propose neutral rewrite.

## Leading question patterns

### Pattern 1: Pre-suppose answer ("Don't you think X?")

| Bad | Why bad | Neutral rewrite |
|---|---|---|
| "Anh không nghĩ feature này tốt sao?" | Pre-suppose feature tốt | "Anh đánh giá feature này thế nào?" |
| "Sản phẩm dễ dùng, đúng không?" | Confirmation bias | "Mức độ dễ/khó dùng của sản phẩm là?" |
| "Chắc anh thích phiên bản mới hơn chứ?" | Force agreement | "So sánh phiên bản mới và cũ, anh có cảm nhận gì?" |

### Pattern 2: False dichotomy (X vs Y, no other option)

| Bad | Why bad | Neutral rewrite |
|---|---|---|
| "Tại sao anh chọn X (thay vì Y)?" | Force binary choice trong scope hẹp | "Khi cân nhắc, anh đã xét những option nào?" |
| "Anh prefer mobile hay desktop?" | Skip 'cả hai' / 'tablet' / 'voice' | "Anh thường dùng device nào để X?" |

### Pattern 3: Quantitative pre-suppose (assume frequency/amount)

| Bad | Why bad | Neutral rewrite |
|---|---|---|
| "Mỗi ngày anh dùng app 5 lần phải không?" | Pre-suppose frequency | "Tần suất anh dùng app trong ngày?" |
| "Anh dùng 30 phút mỗi session đúng không?" | Pre-suppose duration | "Mỗi lần dùng app, anh dành bao lâu?" |

### Pattern 4: Solution-leading (suggest answer trong question)

| Bad | Why bad | Neutral rewrite |
|---|---|---|
| "Có nên thêm dark mode không?" | Suggest solution dark mode | "Khi dùng app buổi tối, anh có gặp khó khăn gì?" |
| "Mình nên dùng OAuth2 hay JWT?" | Force tech decision | "Yêu cầu auth như thế nào? (login speed / multi-device / security)" |

### Pattern 5: Negative framing (loaded language)

| Bad | Why bad | Neutral rewrite |
|---|---|---|
| "Có gì khó chịu khi dùng app cũ?" | Pre-suppose khó chịu | "Trải nghiệm app cũ thế nào? Có chỗ nào tốt và chỗ nào chưa ổn?" |
| "Tại sao anh bỏ X?" | Pre-suppose anh bỏ | "Anh có còn dùng X không? Nếu không, lý do?" |

### Pattern 6: Hypothetical without context

| Bad | Why bad | Neutral rewrite |
|---|---|---|
| "Nếu có feature Y thì sao?" | Abstract → unreliable answer | "Hôm gần đây có lúc nào anh cần Y không? Lúc đó anh giải quyết thế nào?" |

## Open vs Closed Questions

**Always start open** rồi narrow xuống closed cho confirm.

| Closed (Y/N) — final | Open (đào sâu) — initial |
|---|---|
| "Anh có dùng app banking không?" | "Anh thường làm gì với app banking?" |
| "Anh prefer feature A?" | "Khi feature A và B available, anh chọn cái nào và tại sao?" |
| "Anh có thấy lag không?" | "Mô tả lần gần nhất anh thấy app phản hồi chậm" |

## Sandwiching technique

Đào pain point sensitive (vd "tại sao bỏ app cũ"):

```
1. Mở trung lập (positive):
   "Trước khi đổi, app cũ có chỗ nào anh thích?"

2. Vào core (specific pain):
   "Còn phần nào anh thấy chưa ổn?"

3. Đóng tích cực (constructive):
   "Nếu app cũ fix lỗi đó, anh có quay lại không?"
```

→ Avoid pure negative chain → user defensive.

## Detection algorithm (skill auto-check)

For each generated question, scan for:

1. **Modal verbs presupposing answer:** "không nghĩ", "đúng không", "phải không", "chứ"
2. **Force binary:** "X hay Y" without "cả hai / khác / không"
3. **Numeric presuppose:** specific numbers without "khoảng / ước chừng"
4. **Solution leak:** mention specific tech/feature name
5. **Loaded adjectives:** "khó chịu", "tệ", "kém" before user confirm

If detected → flag inline `⚠️ Leading bias detected. Suggested rewrite: [...]`. User accept rewrite or proceed with original (warning logged).

## Output format khi flag

```markdown
**Original question:** "Anh không nghĩ feature dark mode tốt sao?"
⚠️ **Leading bias detected:** Pattern 1 (pre-suppose) + Pattern 4 (solution-leading)
**Suggested rewrite:** "Khi dùng app buổi tối, anh có cảm nhận gì về visual experience?"

Continue với original [N] hay rewrite [Y]?
```

## Reference

- BABOK v3 Elicitation — bias section
- "Don't Make Me Think" — Steve Krug (UX research bias)
