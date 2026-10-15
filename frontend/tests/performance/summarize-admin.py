"""Summarize admin-comparison.ts raw output; Python standard library only.
Usage: python tests/performance/summarize-admin.py /path/to/results.json
Percentiles use linear interpolation at (n - 1) * p; retain raw input separately.
"""
import json
import math
import statistics
import sys


def distribution(values):
    values = sorted(values)
    def percentile(p):
        index = (len(values) - 1) * p
        low, high = math.floor(index), math.ceil(index)
        return values[low] + (values[high] - values[low]) * (index - low)
    return {"n": len(values), "min": values[0], "p50": percentile(.5),
            "p75": percentile(.75), "p95": percentile(.95), "max": values[-1]}


def summarize(data):
    output = {}
    for route in ["/admin/products", "/admin/inventory"]:
        output[route] = {}
        for revision in data["revisions"]:
            label = revision["label"]
            blocks = [b for b in data["results"] if b["label"] == label and b["route"] == route]
            assert len(blocks) == 6, "Incomplete run: need all six counterbalanced blocks"
            output[route][label] = {}
            for mode in ["warm", "rsc"]:
                samples = [s for b in blocks for s in b[mode]]
                assert len(samples) >= 30
                operations = {}
                for sample in samples:
                    for operation in sample["operations"]:
                        key = operation["model"] + "." + operation["action"]
                        operations.setdefault(key, []).append(operation["durationMs"])
                output[route][label][mode] = {
                    **{key: distribution([s[key] for s in samples]) for key in
                       ["ttfbMs", "responseMs", "sqlDurationMs", "queryCount", "bytes", "chunks"]},
                    "operations": {key: distribution(values) for key, values in operations.items()},
                    "blockResponseMedians": [statistics.median(s["responseMs"] for s in b[mode]) for b in blocks],
                    "blockTtfbMedians": [statistics.median(s["ttfbMs"] for s in b[mode]) for b in blocks],
                }
    return output


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as source:
        print(json.dumps(summarize(json.load(source)), indent=2))
