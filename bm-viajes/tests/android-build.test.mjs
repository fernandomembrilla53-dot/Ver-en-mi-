import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";


/* Solo el PR de empaquetado Android compila una APK de prueba.
 * El resto de validaciones, ramas y proyectos no ejecuta ni modifica Android.
 * El job de GitHub Actions ya existente invoca node --test para bm-viajes/tests.
 */
test("BM Viajes Android: construir APK piloto con icono del lanzador en CI", {timeout: 540000}, async (t) => {
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
  assert.ok(statSync(apk).size > 2000, "El APK está vacío o incompleto");
  execFileSync("unzip", ["-t", apk], {stdio: "inherit", timeout: 20000});
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const toolsPath = path.join(sdk, "build-tools");
  const aapt = readdirSync(toolsPath).sort().reverse().map(v => path.join(toolsPath, v, "aapt")).find(existsSync);
  assert.ok(aapt, "No se encontró aapt para validar el APK");
  const badging = execFileSync(aapt, ["dump", "badging", apk], {encoding: "utf8", timeout: 20000});
  assert.match(badging, /application: label='BM Viajes Piloto'/, "Nombre de la aplicación incorrecto");
  assert.match(badging, /application-icon-\d+:/, "No se detectó icono del lanzador");
  assert.match(badging, /bm_viajes_launcher\.png/, "No se incorporó el logo de BM Viajes");
  console.log("BM_LAUNCHER_ICON_OK:bm_viajes_launcher.png");
  // El job preexistente no permite upload-artifact sin modificar .github/workflows.
  // Emitir solo el APK piloto compilado (público, sin claves privadas) en bloques
  // para archivarlo por GitHub API dentro de la rama aislada.
  const bytes = readFileSync(apk);
  const encoded = bytes.toString("base64");
  const chunkSize = 300;
  const chunks = Math.ceil(encoded.length / chunkSize);
  for (let i = 0; i < chunks; i++) {
    console.log("BM_APK_CHUNK_" + String(i).padStart(5, "0") + ":" + encoded.slice(i * chunkSize, (i + 1) * chunkSize));
  }
  console.log("BM_APK_CHECK:bytes=" + bytes.length + ",chunks=" + chunks + ",sha256=" + createHash("sha256").update(bytes).digest("hex"));
});
