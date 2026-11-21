import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function preferenceButtons(html) {
  return [...html.matchAll(/<button\b([^>]*)>[\s\S]*?<\/button\s*>/gi)].filter((match) => {
    const classes = /\bclass\s*=\s*(["'])(.*?)\1/i.exec(match[1]);
    return classes?.[2].split(/\s+/).includes("open-preferences");
  });
}

function hostPages(directory) {
  const pages = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      pages.push(...hostPages(entryPath));
    } else if (entry.isFile() && entry.name === "Main.html") {
      const html = readFileSync(entryPath, "utf8");
      if (preferenceButtons(html).length > 0) pages.push({ path: entryPath, html });
    }
  }
  return pages;
}

export function addUninstallControls(project) {
  const pages = hostPages(project);
  if (pages.length !== 1) {
    throw new Error(`Expected one Safari host page with a preferences button, found ${pages.length}`);
  }

  const page = pages[0];
  const buttons = preferenceButtons(page.html);
  if (buttons.length !== 1 || /\bid\s*=\s*["']uninstall-extension["']/i.test(page.html)) {
    throw new Error("Safari host page has unexpected preferences or uninstall controls");
  }

  const parent = path.dirname(path.dirname(page.path));
  const scriptPaths = [
    path.join(path.dirname(page.path), "Script.js"),
    path.join(parent, "Script.js"),
    path.join(parent, "Resources", "Script.js")
  ];
  const scripts = [...new Set(scriptPaths)]
    .filter((scriptPath) => {
      try {
        return /\bfunction\s+openPreferences\s*\(/.test(readFileSync(scriptPath, "utf8"));
      } catch (error) {
        if (error.code === "ENOENT") return false;
        throw error;
      }
    });
  if (scripts.length !== 1) {
    throw new Error(`Expected one Safari host preferences script, found ${scripts.length}`);
  }

  const stylesheetPath = path.join(path.dirname(scripts[0]), "Style.css");
  if (!existsSync(stylesheetPath)) {
    throw new Error(`Safari host stylesheet not found: ${stylesheetPath}`);
  }

  const preferencesCallback = /SFSafariApplication\.showPreferencesForExtension\(withIdentifier:\s*extensionBundleIdentifier\)\s*\{\s*error\s+in\s*DispatchQueue\.main\.async\s*\{\s*NSApplication\.shared\.terminate\(nil\)\s*\}\s*\}/;
  const controllerPaths = [
    path.join(parent, "ViewController.swift"),
    path.join(path.dirname(parent), "ViewController.swift")
  ];
  const controllers = controllerPaths
    .filter((controllerPath) => existsSync(controllerPath))
    .map((controllerPath) => ({ path: controllerPath, source: readFileSync(controllerPath, "utf8") }))
    .filter((controller) => preferencesCallback.test(controller.source));
  if (controllers.length !== 1) {
    throw new Error(`Expected one compatible Safari host controller, found ${controllers.length}`);
  }
  const controller = controllers[0];
  const controllerSource = controller.source.replace(preferencesCallback, `SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
            DispatchQueue.main.async {
                if let error = error {
                    let alert = NSAlert(error: error)
                    alert.informativeText += "\\nOpen Safari > Settings (or Preferences) > Extensions manually."
                    alert.runModal()
                } else {
                    NSApplication.shared.terminate(nil)
                }
            }
        }`);

  const stylesheet = readFileSync(stylesheetPath, "utf8") + `

body {
  gap: 12px;
  box-sizing: border-box;
  padding: 8px 0;
}

body > img {
  min-height: 0;
  object-fit: contain;
}

#uninstall-message {
  margin: 6px 0 0;
}
`;

  const button = buttons[0];
  const classes = /\bclass\s*=\s*(["'])(.*?)\1/i.exec(button[1])[2].split(/\s+/);
  const platformClass = classes.includes("platform-mac") ? ' class="platform-mac"' : "";
  const controls = `
    <div${platformClass}>
      <button id="uninstall-extension" type="button">Uninstall Extension in Safari</button>
      <div><small>In Safari, select this extension and click Uninstall.</small></div>
      <p id="uninstall-message" role="status" hidden></p>
    </div>`;
  const end = button.index + button[0].length;
  const html = page.html.slice(0, end) + controls + page.html.slice(end);
  const script = readFileSync(scripts[0], "utf8") + `

(() => {
  const button = document.getElementById("uninstall-extension");
  const message = document.getElementById("uninstall-message");
  button.addEventListener("click", async () => {
    message.hidden = false;
    message.textContent = "If Safari settings do not open, choose Safari > Settings (or Preferences) > Extensions.";
    try {
      await openPreferences();
    } catch (error) {
      message.textContent = "Could not open Safari settings: " + String(error) + ". Open Safari > Settings (or Preferences) > Extensions.";
    }
  });
})();
`;

  writeFileSync(page.path, html);
  writeFileSync(scripts[0], script);
  writeFileSync(stylesheetPath, stylesheet);
  writeFileSync(controller.path, controllerSource);
}
