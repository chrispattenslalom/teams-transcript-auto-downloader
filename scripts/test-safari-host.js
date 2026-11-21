import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { addUninstallControls } from "../safari/host-ui.js";

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "safari-host-test-"));
const nativeController = `SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
    DispatchQueue.main.async {
        NSApplication.shared.terminate(nil)
    }
}
`;
const manualSettings = /Safari > Settings \(or Preferences\) > Extensions/;

try {
  for (const layout of ["modern", "shared"]) {
    const project = path.join(temporaryDirectory, layout);
    const app = path.join(project, "App");
    const htmlDirectory = path.join(app, layout === "modern" ? "Resources/Base.lproj" : "Base.lproj");
    const scriptDirectory = path.join(app, "Resources");
    mkdirSync(htmlDirectory, { recursive: true });
    mkdirSync(scriptDirectory, { recursive: true });

    const htmlPath = path.join(htmlDirectory, "Main.html");
    const scriptPath = path.join(scriptDirectory, "Script.js");
    writeFileSync(htmlPath, '<body><button class="platform-mac open-preferences">Open Safari Settings</button></body>');
    writeFileSync(
      scriptPath,
      'function openPreferences() { return bridge.open(); }\ndocument.querySelector("button.open-preferences").addEventListener("click", openPreferences);\n'
    );
    writeFileSync(path.join(scriptDirectory, "Style.css"), "body { display: flex; }\n");
    const controllerPath = path.join(app, "ViewController.swift");
    writeFileSync(controllerPath, nativeController);

    addUninstallControls(project);

    const html = readFileSync(htmlPath, "utf8");
    assert.match(html, /class="platform-mac open-preferences"/);
    assert.match(html, /id="uninstall-extension"[^>]*>Uninstall Extension in Safari<\/button>/);
    assert.match(html, /In Safari, select this extension and click Uninstall/);
    const controller = readFileSync(controllerPath, "utf8");
    assert.match(controller, /if let error = error[\s\S]*NSAlert\(error: error\)/);
    assert.match(controller, /else\s*\{\s*NSApplication\.shared\.terminate\(nil\)/);
    assert.match(controller, manualSettings);

    const handlers = {};
    const message = { hidden: true, textContent: "" };
    const bridge = {
      calls: 0,
      fail: null,
      open() {
        if (this.fail === "sync") throw new Error("Safari unavailable");
        if (this.fail === "async") return Promise.reject(new Error("Safari unavailable asynchronously"));
        this.calls += 1;
      }
    };
    const document = {
      querySelector() {
        return { addEventListener: (_, listener) => { handlers.existing = listener; } };
      },
      getElementById(id) {
        if (id === "uninstall-message") return message;
        assert.equal(id, "uninstall-extension");
        return { addEventListener: (_, listener) => { handlers.uninstall = listener; } };
      }
    };
    runInNewContext(readFileSync(scriptPath, "utf8"), { document, bridge });

    handlers.existing();
    await handlers.uninstall();
    assert.equal(bridge.calls, 2);
    assert.equal(message.hidden, false);
    assert.match(message.textContent, manualSettings);

    bridge.fail = "sync";
    await handlers.uninstall();
    assert.match(message.textContent, /Safari unavailable/);
    assert.match(message.textContent, manualSettings);

    bridge.fail = "async";
    await handlers.uninstall();
    assert.match(message.textContent, /Safari unavailable asynchronously/);
    assert.match(message.textContent, manualSettings);

    assert.throws(() => addUninstallControls(project), /unexpected preferences or uninstall controls/);
  }

  const missing = path.join(temporaryDirectory, "missing");
  mkdirSync(missing);
  assert.throws(() => addUninstallControls(missing), /Expected one Safari host page/);

  const missingScript = path.join(temporaryDirectory, "missing-script");
  mkdirSync(missingScript);
  const pagePath = path.join(missingScript, "Main.html");
  const page = '<body><button class="open-preferences">Open Safari Settings</button></body>';
  writeFileSync(pagePath, page);
  assert.throws(() => addUninstallControls(missingScript), /Expected one Safari host preferences script, found 0/);
  assert.equal(readFileSync(pagePath, "utf8"), page);

  const missingStylesheet = path.join(temporaryDirectory, "missing-stylesheet");
  mkdirSync(missingStylesheet);
  const unstyledPagePath = path.join(missingStylesheet, "Main.html");
  writeFileSync(unstyledPagePath, page);
  writeFileSync(path.join(missingStylesheet, "Script.js"), "function openPreferences() {}\n");
  assert.throws(() => addUninstallControls(missingStylesheet), /Safari host stylesheet not found/);
  assert.equal(readFileSync(unstyledPagePath, "utf8"), page);

  writeFileSync(path.join(missingStylesheet, "Style.css"), "body { display: flex; }\n");
  writeFileSync(path.join(missingStylesheet, "ViewController.swift"), "// Unsupported host template\n");
  assert.throws(() => addUninstallControls(missingStylesheet), /Expected one compatible Safari host controller, found 0/);
  assert.equal(readFileSync(unstyledPagePath, "utf8"), page);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
