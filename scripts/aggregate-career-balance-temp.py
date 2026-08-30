import glob
import json

rows = [json.load(open(path, encoding="utf-8")) for path in sorted(glob.glob("results/result-*.json"))]
runs = sum(row["count"] for row in rows)
peak_sum = sum(row["peakSum"] for row in rows)
below70 = sum(row["below70"] for row in rows)
at_least85 = sum(row["atLeast85"] for row in rows)
goals_sum = sum(row["goalsSum"] for row in rows)
assists_sum = sum(row["assistsSum"] for row in rows)
positions = {}
for row in rows:
    for key, value in row["byPosition"].items():
        target = positions.setdefault(key, {field: 0 for field in value})
        for field, amount in value.items():
            target[field] += amount
summary_positions = {}
for key, value in positions.items():
    item = {
        "careers": value["count"],
        "averagePeakOverall": round(value["peakSum"] / value["count"], 2),
        "averageGoals": round(value["goalsSum"] / value["count"], 1),
        "averageAssists": round(value["assistsSum"] / value["count"], 1),
        "below70": value["below70"],
        "atLeast85": value["atLeast85"],
    }
    if key == "CA":
        item["ca8082Careers"] = value["ca8082Count"]
        item["ca8082AverageGoals"] = round(value["ca8082Goals"] / max(1, value["ca8082Count"]), 1)
        item["ca8082AverageAssists"] = round(value["ca8082Assists"] / max(1, value["ca8082Count"]), 1)
    summary_positions[key] = item
out = {
    "runs": runs,
    "averagePeakOverall": round(peak_sum / runs, 2),
    "below70": below70,
    "below70Percent": round(below70 * 100 / runs, 2),
    "atLeast85": at_least85,
    "atLeast85Percent": round(at_least85 * 100 / runs, 2),
    "averageGoals": round(goals_sum / runs, 1),
    "averageAssists": round(assists_sum / runs, 1),
    "positions": summary_positions,
}
print("CAREER_BALANCE_FINAL=" + json.dumps(out, ensure_ascii=False, sort_keys=True))
