import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("G31: MissionControlView zoom state is declared before prepMode useEffect (TDZ)", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/travelAssistant/MissionControlView.tsx"),
    "utf8",
  );
  const zoomDecl = src.search(/const \[zoom, setZoom\] = useState/u);
  const effectDecl = src.search(/if \(prepMode\) setZoom\("trip"\)/u);
  assert.ok(zoomDecl > 0, "zoom useState missing");
  assert.ok(effectDecl > 0, "prepMode zoom effect missing");
  assert.ok(
    zoomDecl < effectDecl,
    "zoomTouched/setZoom read before useState — Trip tab crashes (Cannot access before initialization)",
  );
});
