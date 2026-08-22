# Secret Detection Patterns

Grep patterns for detecting hardcoded secrets. Use with Grep tool, exclude test/example files.

## High Confidence (Structured format, low false positive)

### AWS
```
AKIA[0-9A-Z]{16}
```

### GitHub (Classic + Fine-grained)
```
gh[pousr]_[A-Za-z0-9_]{36,255}
github_pat_[A-Za-z0-9_]{22,}
```

### Stripe
```
sk_live_[0-9a-zA-Z]{24,}
rk_live_[0-9a-zA-Z]{24,}
```

### Slack
```
xox[baprs]-[0-9a-zA-Z-]{10,}
```

### Google Cloud
```
AIza[0-9A-Za-z_-]{35}
```

### Anthropic
```
sk-ant-[A-Za-z0-9_-]{40,}
```

### Private Keys
```
-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----
```

### JWT / Bearer Tokens (in code, not headers)
```
eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}
```

## Medium Confidence (Need context verification)

### Generic API Keys
```
(?i)(api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*['"][A-Za-z0-9/+=]{16,}['"]
```

### Database URLs
```
(?i)(postgres|mysql|mongodb|redis)://[^:]+:[^@]+@
```

### Passwords in Code
```
(?i)(password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]
```

### Generic Secrets
```
(?i)(secret|token|credential)\s*[:=]\s*['"][A-Za-z0-9/+=]{16,}['"]
```

## Vietnam Personal Data (FIS projects — customer/end-user PII)

Context-anchored to limit false positives. Flag as MEDIUM; real customer PII in code/fixtures is CRITICAL.

### Vietnamese national ID (CCCD/CMND)
```
(?i)(cccd|cmnd|can[_ ]?cuoc|căn cước|so[_ ]?dinh[_ ]?danh)\s*[:=]?\s*['"]?\d{9,12}
```

### Vietnamese tax code (MST)
```
(?i)(mst|ma[_ ]?so[_ ]?thue|mã số thuế|tax[_ -]?code)\s*[:=]\s*['"]?\d{10}(-\d{3})?
```

### Vietnamese phone numbers (assigned to identity fields)
```
(?i)(sdt|so[_ ]?dien[_ ]?thoai|phone|mobile)\s*[:=]\s*['"]?(\+?84|0)(3|5|7|8|9)\d{8}
```

## Exclusion Patterns

Skip matches in these contexts:
- Files: `*.example`, `*.test.*`, `*.spec.*`, `*.md`, `*.txt`
- Directories: `node_modules/`, `dist/`, `vendor/`, `__pycache__/`
- Content: Lines containing `TODO`, `FIXME`, `YOUR_`, `REPLACE_`, `xxx`, `placeholder`
- Content: Variable declarations without actual values (`= process.env.`, `= os.getenv(`)
