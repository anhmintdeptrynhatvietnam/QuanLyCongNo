# FIS Doc Heading Patterns

## SOD
```python
SOD_PATTERNS = [
    r"qu[yỳ]\s*tr[iì]nh\s*nghi[eệ]p\s*v[uụ]",
    r"s[uự]\s*ki[eệ]n\s*k[ií]ch\s*ho[aạ]t",
    r"m[oô]\s*h[ìi]nh\s*qu[yỳ]\s*tr[ìi]nh",
]
```

## SAD
```python
SAD_PATTERNS = [
    r"ph[aâ]n\s*l[oớ]p\s*ki[eế]n\s*tr[uú]c",
    r"data\s*storage\s*layer",
    r"frontend\s*layer",
    r"y[êe]u\s*c[aầ]u\s*hi[eệ]u\s*n[aă]ng",
]
```

## DDD
```python
DDD_PATTERNS = [
    r"s[oơ]\s*đ[oồ]\s*m[aà]n\s*h[iì]nh",
    r"m[aà]n\s*h[iì]nh\s*ch[ií]nh",
    r"m[aà]n\s*h[iì]nh\s*th[eê]m\s*m[oớ]i",
    r"b[aả]ng\s*tr[ưươ]?[oờ]ng",
]
```

## DBDD
```python
DBDD_PATTERNS = [
    r"\bERD\b",
    r"c[aấ]u\s*tr[uú]c\s*b[aả]ng",
    r"data\s*dictionary",
]
```

## Test Plan
```python
TEST_PLAN_PATTERNS = [
    r"AC\s*coverage\s*matrix",
    r"test\s*case",
    r"unit\s*test",
]
```

## Detection algorithm

```python
def detect(text):
    text_lower = text.lower()
    scores = {}
    for doc_type, patterns in PATTERNS.items():
        scores[doc_type] = sum(
            len(re.findall(p, text_lower, re.I))
            for p in patterns
        )
    if max(scores.values()) == 0:
        return {"type": "unknown", "confidence": 0}
    winner = max(scores, key=scores.get)
    total = sum(scores.values())
    return {
        "type": winner,
        "confidence": scores[winner] / total,
    }
```

## Vietnamese diacritics tolerance
Patterns dùng `[ếeê]` để tolerant:
- Có dấu, không dấu, mixed encoding

## Heading detection — multi-strategy
1. Style `Heading N`
2. Bold paragraph (FIS docs đôi khi)
3. All-caps standalone
4. Numbered prefix (I., 1.1, etc.)

Skill check ALL 4 patterns để robust.
