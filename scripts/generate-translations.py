#!/usr/bin/env python3
"""Generate en/es/it message files from messages/fr.json (batch, deduplicated)."""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

from deep_translator import GoogleTranslator

ROOT = Path(__file__).resolve().parents[1]
MESSAGES = ROOT / "messages"
FR_PATH = MESSAGES / "fr.json"
BATCH_SIZE = 40

KEEP_LITERAL = {
    "Le Pillaveur",
    "Purple",
    "Plinko",
    "PMU",
    "Monsieur 3",
    "Hi/Lo",
    "1220",
    "CGU",
    "SAFE",
    "Dashboard admin",
    "Trial Poursuite",
    "Matrix",
    "Kanpai",
    "Skål",
    "Prost",
    "Bottoms up",
    "Whoo",
    "TikTok",
    "Rewind",
}

ICU_PLURAL_RE = re.compile(r"\{count, plural, one \{([^}]*)\} other \{([^}]*)\}\}")
PLACEHOLDER_RE = re.compile(r"(\{[^{}]+\})")


def count_keys(obj) -> int:
    if isinstance(obj, dict):
        return sum(count_keys(v) for v in obj.values())
    if isinstance(obj, list):
        return sum(count_keys(v) for v in obj)
    return 1


def collect_strings(obj, out: set[str]) -> None:
    if isinstance(obj, dict):
        for v in obj.values():
            collect_strings(v, out)
    elif isinstance(obj, list):
        for v in obj:
            collect_strings(v, out)
    elif isinstance(obj, str):
        out.add(obj)


def protect(text: str) -> tuple[str, list[tuple[str, str]]]:
    tokens: list[tuple[str, str]] = []

    def repl(match: re.Match[str]) -> str:
        token = f"__T{len(tokens)}__"
        tokens.append((token, match.group(0)))
        return token

    protected = PLACEHOLDER_RE.sub(repl, text)
    for literal in sorted(KEEP_LITERAL, key=len, reverse=True):
        if literal in protected:
            token = f"__T{len(tokens)}__"
            tokens.append((token, literal))
            protected = protected.replace(literal, token)
    return protected, tokens


def restore(text: str, tokens: list[tuple[str, str]]) -> str:
    for token, original in tokens:
        text = text.replace(token, original)
    return text


def translate_icu(text: str, translator: GoogleTranslator) -> str:
    match = ICU_PLURAL_RE.search(text)
    if not match:
        return None  # type: ignore
    one = match.group(1).strip()
    other = match.group(2).strip()
    parts = [p for p in (one, other) if p]
    if not parts:
        return text
    translated_parts = translator.translate_batch(parts)
    one_tr = translated_parts[0] if one else one
    other_tr = translated_parts[1] if other else (translated_parts[0] if one else other)
    if one and not other:
        other_tr = other
    elif other and not one:
        one_tr = one
    return ICU_PLURAL_RE.sub(f"{{count, plural, one {{{one_tr}}} other {{{other_tr}}}}}", text, count=1)


def translate_unique(strings: set[str], target: str) -> dict[str, str]:
    translator = GoogleTranslator(source="fr", target=target)
    mapping: dict[str, str] = {}
    pending: list[str] = []
    pending_meta: list[tuple[str, list[tuple[str, str]]]] = []

    def flush() -> None:
        nonlocal pending, pending_meta
        if not pending:
            return
        try:
            results = translator.translate_batch(pending)
        except Exception as exc:
            print(f"  batch error ({exc}), retrying one-by-one...", file=sys.stderr)
            results = []
            for item in pending:
                time.sleep(0.2)
                try:
                    results.append(translator.translate(item))
                except Exception:
                    results.append(item)
        for (original, tokens), translated in zip(pending_meta, results):
            mapping[original] = restore(translated, tokens)
        pending = []
        pending_meta = []
        time.sleep(0.15)

    sorted_strings = sorted(strings, key=len)
    total = len(sorted_strings)
    done = 0

    for text in sorted_strings:
        if text in KEEP_LITERAL or not text.strip():
            mapping[text] = text
            done += 1
            continue

        icu = translate_icu(text, translator)
        if icu is not None:
            mapping[text] = icu
            done += 1
            continue

        protected, tokens = protect(text)
        pending.append(protected)
        pending_meta.append((text, tokens))

        if len(pending) >= BATCH_SIZE:
            flush()
            done += BATCH_SIZE
            print(f"  {min(done, total)}/{total}", flush=True)

    flush()
    print(f"  {total}/{total}", flush=True)
    return mapping


def apply_mapping(obj, mapping: dict[str, str]):
    if isinstance(obj, dict):
        return {k: apply_mapping(v, mapping) for k, v in obj.items()}
    if isinstance(obj, list):
        return [apply_mapping(v, mapping) for v in obj]
    if isinstance(obj, str):
        return mapping.get(obj, obj)
    return obj


def main() -> None:
    fr = json.loads(FR_PATH.read_text(encoding="utf-8"))
    unique: set[str] = set()
    collect_strings(fr, unique)
    print(f"Unique strings: {len(unique)}")

    for locale in ("en", "es", "it"):
        print(f"Translating -> {locale}")
        mapping = translate_unique(unique, locale)
        translated = apply_mapping(fr, mapping)
        out = MESSAGES / f"{locale}.json"
        out.write_text(json.dumps(translated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {out.name}: {count_keys(translated)} keys")

    print("Done.")


if __name__ == "__main__":
    main()
