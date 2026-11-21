import { execFileSync } from "node:child_process";
import {
  closeSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addUninstallControls } from "../safari/host-ui.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const handler = path.join(root, "safari/SafariWebExtensionHandler.swift");
const mode = process.argv[2];

if (process.platform !== "darwin" || !["test", "build"].includes(mode)) {
  console.error("Usage on macOS: node scripts/safari.js <test|build>");
  process.exit(1);
}

const work = mkdtempSync(path.join(tmpdir(), "teams-transcript-safari-"));

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit", cwd: root });
}

try {
  if (mode === "test") {
    const binary = path.join(work, "native-tests");
    run("xcrun", [
      "swiftc", "-parse-as-library", handler, path.join(root, "scripts/test-safari-native.swift"), "-o", binary
    ]);
    run(binary, []);
  } else {
    const extension = path.join(root, "extension");
    const manifest = JSON.parse(readFileSync(path.join(extension, "manifest.json"), "utf8"));
    const packageVersion = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
    if (manifest.version !== packageVersion || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
      throw new Error("Extension and package versions must match and use x.y.z format");
    }

    const output = path.join(root, "dist", `teams-transcript-auto-downloader-safari-v${manifest.version}.zip`);
    if (existsSync(output)) throw new Error(`Safari archive already exists: ${output}`);

    const resources = path.join(work, "resources");
    cpSync(extension, resources, {
      recursive: true,
      filter: (source) => {
        const name = path.basename(source);
        return name !== ".DS_Store" && name !== "__MACOSX" && !name.startsWith("._");
      }
    });
    manifest.background = { page: "src/background/background.html" };
    manifest.permissions = [...new Set([...manifest.permissions.filter((permission) => permission !== "downloads"), "nativeMessaging"])];
    manifest.host_permissions = [...new Set([...manifest.host_permissions, "https://teams.microsoft.com/*"])];
    manifest.browser_specific_settings = {
      ...manifest.browser_specific_settings,
      safari: { ...manifest.browser_specific_settings?.safari, strict_min_version: "16.4" }
    };
    writeFileSync(path.join(resources, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(
      path.join(resources, "src/background/background.html"),
      '<!doctype html>\n<meta charset="UTF-8">\n<script type="module" src="service-worker.js"></script>\n'
    );

    const name = "TeamsTranscriptDownloader";
    const projectLocation = path.join(work, "project");
    run("xcrun", [
      "safari-web-extension-converter", resources, "--no-prompt", "--no-open", "--macos-only",
      "--project-location", projectLocation, "--app-name", name,
      "--bundle-identifier", "dev.local.TeamsTranscriptDownloader"
    ]);
    const project = path.join(projectLocation, name);
    copyFileSync(handler, path.join(project, `${name} Extension`, "SafariWebExtensionHandler.swift"));
    addUninstallControls(project);
    const derivedData = path.join(work, "derived");
    run("xcodebuild", [
      "-quiet", "-project", path.join(project, `${name}.xcodeproj`), "-scheme", name,
      "-configuration", "Debug", "-destination", "generic/platform=macOS", "-derivedDataPath", derivedData,
      "ARCHS=arm64 x86_64", "ONLY_ACTIVE_ARCH=NO", "CODE_SIGN_IDENTITY=-", "CODE_SIGNING_REQUIRED=YES",
      "CODE_SIGNING_ALLOWED=YES", "DEVELOPMENT_TEAM=", "ENABLE_FILE_ACCESS_DOWNLOADS_FOLDER=readwrite",
      "MACOSX_DEPLOYMENT_TARGET=12.0", `MARKETING_VERSION=${manifest.version}`, "build"
    ]);

    const app = path.join(derivedData, "Build/Products/Debug", `${name}.app`);
    run("codesign", ["--verify", "--deep", "--strict", app]);
    mkdirSync(path.dirname(output), { recursive: true });
    closeSync(openSync(output, "wx"));
    try {
      run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, output]);
    } catch (error) {
      unlinkSync(output);
      throw error;
    }
    console.log(`Created ${output}`);
  }
} catch (error) {
  console.error(`Safari ${mode} failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
