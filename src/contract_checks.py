"""Cross-field guards supplement JSON Schema. No network access required."""

import re

PATH_PATTERN = re.compile(r"(?:\.[A-Za-z_][A-Za-z0-9_]*|\[[0-9]+\])")


def _value_at_path(record, path):
    if not path.startswith("listing."):
        raise ValueError("evidence must address a listing field")
    x = record
    cursor = 0
    for token in re.findall(r"[A-Za-z_][A-Za-z0-9_]*|\[[0-9]+\]", path):
        if token.startswith("["):
            x = x[int(token[1:-1])]
        else:
            x = x[token]
    return x


def validate_evidence_links(doc):
    """Detect fabricated/dead evidence pointers and unsupported explicit claims.

    A separate runtime step must verify literal excerpts against the source bytes.
    """
    source_ids = [s['id'] for s in doc['sources']]
    errs = []
    if len(source_ids) != len(set(source_ids)):
        errs.append('duplicated source identifiers')
    for i, e in enumerate(doc['evidence']):
        if e['source_id'] not in source_ids:
            errs.append(f'evidence[{i}] points to missing source')
        try:
            val = _value_at_path(doc, e['field_path'])
        except (KeyError, IndexError, TypeError, ValueError):
            errs.append(f'evidence[{i}] has invalid field path')
            continue
        if val is None:
            errs.append(f'evidence[{i}] points to missing value')
        if e['kind'] == 'explicit' and not (e.get('verbatim_excerpt') or '').strip():
            errs.append(f'evidence[{i}] explicit claim has no text span')
    return errs
