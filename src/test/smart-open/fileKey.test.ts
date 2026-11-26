import * as assert from "assert";
import { pathInFolder } from "../../smart-open/fileKey";

suite("smart-open pathInFolder", () => {
  test("a folder opened as C:\\ finds its files in the lowercased-drive URIs VS Code builds", () => {
    assert.strictEqual(
      pathInFolder("/C:/Work/uptime-issue", "/c:/Work/uptime-issue/PacsCore/Scripts/iis.ps1"),
      "PacsCore/Scripts/iis.ps1"
    );
  });

  test("a folder at a drive root keeps the first character of its files' paths", () => {
    assert.strictEqual(pathInFolder("/C:/", "/c:/Scripts/iis.ps1"), "Scripts/iis.ps1");
  });
});
