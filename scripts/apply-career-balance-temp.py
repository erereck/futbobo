from pathlib import Path

path = Path("app/career/events.ts")
text = path.read_text(encoding="utf-8")
old = """    : fateRoll < 0.65
      ? 70 + Math.floor(ceilingRoll * 13)"""
new = """    : fateRoll < 0.65
      ? 71 + Math.floor(ceilingRoll * 13)"""
if text.count(old) != 1:
    raise SystemExit(f"Expected one potential-band match, found {text.count(old)}")
path.write_text(text.replace(old, new), encoding="utf-8")
print("Raised the common potential band by one OVR")
