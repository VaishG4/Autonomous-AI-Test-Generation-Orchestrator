#!/usr/bin/env python3
"""
Emit AST regions (functions, classes, module) for a Python file as JSON.

Usage: py_ast_regions_fixed.py path/to/file.py

Output: { "regions": [ {"name":..., "kind": "function|class|module", "start": int, "end": int}, ... ] }
"""
import ast
import json
import sys


def region_for_node(node):
    if isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
        name = node.name
        kind = "function"
    elif isinstance(node, ast.ClassDef):
        name = node.name
        kind = "class"
    else:
        return None

    start = getattr(node, "lineno", None)
    end = getattr(node, "end_lineno", None)
    if start is None or end is None:
        return None

    return {"name": name, "kind": kind, "start": start, "end": end}


def collect_regions(source: str):
    try:
        tree = ast.parse(source)
    except Exception:
        return {"regions": [{"name": "<module>", "kind": "module", "start": 1, "end": 1}]}

    regions = []

    lines = source.splitlines()
    module_region = {"name": "<module>", "kind": "module", "start": 1, "end": max(1, len(lines))}
    regions.append(module_region)

    for node in ast.walk(tree):
        r = region_for_node(node)
        if r:
            regions.append(r)

    regions.sort(key=lambda r: r["start"]) 
    return {"regions": regions}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"regions": []}))
        return
    p = sys.argv[1]
    try:
        with open(p, "r", encoding="utf8") as f:
            src = f.read()
    except Exception:
        print(json.dumps({"regions": []}))
        return

    out = collect_regions(src)
    print(json.dumps(out))


if __name__ == "__main__":
    main()
