import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

/* Solo el PR de empaquetado Android compila una APK de prueba.
 * El resto de validaciones, ramas y proyectos no ejecuta ni modifica Android.
 * El job de GitHub Actions ya existente invoca node --test para bm-viajes/tests.
 */
test("BM Viajes Android: construir APK piloto y adjuntar artefacto en CI", {timeout: 540000}, async (t) => {
  const branch = "bm-viajes-android-pilot-apk-20261120";
  if (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_HEAD_REF !== branch && process.env.GITHUB_REF !== "refs/heads/" + branch) {
    t.skip("Compilación habilitada únicamente en el PR aislado de Android");
    return;
  }
  assert.ok(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT, "Falta Android SDK en el runner");
  const project = path.resolve("bm-viajes/android");
  const apk = path.join(project, "app/build/outputs/apk/debug/app-debug.apk");
  execFileSync("gradle", ["--no-daemon", "--console=plain", ":app:assembleDebug"], {
    cwd: project, timeout: 420000, stdio: "inherit",
    env: { ...process.env, GRADLE_OPTS: "-Dorg.gradle.daemon=false" }
  });
  assert.ok(existsSync(apk), "Gradle no generó el APK");
  assert.ok(statSync(apk).size > 50000, "El APK está vacío o incompleto");
  const tooling = mkdtempSync(path.join(tmpdir(), "bm-viajes-artifact-"));
  execFileSync("npm", ["install", "--prefix", tooling, "--no-save", "--ignore-scripts", "--no-audit", "--no-fund", "@actions/artifact@2"], {timeout: 120000, stdio: "inherit"});
  const require = createRequire(path.join(tooling, "package.json"));
  const artifact = require("@actions/artifact");
  const client = typeof artifact.create === "function" ? artifact.create() : artifact;
  const upload = await client.uploadArtifact("bm-viajes-piloto-android-apk", [apk], path.dirname(apk), {retentionDays: 7});
  assert.ok(upload, "La subida del artefacto no devolvió resultado");
  console.log("APK piloto generado y adjuntado al workflow: " + path.basename(apk) + " (" + statSync(apk).size + " bytes)");
});
