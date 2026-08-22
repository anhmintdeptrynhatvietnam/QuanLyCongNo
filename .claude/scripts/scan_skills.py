#!/usr/bin/env python3
"""
Scan claude/skills and regenerate the checked-in skill registries.

Generates three views keyed by directory identity:
  1. Standard active: tier1 + tier2 from skill-tiers.json
  2. Inactive optional packs: per-pack grouping from packs section
  3. Full canonical inventory: all skills

Identity = directory name (never frontmatter).
Display label = frontmatter name: field (separate field in output).

Modular design:
  - validate-skill-frontmatter.py  — category constants + schema validation
  - score-skill-description.py     — description scoring (Phase 2)
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

# Kebab-case filenames require importlib for Python imports.
import importlib.util as _ilu


def _load_sibling(filename: str, module_name: str):
    """Load a sibling Python module with a kebab-case filename."""
    path = Path(__file__).with_name(filename)
    spec = _ilu.spec_from_file_location(module_name, path)
    mod = _ilu.module_from_spec(spec)  # type: ignore[arg-type]
    sys.modules[module_name] = mod  # register so dataclasses can resolve
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


_vsfm = _load_sibling("validate-skill-frontmatter.py", "validate_skill_frontmatter")
CATEGORY_NAMES: dict[str, str] = _vsfm.CATEGORY_NAMES
CATEGORY_ORDER: list[str] = _vsfm.CATEGORY_ORDER
EXACT_CATEGORY_MAP: dict[str, str] = _vsfm.EXACT_CATEGORY_MAP
VALID_CATEGORIES: frozenset[str] = _vsfm.VALID_CATEGORIES

_scorer = _load_sibling("score-skill-description.py", "score_skill_description")

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


# ── Skill-tiers manifest loader ────────────────────────────────────────────────

def load_skill_tiers(repo_root: Path) -> dict:
    """Load claude/skill-tiers.json after canonical semantic validation."""
    validator = repo_root / "scripts" / "validate-skill-tiers.cjs"
    result = subprocess.run(
        ["node", str(validator)],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        diagnostics = "\n".join(part.strip() for part in (result.stdout, result.stderr) if part.strip())
        raise SystemExit(f"Error: canonical skill-tier validation failed:\n{diagnostics}")

    manifest_path = repo_root / "claude" / "skill-tiers.json"
    if not manifest_path.exists():
        raise SystemExit(f"Error: skill-tiers.json not found at {manifest_path}")
    try:
        with manifest_path.open(encoding="utf-8") as f:
            manifest = json.load(f)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Error: cannot parse skill-tiers.json: {exc}") from exc

    # Validate required keys
    for key in ("skills", "tiers", "optional", "packs", "catalogs"):
        if key not in manifest:
            raise SystemExit(f"Error: skill-tiers.json missing required key: {key!r}")

    tier1 = manifest.get("tiers", {}).get("tier1", [])
    tier2 = manifest.get("tiers", {}).get("tier2", [])
    standard = tier1 + tier2
    if len(set(standard)) != len(standard):
        raise SystemExit("Error: skill-tiers.json standard catalog (tier1+tier2) has duplicate IDs")

    return manifest


def get_standard_ids(manifest: dict) -> list[str]:
    """Return the ordered list of standard skill directory IDs."""
    tier1 = manifest.get("tiers", {}).get("tier1", [])
    tier2 = manifest.get("tiers", {}).get("tier2", [])
    return tier1 + tier2


def get_optional_ids(manifest: dict) -> list[str]:
    """Return the optional skill directory IDs (flat)."""
    return list(manifest.get("optional", []))


def get_display_label(skill_id: str, manifest: dict) -> str:
    """Return the canonical display label from skill-tiers.json or fall back to id."""
    skills = manifest.get("skills", {})
    entry = skills.get(skill_id, {})
    label = entry.get("displayLabel", "")
    return label if label else skill_id


def get_command(skill_id: str) -> str:
    """Return the invocation users type for a skill directory id.

    Runtimes namespace plugin commands as ``/<plugin>:<skill>`` and this kit
    publishes under the plugin name ``fis``, so the directory id ``fis-craft``
    is invoked as ``/fis:craft``.
    """
    return "/" + skill_id.replace("-", ":", 1)


# ── Frontmatter extraction ─────────────────────────────────────────────────────

class FrontmatterParseError(ValueError):
    """Raised when canonical SKILL frontmatter uses invalid/unsupported syntax."""


def _parse_scalar(value: str, line_number: int) -> object:
    value = value.strip()
    if not value:
        raise FrontmatterParseError(f"line {line_number}: empty scalar")
    if value.startswith("["):
        return _parse_inline_list(value, line_number)
    if value.startswith("{") or value.startswith("&") or value.startswith("*") or value.startswith("!"):
        raise FrontmatterParseError(
            f"line {line_number}: unsupported YAML scalar syntax: {value!r}"
        )
    if value.startswith('"'):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as exc:
            raise FrontmatterParseError(
                f"line {line_number}: invalid double-quoted scalar: {exc.msg}"
            ) from exc
        if not isinstance(parsed, str):
            raise FrontmatterParseError(f"line {line_number}: quoted scalar must be a string")
        return parsed
    if value.startswith("'"):
        if len(value) < 2 or not value.endswith("'"):
            raise FrontmatterParseError(f"line {line_number}: unterminated single-quoted scalar")
        return value[1:-1].replace("''", "'")
    if value.endswith('"') or value.endswith("'"):
        raise FrontmatterParseError(f"line {line_number}: mismatched scalar quote")

    lowered = value.lower()
    if lowered in {"true", "false"}:
        return lowered == "true"
    if lowered in {"null", "~"}:
        return None
    if re.fullmatch(r"-?[0-9]+", value):
        return int(value)
    if re.fullmatch(r"-?[0-9]+\.[0-9]+", value):
        return float(value)
    return value


def _parse_inline_list(value: str, line_number: int) -> list[object]:
    if not value.endswith("]"):
        raise FrontmatterParseError(f"line {line_number}: unterminated inline list")
    body = value[1:-1].strip()
    if not body:
        return []

    items: list[str] = []
    current: list[str] = []
    quote: str | None = None
    escaped = False
    for char in body:
        if escaped:
            current.append(char)
            escaped = False
            continue
        if quote == '"' and char == "\\":
            current.append(char)
            escaped = True
            continue
        if char in {'"', "'"}:
            if quote is None:
                quote = char
            elif quote == char:
                quote = None
            current.append(char)
            continue
        if char == "," and quote is None:
            item = "".join(current).strip()
            if not item:
                raise FrontmatterParseError(f"line {line_number}: empty inline-list item")
            items.append(item)
            current = []
            continue
        if char in "[]" and quote is None:
            raise FrontmatterParseError(f"line {line_number}: nested inline lists are unsupported")
        current.append(char)

    if quote is not None or escaped:
        raise FrontmatterParseError(f"line {line_number}: unterminated inline-list quote")
    final = "".join(current).strip()
    if not final:
        raise FrontmatterParseError(f"line {line_number}: empty inline-list item")
    items.append(final)
    return [_parse_scalar(item, line_number) for item in items]


def _parse_indented_value(lines: list[str], start_index: int, key: str) -> tuple[object, int]:
    collected: list[tuple[int, str]] = []
    index = start_index
    while index < len(lines):
        line = lines[index]
        if line.strip() and not line.startswith(" "):
            break
        if "\t" in line[: len(line) - len(line.lstrip())]:
            raise FrontmatterParseError(f"line {index + 1}: tabs are not allowed for indentation")
        collected.append((index + 1, line))
        index += 1

    nonempty = [(line_number, line) for line_number, line in collected if line.strip()]
    if not nonempty:
        raise FrontmatterParseError(f"line {start_index}: {key!r} requires an indented value")
    indent = min(len(line) - len(line.lstrip(" ")) for _, line in nonempty)
    if indent < 2:
        raise FrontmatterParseError(f"line {nonempty[0][0]}: nested values require two-space indentation")

    normalized = [
        (line_number, line[indent:] if line.strip() else "")
        for line_number, line in collected
    ]
    value_lines = [(line_number, line) for line_number, line in normalized if line.strip()]
    if all(line.startswith("- ") for _, line in value_lines):
        parsed_list = [
            _parse_scalar(line[2:].strip(), line_number)
            for line_number, line in value_lines
        ]
        return parsed_list, index

    parsed_map: dict[str, object] = {}
    for line_number, line in value_lines:
        if line.startswith(" "):
            raise FrontmatterParseError(
                f"line {line_number}: nested mappings deeper than one level are unsupported"
            )
        match = re.fullmatch(r"([A-Za-z0-9_-]+):\s*(.+)", line)
        if not match:
            raise FrontmatterParseError(f"line {line_number}: invalid nested mapping entry")
        nested_key, nested_value = match.groups()
        if nested_key in parsed_map:
            raise FrontmatterParseError(
                f"line {line_number}: duplicate nested key {nested_key!r}"
            )
        parsed_map[nested_key] = _parse_scalar(nested_value, line_number)
    return parsed_map, index


def _parse_block_scalar(
    lines: list[str],
    start_index: int,
    style: str,
    key: str,
) -> tuple[str, int]:
    collected: list[tuple[int, str]] = []
    index = start_index
    while index < len(lines):
        line = lines[index]
        if line.strip() and not line.startswith(" "):
            break
        collected.append((index + 1, line))
        index += 1
    nonempty = [(line_number, line) for line_number, line in collected if line.strip()]
    if not nonempty:
        raise FrontmatterParseError(f"line {start_index}: {key!r} block scalar is empty")
    indent = min(len(line) - len(line.lstrip(" ")) for _, line in nonempty)
    if indent < 2:
        raise FrontmatterParseError(f"line {nonempty[0][0]}: block scalar requires indentation")
    normalized = [line[indent:] if line.strip() else "" for _, line in collected]
    if style.startswith(">"):
        value = " ".join(line.strip() for line in normalized if line.strip())
    else:
        value = "\n".join(normalized)
    if not style.endswith("-"):
        value += "\n"
    return value, index


def extract_frontmatter(content: str) -> dict:
    """Parse the canonical SKILL frontmatter subset without optional dependencies."""
    match = FRONTMATTER_RE.match(content)
    if not match:
        raise FrontmatterParseError("missing or unterminated frontmatter")

    result: dict = {}
    lines = match.group(1).splitlines()
    idx = 0
    while idx < len(lines):
        line = lines[idx]
        if not line.strip() or line.lstrip().startswith("#"):
            idx += 1
            continue
        if line.startswith((" ", "\t")):
            raise FrontmatterParseError(f"line {idx + 2}: unexpected top-level indentation")
        fm = re.fullmatch(r"([A-Za-z0-9_-]+):\s*(.*)", line)
        if not fm:
            raise FrontmatterParseError(f"line {idx + 2}: invalid frontmatter entry")
        key, value = fm.group(1), fm.group(2).strip()
        if key in result:
            raise FrontmatterParseError(f"line {idx + 2}: duplicate key {key!r}")
        if value in {">", ">-", "|", "|-"}:
            idx += 1
            result[key], idx = _parse_block_scalar(lines, idx, value, key)
            continue
        if not value:
            idx += 1
            result[key], idx = _parse_indented_value(lines, idx, key)
            continue
        result[key] = _parse_scalar(value, idx + 2)
        idx += 1
    return result


def validate_catalog_frontmatter(frontmatter: dict, skill_path: Path) -> None:
    """Fail closed for metadata used to identify and render catalog entries."""
    errors: list[str] = []
    for required in ("name", "description"):
        value = frontmatter.get(required)
        if not isinstance(value, str) or not value.strip():
            errors.append(f"{required!r} must be a nonempty string")
    for scalar in ("category", "argument-hint", "maturity"):
        value = frontmatter.get(scalar)
        if value is not None and not isinstance(value, str):
            errors.append(f"{scalar!r} must be a string")
    for list_key in ("keywords", "requires", "related"):
        value = frontmatter.get(list_key)
        if value is not None and (
            not isinstance(value, list) or
            any(not isinstance(item, str) or not item for item in value)
        ):
            errors.append(f"{list_key!r} must be an array of nonempty strings")
    if errors:
        raise FrontmatterParseError(
            f"{skill_path}: invalid catalog frontmatter: {'; '.join(errors)}"
        )


def extract_first_paragraph(content: str) -> str:
    """Extract the first meaningful paragraph after frontmatter."""
    body = FRONTMATTER_RE.sub("", content, count=1)
    paragraph: list[str] = []
    for raw_line in body.splitlines():
        line = raw_line.strip()
        if line.startswith("#") or not line:
            if paragraph:
                break
            continue
        paragraph.append(line)
        if line.endswith(".") and len(" ".join(paragraph)) > 50:
            break
    return " ".join(paragraph)[:400]


# ── Categorization ─────────────────────────────────────────────────────────────

def categorize_skill(name: str, frontmatter: dict | None = None) -> str:
    """Categorize skill. Prefers frontmatter 'category', falls back to heuristics."""
    if frontmatter:
        cat = frontmatter.get("category")
        if cat and cat in VALID_CATEGORIES:
            return cat
    lower = name.lower()
    if lower in EXACT_CATEGORY_MAP:
        return EXACT_CATEGORY_MAP[lower]
    if any(x in lower for x in ["ai-", "gemini", "multimodal", "adk"]):
        return "ai-ml"
    if any(x in lower for x in ["mcp", "skill-creator", "repomix", "docs-seeker"]):
        return "dev-tools"
    if any(x in lower for x in ["frontend", "ui", "design", "aesthetic", "threejs"]):
        return "frontend"
    if any(x in lower for x in ["backend", "auth", "payment"]):
        return "backend"
    if any(x in lower for x in ["devops", "docker", "cloudflare", "gcloud"]):
        return "infrastructure"
    if any(x in lower for x in ["database", "mongodb", "postgresql", "sql"]):
        return "database"
    if any(x in lower for x in ["media", "chrome-devtools", "document-skills"]):
        return "multimedia"
    if any(x in lower for x in ["web-frameworks", "mobile", "shopify"]):
        return "frameworks"
    if any(x in lower for x in ["debug", "problem", "code-review", "planning", "research", "sequential"]):
        return "utilities"
    return "other"


def normalize_display_name(internal_name: str, frontmatter: dict) -> str:
    raw = frontmatter.get("name", "")
    return raw if raw else internal_name


# ── Scanner ────────────────────────────────────────────────────────────────────

def scan_skills(base_path: Path) -> list[dict]:
    """Scan all skill SKILL.md files and extract metadata. Skips symlinks.
    Identity (name field) is always the directory name, never frontmatter.
    Display label is the frontmatter name: field, stored separately.
    """
    skills: list[dict] = []
    resolved_base = base_path.resolve()

    for skill_file in sorted(base_path.rglob("SKILL.md")):
        if skill_file.is_symlink() or not skill_file.resolve().is_relative_to(resolved_base):
            print(f"WARNING: Skipping symlinked or escaped path: {skill_file}", file=sys.stderr)
            continue
        skill_dir = skill_file.parent
        # Identity is always the leaf directory name (never frontmatter)
        skill_id = skill_dir.name
        if skill_id == "template-skill":
            continue
        # internal_name for paths: include parent for nested skills
        internal_name = skill_id
        if skill_dir.parent.name != "skills":
            internal_name = f"{skill_dir.parent.name}/{skill_id}"

        content = skill_file.read_text(encoding="utf-8")
        try:
            frontmatter = extract_frontmatter(content)
            validate_catalog_frontmatter(frontmatter, skill_file)
        except FrontmatterParseError as exc:
            raise SystemExit(f"Error: {skill_file}: {exc}") from exc
        description = frontmatter["description"]
        # display_label is the frontmatter name, kept separate from identity
        display_label = normalize_display_name(skill_id, frontmatter)
        entry: dict = {
            "id": skill_id,                  # directory identity (command key)
            "name": internal_name,           # path-relative name (for registry)
            "display_name": display_label,   # frontmatter name (display only)
            "path": str(skill_file.relative_to(base_path)),
            "description": description,
            "category": categorize_skill(internal_name, frontmatter),
            "has_scripts": (skill_dir / "scripts").exists(),
            "has_references": (skill_dir / "references").exists(),
        }
        for fm_key, entry_key in [("argument-hint", "argument_hint"), ("maturity", "maturity")]:
            val = frontmatter.get(fm_key, "")
            if val:
                entry[entry_key] = val
        for list_key in ("keywords", "requires", "related"):
            val = frontmatter.get(list_key)
            if isinstance(val, list) and val:
                entry[list_key] = val
        skills.append(entry)
    return skills


def group_by_category(skills: list[dict]) -> dict[str, list[dict]]:
    cats: dict[str, list[dict]] = defaultdict(list)
    for skill in skills:
        cats[str(skill["category"])].append(skill)
    return cats


def index_by_id(skills: list[dict]) -> dict[str, dict]:
    """Build a map from directory ID to skill entry."""
    index: dict[str, dict] = {}
    duplicates: list[str] = []
    for skill in skills:
        skill_id = str(skill["id"])
        if skill_id in index:
            duplicates.append(skill_id)
        index[skill_id] = skill
    if duplicates:
        raise SystemExit(
            f"Error: duplicate canonical skill directory IDs: {', '.join(sorted(set(duplicates)))}"
        )
    return index


def validate_catalog_inputs(skills: list[dict], manifest: dict, base_path: Path) -> None:
    """Require the on-disk inventory to match the manifest source descriptors."""
    diagnostics: list[str] = []
    skill_index = index_by_id(skills)
    descriptors = manifest.get("skills", {})
    manifest_ids = set(descriptors)
    scanned_ids = set(skill_index)

    for missing in sorted(manifest_ids - scanned_ids):
        diagnostics.append(f"manifest skill has no scanned SKILL.md: {missing}")
    for extra in sorted(scanned_ids - manifest_ids):
        diagnostics.append(f"scanned SKILL.md is absent from manifest: {extra}")

    manifest_source_paths: set[str] = set()
    scanned_source_paths: set[str] = set()
    for skill_id, descriptor in descriptors.items():
        source_path = descriptor.get("sourcePath") if isinstance(descriptor, dict) else None
        if not isinstance(source_path, str):
            diagnostics.append(f"skills.{skill_id}.sourcePath must be a string")
            continue
        if source_path in manifest_source_paths:
            diagnostics.append(f"duplicate sourcePath in manifest: {source_path}")
        manifest_source_paths.add(source_path)

        skill_file = base_path / source_path / "SKILL.md"
        if skill_file.is_symlink() or not skill_file.is_file():
            diagnostics.append(f"skills.{skill_id} must resolve to a regular SKILL.md: {source_path}")

        scanned = skill_index.get(skill_id)
        if not scanned:
            continue
        scanned_source = Path(str(scanned["path"])).parent.as_posix()
        scanned_source_paths.add(scanned_source)
        if scanned_source != source_path:
            diagnostics.append(
                f"skills.{skill_id}.sourcePath mismatch: manifest={source_path}, scanned={scanned_source}"
            )

    for missing in sorted(manifest_source_paths - scanned_source_paths):
        diagnostics.append(f"manifest sourcePath was not scanned: {missing}")
    for extra in sorted(scanned_source_paths - manifest_source_paths):
        diagnostics.append(f"scanned sourcePath is absent from manifest: {extra}")

    standard_ids = get_standard_ids(manifest)
    optional_ids = get_optional_ids(manifest)
    if len(set(standard_ids)) != len(standard_ids):
        diagnostics.append("standard tiers must not repeat an ID")
    if len(set(optional_ids)) != len(optional_ids):
        diagnostics.append("optional must not repeat an ID")
    if set(standard_ids) & set(optional_ids):
        diagnostics.append("standard and optional skill IDs must not overlap")
    if set(standard_ids) | set(optional_ids) != manifest_ids:
        diagnostics.append("standard plus optional IDs must exactly cover the canonical manifest")

    pack_members = [
        skill_id
        for pack in manifest.get("packs", {}).values()
        if isinstance(pack, dict)
        for skill_id in pack.get("skills", [])
    ]
    if set(pack_members) != set(optional_ids):
        diagnostics.append("packs must own every optional skill exactly once")
    if len(pack_members) != len(set(pack_members)):
        diagnostics.append("optional skills must not overlap across packs")

    if diagnostics:
        raise SystemExit(
            "Error: catalog input validation failed:\n" +
            "\n".join(f"  - {diagnostic}" for diagnostic in diagnostics)
        )


# ── Output writers ─────────────────────────────────────────────────────────────

def _qs(value: str) -> str:
    """Quoted YAML scalar with full escape handling."""
    return '"' + (
        value
        .replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
        .replace("\0", "")
    ) + '"'


def _yaml_list(items: list) -> str:
    """YAML inline list with properly escaped items."""
    return "[" + ", ".join(_qs(str(i)) for i in items) + "]"


def _skill_yaml_lines(skill: dict, indent: str = "") -> list[str]:
    lines = [
        f'{indent}- id: {_qs(str(skill["id"]))}',
        f'{indent}  display: {_qs(str(skill["display_name"]))}',
        f'{indent}  path: {_qs(str(skill["path"]))}',
        f'{indent}  description: {_qs(str(skill["description"]))}',
        f'{indent}  category: {_qs(str(skill["category"]))}',
        f'{indent}  has_scripts: {"true" if skill["has_scripts"] else "false"}',
        f'{indent}  has_references: {"true" if skill["has_references"] else "false"}',
    ]
    for opt in ("argument_hint", "maturity"):
        if opt in skill:
            lines.append(f'{indent}  {opt}: {_qs(str(skill[opt]))}')
    for lst in ("keywords", "requires", "related"):
        if lst in skill:
            lines.append(f'{indent}  {lst}: {_yaml_list(skill[lst])}')
    return lines


def write_catalog_yaml(
    skills: list[dict],
    repo_root: Path,
    manifest: dict,
) -> Path:
    """Write SKILLS.yaml with three views: standard active, optional packs, full inventory."""
    skill_index = index_by_id(skills)
    standard_ids = get_standard_ids(manifest)
    optional_ids = get_optional_ids(manifest)
    packs = manifest.get("packs", {})

    standard_skills = [skill_index[sid] for sid in standard_ids if sid in skill_index]
    optional_skills = [skill_index[sid] for sid in optional_ids if sid in skill_index]
    all_skills = standard_skills + optional_skills

    out = repo_root / "guide" / "SKILLS.yaml"
    lines = [
        "metadata:",
        f"  title: {_qs('FIS AI Kit Skills Catalog')}",
        f"  description: {_qs('Auto-generated catalog of all available skills in FIS AI Kit')}",
        f"  manifest_version: {_qs(str(manifest.get('version', '')))}",
        f"  standard_count: {len(standard_skills)}",
        f"  optional_count: {len(optional_skills)}",
        f"  total_count: {len(all_skills)}",
        f"  note: {_qs('identity = directory ID; display = frontmatter label')}",
        "",
        f"# ── Standard Active Skills ({len(standard_skills)}: tier1 + tier2) "
        "─────────────────────",
        "standard_active:",
    ]
    for skill in standard_skills:
        lines.extend(_skill_yaml_lines(skill, indent="  "))
    lines.append("")

    lines.append(
        f"# ── Inactive Optional Packs ({len(optional_skills)} skills in packs) "
        "───────────────────"
    )
    lines.append("optional_packs:")
    for pack_name, pack_info in packs.items():
        pack_ids = pack_info.get("skills", [])
        pack_skills = [skill_index[sid] for sid in pack_ids if sid in skill_index]
        lines.append(f"  {pack_name}:")
        lines.append(f"    description: {_qs(str(pack_info.get('description', '')))}")
        lines.append(f"    default: {_qs(str(pack_info.get('default', 'inactive')))}")
        lines.append(f"    count: {len(pack_skills)}")
        lines.append("    skills:")
        for skill in pack_skills:
            lines.extend(_skill_yaml_lines(skill, indent="      "))
    lines.append("")

    lines.append(
        f"# ── Full Canonical Inventory ({len(all_skills)} skills) "
        "──────────────────────────────"
    )
    lines.append("full_inventory:")
    for skill in all_skills:
        lines.extend(_skill_yaml_lines(skill, indent="  "))
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return out


def write_catalog_markdown(
    skills: list[dict],
    repo_root: Path,
    manifest: dict,
) -> Path:
    """Write SKILLS.md with three sections: standard active, optional packs, full inventory."""
    skill_index = index_by_id(skills)
    standard_ids = get_standard_ids(manifest)
    optional_ids = get_optional_ids(manifest)
    packs = manifest.get("packs", {})

    standard_skills = [skill_index[sid] for sid in standard_ids if sid in skill_index]
    optional_skills = [skill_index[sid] for sid in optional_ids if sid in skill_index]
    all_skills = standard_skills + optional_skills

    out = repo_root / "guide" / "SKILLS.md"
    lines = [
        "# FIS AI Kit — Skills Catalog", "",
        "Auto-generated. Do not hand-edit — run `npm run catalog` to regenerate.", "",
        f"**Manifest Version**: {manifest.get('version', '')}", "",
        "**Counts**: "
        f"{len(standard_skills)} standard active · "
        f"{len(optional_skills)} optional (in {len(packs)} packs) · "
        f"{len(all_skills)} total", "",
        "> Identity = directory ID (e.g. `/fis:outcome`). "
        "Display label = frontmatter `name:` field (shown separately). "
        "For spec-forge plugin skills, prefix with plugin name: `/spec-forge:fis-outcome`.", "",
        "## Contents", "",
        f"- [Standard Active Skills ({len(standard_skills)})]"
        f"(#standard-active-skills-{len(standard_skills)})",
        f"- [Inactive Optional Packs ({len(optional_skills)})]"
        f"(#inactive-optional-packs-{len(optional_skills)})",
        f"- [Full Canonical Inventory ({len(all_skills)})]"
        f"(#full-canonical-inventory-{len(all_skills)})",
        "",
    ]

    # ── Section 1: Standard Active
    tier1 = manifest.get("tiers", {}).get("tier1", [])
    tier2 = manifest.get("tiers", {}).get("tier2", [])
    tier1_set = set(tier1)

    lines.extend([
        f"## Standard Active Skills ({len(standard_skills)})",
        "",
        f"These {len(standard_skills)} skills are active by default. "
        "Invoke one as `/fis:<skill>`; "
        "the directory form `/fis-<skill>` resolves to the same skill.",
        "",
        "### Tier 1 — Core (10)",
        "",
    ])
    for sid in tier1:
        skill = skill_index.get(sid)
        if not skill:
            continue
        icons = ("📦 " if skill["has_scripts"] else "") + ("📚 " if skill["has_references"] else "")
        desc = str(skill["description"]).replace("\n", " ").strip()
        lines.extend([
            f"#### {icons}`{get_command(skill['id'])}`",
            f"> Display: `{skill['display_name']}`",
            "",
            desc,
            "",
        ])

    lines.extend([
        "### Tier 2 — Extended Standard (20)",
        "",
    ])
    for sid in tier2:
        skill = skill_index.get(sid)
        if not skill:
            continue
        icons = ("📦 " if skill["has_scripts"] else "") + ("📚 " if skill["has_references"] else "")
        desc = str(skill["description"]).replace("\n", " ").strip()
        lines.extend([
            f"#### {icons}`{get_command(skill['id'])}`",
            f"> Display: `{skill['display_name']}`",
            "",
            desc,
            "",
        ])

    # ── Section 2: Optional Packs
    lines.extend([
        f"## Inactive Optional Packs ({len(optional_skills)})",
        "",
        f"These {len(optional_skills)} skills are inactive by default. "
        "Enable a pack via DAI Kit Detail → Optional skill packs.",
        "Active skill count must stay ≤ 40; disable another pack before enabling a new one if needed.",
        "",
    ])
    for pack_name, pack_info in packs.items():
        pack_ids = pack_info.get("skills", [])
        pack_skills = [skill_index[sid] for sid in pack_ids if sid in skill_index]
        lines.extend([
            f"### Pack: `{pack_name}`",
            "",
            f"_{pack_info.get('description', '')}_",
            "",
        ])
        for skill in pack_skills:
            icons = ("📦 " if skill["has_scripts"] else "") + ("📚 " if skill["has_references"] else "")
            desc = str(skill["description"]).replace("\n", " ").strip()
            lines.extend([
                f"- {icons}`{get_command(skill['id'])}` — display `{skill['display_name']}`: {desc[:100].rstrip()}",
            ])
        lines.append("")

    # ── Section 3: Full Inventory
    lines.extend([
        f"## Full Canonical Inventory ({len(all_skills)})",
        "",
        "All skills ordered as: standard active then optional. "
        "Identity = directory ID. Display = frontmatter label.",
        "",
        "| ID | Display | Category | Description |",
        "|----|---------|----------|-------------|",
    ])
    for skill in all_skills:
        desc = str(skill["description"]).replace("\n", " ").strip()[:80]
        active = "✓" if skill["id"] in set(standard_ids) else "opt"
        lines.append(
            f"| `{get_command(skill['id'])}` ({active}) | `{skill['display_name']}` "
            f"| {skill['category']} | {desc} |"
        )
    lines.append("")

    out.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    return out


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    base_path = repo_root / "claude" / "skills"
    if not base_path.exists():
        raise SystemExit(f"Error: {base_path} not found")

    supported_arguments = {"--strict", "--check"}
    unknown_arguments = [argument for argument in sys.argv[1:] if argument not in supported_arguments]
    if unknown_arguments:
        raise SystemExit(f"Error: unknown argument(s): {', '.join(unknown_arguments)}")
    strict = "--strict" in sys.argv
    check = "--check" in sys.argv

    # Load the skill-tiers manifest for authoritative tier/pack classification
    manifest = load_skill_tiers(repo_root)

    print("Scanning skills...")
    skills = scan_skills(base_path)
    print(f"Found {len(skills)} skills")
    validate_catalog_inputs(skills, manifest, base_path)

    skill_index = index_by_id(skills)
    standard_ids = get_standard_ids(manifest)
    optional_ids = get_optional_ids(manifest)

    standard_found = [sid for sid in standard_ids if sid in skill_index]
    optional_found = [sid for sid in optional_ids if sid in skill_index]

    print(f"  Standard active: {len(standard_found)}/{len(standard_ids)}")
    print(f"  Optional:        {len(optional_found)}/{len(optional_ids)}")
    print(f"  Total:           {len(standard_found) + len(optional_found)}/{len(skills)}")

    if check:
        # In check mode: run generation to temp, compare against on-disk
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            (tmp_root / "guide").mkdir()
            write_catalog_yaml(skills, tmp_root, manifest)
            write_catalog_markdown(skills, tmp_root, manifest)

            drift = False
            for rel in (
                "guide/SKILLS.yaml",
                "guide/SKILLS.md",
            ):
                expected = (tmp_root / rel).read_bytes()
                actual_path = repo_root / rel
                if not actual_path.exists():
                    print(f"DRIFT {rel} — file does not exist")
                    drift = True
                    continue
                actual = actual_path.read_bytes()
                if expected != actual:
                    print(f"DRIFT {rel} — run: npm run catalog")
                    drift = True
            if drift:
                raise SystemExit(1)
            print("catalog in sync (no drift).")
        return

    cat_yaml = write_catalog_yaml(skills, repo_root, manifest)
    cat_md = write_catalog_markdown(skills, repo_root, manifest)
    print(f"\n✓ Saved catalog YAML to {cat_yaml.relative_to(repo_root)}")
    print(f"✓ Saved catalog MD to {cat_md.relative_to(repo_root)}")

    # Format compliance scoring (Phase 2).
    scores = [
        _scorer.score_description(str(s["name"]), str(s["description"]))
        for s in skills
    ]
    confusable = _scorer.check_confusable_pairs(skills)
    cycles = _scorer.validate_dependency_graph(skills)
    _scorer.print_format_compliance_report(scores, confusable, cycles)

    if strict:
        failures = [s for s in scores if not s.passed]
        if failures or cycles:
            print(f"\n[X] --strict: {len(failures)} description failures, {len(cycles)} cycles")
            raise SystemExit(1)


if __name__ == "__main__":
    main()
