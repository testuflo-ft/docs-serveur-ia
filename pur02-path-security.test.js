/**
 * PUR-02-E — Suite C: Path security with REAL normalizePath and isWithin
 *
 * Purpose
 * -------
 * Suite A (pur02-candidate.test.js) stubs normalizePath as an identity function
 * and isWithin as always-true. This suite exercises the REAL path functions from
 * AnythingLLM 1.19.0 to verify that dangerous inputs are explicitly rejected.
 *
 * Fix #1b (new in v4f)
 * --------------------
 * A pre-normalization check now rejects any folderName that contains path
 * separators (/ or \) or equals "." or "..". This prevents normalizePath from
 * silently transforming a traversal input (e.g. "../secret" → "secret") into a
 * valid-looking folder name that could trigger deletion of documents/secret.
 *
 * Impact on existing tests (C-01 to C-05, C-10):
 *   - Traversal inputs (C-01, C-02, C-10) no longer reach normalizePath or the
 *     filesystem — they throw FOLDER_NAME_INVALID (400) immediately.
 *   - ".." (C-03) and "/etc/passwd" (C-04) are caught by the same pre-check,
 *     both return FOLDER_NAME_INVALID instead of FOLDER_OUTSIDE_DOCUMENTS.
 *   - "." (C-05) is now caught by the pre-check → FOLDER_NAME_INVALID (400)
 *     instead of normalizePath throwing Error("Invalid path.") without a
 *     statusCode (which the HTTP handler mapped to 500). Open defect O-1 fixed.
 *
 * New tests (C-11 to C-14):
 *   These verify the core scenario raised by the independent counter-review:
 *   traversal inputs must be rejected even when the normalized target exists
 *   and is removable. No destructive operation (unlinkSync, rmdirSync,
 *   purgeVectorCache, removeDocuments) must be triggered.
 *
 * Strategy
 * --------
 * We load the v4e candidate with:
 *   - REAL normalizePath and isWithin (copied verbatim from files-index.js lines
 *     378-396 — the functions are pure path operations and have no external deps
 *     beyond Node's built-in `path` module).
 *   - Mock `fs` (jest.fn()) so no real filesystem is touched.
 *   - Mock Prisma and Document stubs.
 *
 * Source attribution
 * ------------------
 * normalizePath and isWithin are copied VERBATIM from:
 *   lab-extract/pur02-lab-extraction/files-index.js  (AnythingLLM 1.19.0)
 *   lines 378-396 — git-extracted from production source
 * They are reproduced here so this test suite runs without loading the full
 * files-index.js module (which has many server-side dependencies). Any change
 * to those functions in production must be reflected here.
 *
 * SAFETY
 * ------
 * - No production DB, filesystem, or network access.
 * - fs is fully mocked: no real file is read or deleted.
 */

"use strict";

const path   = require("path");
const Module = require("module");
const fs     = require("fs");

// ---------------------------------------------------------------------------
// REAL normalizePath — verbatim copy from files-index.js lines 389-396
// Source: lab-extract/pur02-lab-extraction/files-index.js (AnythingLLM 1.19.0)
// ---------------------------------------------------------------------------
function realNormalizePath(filepath = "") {
  const result = path
    .normalize(filepath.trim())
    .replace(/^(\.\.(\/|\\|$))+/, "")
    .trim();
  if (["..", ".", "/"].includes(result)) throw new Error("Invalid path.");
  return result;
}

// ---------------------------------------------------------------------------
// REAL isWithin — verbatim copy from files-index.js lines 378-387
// Source: lab-extract/pur02-lab-extraction/files-index.js (AnythingLLM 1.19.0)
// NOTE: does NOT follow/detect symlinks (wontfix in original code JSDoc).
// ---------------------------------------------------------------------------
function realIsWithin(outer, inner) {
  const resolvedOuter = path.resolve(outer);
  const resolvedInner = path.resolve(inner);
  const rel = path.relative(resolvedOuter, resolvedInner);
  if (rel === "") return false;
  return (
    !rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel)
  );
}

// ---------------------------------------------------------------------------
// loadCandidateModule — same injection mechanism as the other test suites
// ---------------------------------------------------------------------------
function loadCandidateModule(filePath, stubs) {
  const src = fs.readFileSync(filePath, "utf8");
  const wrapped = Module.wrap(src);
  // eslint-disable-next-line no-eval
  const script = eval(wrapped);
  const mod = { exports: {} };
  const fakeRequire = (id) => {
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
    try { return require(id); } catch (_) {
      throw new Error(
        `[loadCandidateModule] Unresolved require('${id}') — add a stub.`
      );
    }
  };
  fakeRequire.resolve = (id) => id;
  script(mod.exports, fakeRequire, mod, filePath, path.dirname(filePath));
  return mod.exports;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const CANDIDATE_V4E = path.resolve(
  __dirname,
  "candidate-purgeDocument-v4e.js"
);

// A fixed, fictional documents root used as the stub documentsPath.
const STUB_DOCS = "/stub/documents";

// ---------------------------------------------------------------------------
// Factory: build stubs with real path functions and controlled mock fs
// ---------------------------------------------------------------------------
function makeSecurityStubs(fsMock, workspacesMock = []) {
  return {
    ".": {
      // Real path functions from files-index.js — no stubbing
      normalizePath: realNormalizePath,
      isWithin: realIsWithin,
      documentsPath: STUB_DOCS,
      purgeVectorCache: jest.fn().mockResolvedValue(undefined),
      purgeSourceDocument: jest.fn().mockResolvedValue(undefined),
    },
    "../../models/documents": {
      Document: { removeDocuments: jest.fn().mockResolvedValue(undefined) },
    },
    "../../utils/prisma": {
      workspaces: { findMany: jest.fn().mockResolvedValue(workspacesMock) },
    },
    fs: fsMock,
    path: path,
  };
}

// ---------------------------------------------------------------------------
// Helper: build a minimal mock fs object; override individual fns per test
// ---------------------------------------------------------------------------
function makeFsMock(overrides = {}) {
  return {
    readdirSync: jest.fn().mockReturnValue([]),
    lstatSync: jest.fn(),
    existsSync: jest.fn().mockReturnValue(false),
    unlinkSync: jest.fn(),
    rmdirSync: jest.fn(),
    readFileSync: fs.readFileSync,  // needed by loadCandidateModule itself
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: build a mock fs where existingFolders exist and are plain directories
// Used for C-11 to C-14 to demonstrate that even when the target exists,
// traversal inputs are rejected before any filesystem or purge operation.
// ---------------------------------------------------------------------------
function makeExistingTargetFsMock(existingFolders) {
  const statDir = { isSymbolicLink: () => false, isDirectory: () => true };
  return makeFsMock({
    readdirSync: jest.fn((p, opts) => {
      if (p === STUB_DOCS) return existingFolders;
      if (opts && opts.withFileTypes) {
        return [{ name: "doc.json", isFile: () => true, isSymbolicLink: () => false }];
      }
      return ["doc.json"];
    }),
    lstatSync: jest.fn().mockReturnValue(statDir),
    existsSync: jest.fn((p) =>
      existingFolders.some((f) => p === path.resolve(STUB_DOCS, f))
    ),
  });
}

// ---------------------------------------------------------------------------
// Suite C
// ---------------------------------------------------------------------------
describe("Suite C — Path security with REAL normalizePath and isWithin", () => {

  // -------------------------------------------------------------------------
  // C-01: Pure traversal input "../secret"
  //
  // Fix #1b fires first: "../secret" contains "/" → FOLDER_NAME_INVALID (400).
  // normalizePath, isWithin, and all filesystem operations are never reached.
  //
  // Previously (before fix #1b): normalizePath would strip "../" → "secret",
  // then existsSync(documents/secret) → false → FOLDER_NOT_FOUND.
  // -------------------------------------------------------------------------
  test("C-01: '../secret' → fix #1b catches separator → FOLDER_NAME_INVALID, no fs access", async () => {
    const fsMock = makeFsMock();
    const { purgeFolder } = loadCandidateModule(
      CANDIDATE_V4E,
      makeSecurityStubs(fsMock)
    );

    await expect(purgeFolder("../secret")).rejects.toMatchObject({
      code: "FOLDER_NAME_INVALID",
      statusCode: 400,
    });
    // Fix fires before any filesystem operation.
    expect(fsMock.readdirSync).not.toHaveBeenCalled();
    expect(fsMock.existsSync).not.toHaveBeenCalled();
    expect(fsMock.unlinkSync).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // C-02: Deep traversal "../../etc/passwd"
  //
  // Fix #1b: "../../etc/passwd" contains "/" → FOLDER_NAME_INVALID (400).
  // Previously: normalizePath stripped "../../" → "etc/passwd",
  // isWithin → true, existsSync → false → FOLDER_NOT_FOUND.
  // -------------------------------------------------------------------------
  test("C-02: '../../etc/passwd' → fix #1b catches separator → FOLDER_NAME_INVALID", async () => {
    const fsMock = makeFsMock();
    const { purgeFolder } = loadCandidateModule(
      CANDIDATE_V4E,
      makeSecurityStubs(fsMock)
    );

    await expect(purgeFolder("../../etc/passwd")).rejects.toMatchObject({
      code: "FOLDER_NAME_INVALID",
      statusCode: 400,
    });
    expect(fsMock.readdirSync).not.toHaveBeenCalled();
    expect(fsMock.existsSync).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // C-03: Bare ".." (two dots, no slash)
  //
  // Fix #1b: trimmedFolderName === ".." → FOLDER_NAME_INVALID (400).
  // Previously: normalizePath("..")  → "" → path.resolve(STUB_DOCS, "") =
  // STUB_DOCS → isWithin(STUB_DOCS, STUB_DOCS) → false → FOLDER_OUTSIDE_DOCUMENTS.
  // -------------------------------------------------------------------------
  test("C-03: '..' → fix #1b catches '..' equality → FOLDER_NAME_INVALID", async () => {
    const fsMock = makeFsMock();
    const { purgeFolder } = loadCandidateModule(
      CANDIDATE_V4E,
      makeSecurityStubs(fsMock)
    );

    await expect(purgeFolder("..")).rejects.toMatchObject({
      code: "FOLDER_NAME_INVALID",
      statusCode: 400,
    });
    expect(fsMock.readdirSync).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // C-04: Absolute path "/etc/passwd"
  //
  // Fix #1b: "/etc/passwd" contains "/" → FOLDER_NAME_INVALID (400).
  // Previously: normalizePath passed it through (regex only strips leading "../"),
  // path.resolve(STUB_DOCS, "/etc/passwd") = "/etc/passwd" (absolute overrides),
  // isWithin(STUB_DOCS, "/etc/passwd") → false → FOLDER_OUTSIDE_DOCUMENTS.
  //
  // Note: the previous defense was correct (isWithin caught it), but the new
  // check is earlier and more explicit.
  // -------------------------------------------------------------------------
  test("C-04: '/etc/passwd' → fix #1b catches separator → FOLDER_NAME_INVALID", async () => {
    const fsMock = makeFsMock();
    const { purgeFolder } = loadCandidateModule(
      CANDIDATE_V4E,
      makeSecurityStubs(fsMock)
    );

    await expect(purgeFolder("/etc/passwd")).rejects.toMatchObject({
      code: "FOLDER_NAME_INVALID",
      statusCode: 400,
    });
    // Confirm: no filesystem access at all
    expect(fsMock.readdirSync).not.toHaveBeenCalled();
    expect(fsMock.existsSync).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // C-05: Single dot "." — O-1 fixed
  //
  // Fix #1b: trimmedFolderName === "." → FOLDER_NAME_INVALID (400).
  //
  // Previously (open defect O-1): normalizePath(".") → result = "." →
  // throws Error("Invalid path.") without a statusCode → HTTP handler mapped
  // to 500 / FOLDER_PURGE_FAILED. The fix resolves O-1: "." is now a
  // well-formed 400 with a machine-readable code.
  // -------------------------------------------------------------------------
  test("C-05: '.' → fix #1b catches '.' equality → FOLDER_NAME_INVALID 400 (O-1 fixed)", async () => {
    const fsMock = makeFsMock();
    const { purgeFolder } = loadCandidateModule(
      CANDIDATE_V4E,
      makeSecurityStubs(fsMock)
    );

    await expect(purgeFolder(".")).rejects.toMatchObject({
      code: "FOLDER_NAME_INVALID",
      statusCode: 400,
    });
    expect(fsMock.readdirSync).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // C-06: "custom-documents" — protected folder
  //
  // "custom-documents" passes fix #1b (no separators, not "." or "..").
  // normalizePath → "custom-documents" (unchanged).
  // readdirSync returns ["custom-documents"]; the map function skips it
  // (folder === "custom-documents" → null) so validRemovableSubFolders = [].
  // isWithin → true. existsSync → true.
  // validRemovableSubFolders.includes("custom-documents") → false.
  // → FOLDER_PROTECTED.
  // -------------------------------------------------------------------------
  test("C-06: 'custom-documents' → validRemovableSubFolders excludes it → FOLDER_PROTECTED", async () => {
    const fsMock = makeFsMock({
      readdirSync: jest.fn((p) => {
        if (p === STUB_DOCS) return ["custom-documents"];
        return [];
      }),
      existsSync: jest.fn().mockReturnValue(true),
    });
    const { purgeFolder } = loadCandidateModule(
      CANDIDATE_V4E,
      makeSecurityStubs(fsMock)
    );

    await expect(purgeFolder("custom-documents")).rejects.toMatchObject({
      code: "FOLDER_PROTECTED",
      statusCode: 403,
    });
    // lstatSync must NOT have been called for custom-documents
    // (the map returns null before reaching lstatSync)
    expect(fsMock.lstatSync).not.toHaveBeenCalledWith(
      path.resolve(STUB_DOCS, "custom-documents")
    );
  });

  // -------------------------------------------------------------------------
  // C-07: "valid-folder" — control case (happy path with real path functions)
  //
  // normalizePath → "valid-folder" (unchanged).
  // readdirSync(STUB_DOCS) → ["valid-folder"].
  // lstatSync → { isSymbolicLink: false, isDirectory: true }.
  // isWithin → true. existsSync → true.
  // validRemovableSubFolders.includes("valid-folder") → true.
  // readdirSync("valid-folder") → [] (empty folder).
  // No workspaces → no removeDocuments calls.
  // rmdirSync called.
  // → { success: true }.
  // -------------------------------------------------------------------------
  test("C-07: 'valid-folder' → control case → success with real path functions", async () => {
    const folderPath = path.resolve(STUB_DOCS, "valid-folder");
    const fsMock = makeFsMock({
      readdirSync: jest.fn((p, opts) => {
        if (p === STUB_DOCS) return ["valid-folder"];
        if (p === folderPath) return []; // empty folder
        return [];
      }),
      lstatSync: jest.fn().mockReturnValue({
        isSymbolicLink: () => false,
        isDirectory: () => true,
      }),
      existsSync: jest.fn().mockReturnValue(true),
      rmdirSync: jest.fn(),
    });
    const { purgeFolder } = loadCandidateModule(
      CANDIDATE_V4E,
      makeSecurityStubs(fsMock, []) // no workspaces
    );

    const result = await purgeFolder("valid-folder");
    expect(result).toMatchObject({ success: true });
    expect(fsMock.rmdirSync).toHaveBeenCalledWith(folderPath);
  });

  // -------------------------------------------------------------------------
  // C-08: Null input (name validation — independent of path functions)
  //
  // The fix#1 (FOLDER_NAME_REQUIRED) guard fires before fix#1b or normalizePath.
  // -------------------------------------------------------------------------
  test("C-08: null → FOLDER_NAME_REQUIRED (before path functions are invoked)", async () => {
    const fsMock = makeFsMock();
    const { purgeFolder } = loadCandidateModule(
      CANDIDATE_V4E,
      makeSecurityStubs(fsMock)
    );

    await expect(purgeFolder(null)).rejects.toMatchObject({
      code: "FOLDER_NAME_REQUIRED",
      statusCode: 400,
    });
    // normalizePath must not have been called
    expect(fsMock.readdirSync).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // C-09: Symlink at top level excluded from allowlist
  //
  // "link-folder" passes fix #1b. readdirSync returns ["link-folder"].
  // lstatSync → { isSymbolicLink: true, isDirectory: false } → excluded.
  // isWithin → true. existsSync → true.
  // validRemovableSubFolders.includes("link-folder") → false.
  // → FOLDER_PROTECTED.
  // -------------------------------------------------------------------------
  test("C-09: top-level symlink → excluded from allowlist → FOLDER_PROTECTED", async () => {
    const fsMock = makeFsMock({
      readdirSync: jest.fn((p) => {
        if (p === STUB_DOCS) return ["link-folder"];
        return [];
      }),
      lstatSync: jest.fn().mockReturnValue({
        isSymbolicLink: () => true,
        isDirectory: () => false,
      }),
      existsSync: jest.fn().mockReturnValue(true),
    });
    const { purgeFolder } = loadCandidateModule(
      CANDIDATE_V4E,
      makeSecurityStubs(fsMock)
    );

    await expect(purgeFolder("link-folder")).rejects.toMatchObject({
      code: "FOLDER_PROTECTED",
      statusCode: 403,
    });
  });

  // -------------------------------------------------------------------------
  // C-10: Windows-style separator "..\\secret" (backslash traversal)
  //
  // Fix #1b: "..\\secret" contains "\" (backslash) → FOLDER_NAME_INVALID (400).
  // Previously: normalizePath stripped "..\\" via regex → "secret",
  // isWithin → true, existsSync → false → FOLDER_NOT_FOUND.
  //
  // Note: on POSIX, "\" is not a path separator; path.normalize leaves it
  // in place. The candidate's normalizePath regex handles it, but fix #1b
  // intercepts it first by checking /[/\\]/ against the raw input.
  // -------------------------------------------------------------------------
  test("C-10: '..\\\\secret' → fix #1b catches backslash → FOLDER_NAME_INVALID", async () => {
    const fsMock = makeFsMock();
    const { purgeFolder } = loadCandidateModule(
      CANDIDATE_V4E,
      makeSecurityStubs(fsMock)
    );

    // "..\\secret" in JS source = "..\secret" (single backslash)
    await expect(purgeFolder("..\\secret")).rejects.toMatchObject({
      code: "FOLDER_NAME_INVALID",
      statusCode: 400,
    });
    expect(fsMock.readdirSync).not.toHaveBeenCalled();
  });

  // =========================================================================
  // C-11 to C-14: Traversal to existing, removable targets
  //
  // These are the tests requested by the independent counter-review (2026-11-04).
  // Each test sets up a filesystem mock where the NORMALIZED form of the
  // traversal input (e.g. "secret") exists in documents/ and is listed as
  // removable. The fix must reject the traversal input BEFORE any operation
  // is triggered, even though the target exists.
  // =========================================================================

  // -------------------------------------------------------------------------
  // C-11: "../secret" with documents/secret existing and removable
  //
  // Core scenario: an attacker sends "../secret" hoping to trigger deletion of
  // documents/secret (e.g. because they know the folder name). Without fix #1b,
  // normalizePath("../secret") → "secret" and the purge would proceed.
  // With fix #1b: rejected before normalizePath — no operation triggered.
  // -------------------------------------------------------------------------
  test("C-11: '../secret' with documents/secret existing → FOLDER_NAME_INVALID, no purge ops triggered", async () => {
    const fsMock = makeExistingTargetFsMock(["secret"]);
    const stubs = makeSecurityStubs(fsMock);
    const { purgeFolder } = loadCandidateModule(CANDIDATE_V4E, stubs);

    await expect(purgeFolder("../secret")).rejects.toMatchObject({
      code: "FOLDER_NAME_INVALID",
      statusCode: 400,
    });

    // Fix fires before any filesystem or purge operation.
    expect(fsMock.readdirSync).not.toHaveBeenCalled();
    expect(fsMock.existsSync).not.toHaveBeenCalled();
    expect(fsMock.unlinkSync).not.toHaveBeenCalled();
    expect(fsMock.rmdirSync).not.toHaveBeenCalled();
    expect(stubs["."].purgeVectorCache).not.toHaveBeenCalled();
    expect(stubs["../../models/documents"].Document.removeDocuments).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // C-12: "../../secret" with documents/secret existing and removable
  //
  // Double traversal variant — same scenario as C-11, deeper path expression.
  // -------------------------------------------------------------------------
  test("C-12: '../../secret' with documents/secret existing → FOLDER_NAME_INVALID, no purge ops triggered", async () => {
    const fsMock = makeExistingTargetFsMock(["secret"]);
    const stubs = makeSecurityStubs(fsMock);
    const { purgeFolder } = loadCandidateModule(CANDIDATE_V4E, stubs);

    await expect(purgeFolder("../../secret")).rejects.toMatchObject({
      code: "FOLDER_NAME_INVALID",
      statusCode: 400,
    });

    expect(fsMock.readdirSync).not.toHaveBeenCalled();
    expect(fsMock.unlinkSync).not.toHaveBeenCalled();
    expect(fsMock.rmdirSync).not.toHaveBeenCalled();
    expect(stubs["."].purgeVectorCache).not.toHaveBeenCalled();
    expect(stubs["../../models/documents"].Document.removeDocuments).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // C-13: "..\\secret" (Windows backslash) with documents/secret existing
  //
  // Backslash traversal variant with the target present. On POSIX, path.normalize
  // does not treat "\" as a separator, but the normalizePath regex would strip
  // "..\\" before fix #1b could matter. With fix #1b, the backslash is caught
  // immediately — the target's existence is irrelevant.
  // -------------------------------------------------------------------------
  test("C-13: '..\\\\secret' with documents/secret existing → FOLDER_NAME_INVALID, no purge ops triggered", async () => {
    const fsMock = makeExistingTargetFsMock(["secret"]);
    const stubs = makeSecurityStubs(fsMock);
    const { purgeFolder } = loadCandidateModule(CANDIDATE_V4E, stubs);

    // "..\\secret" in JS source = "..\secret" (single backslash)
    await expect(purgeFolder("..\\secret")).rejects.toMatchObject({
      code: "FOLDER_NAME_INVALID",
      statusCode: 400,
    });

    expect(fsMock.readdirSync).not.toHaveBeenCalled();
    expect(fsMock.unlinkSync).not.toHaveBeenCalled();
    expect(fsMock.rmdirSync).not.toHaveBeenCalled();
    expect(stubs["."].purgeVectorCache).not.toHaveBeenCalled();
    expect(stubs["../../models/documents"].Document.removeDocuments).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // C-14: Absolute path "/stub/documents/secret" with documents/secret existing
  //
  // If an attacker sends the full absolute path of a removable folder, fix #1b
  // catches the "/" separator before normalizePath is reached. The existence of
  // the target on the mock filesystem is irrelevant — no operation is triggered.
  // -------------------------------------------------------------------------
  test("C-14: absolute path '/stub/documents/secret' with target existing → FOLDER_NAME_INVALID, no purge ops", async () => {
    const fsMock = makeExistingTargetFsMock(["secret"]);
    const stubs = makeSecurityStubs(fsMock);
    const { purgeFolder } = loadCandidateModule(CANDIDATE_V4E, stubs);

    await expect(purgeFolder("/stub/documents/secret")).rejects.toMatchObject({
      code: "FOLDER_NAME_INVALID",
      statusCode: 400,
    });

    expect(fsMock.readdirSync).not.toHaveBeenCalled();
    expect(fsMock.unlinkSync).not.toHaveBeenCalled();
    expect(fsMock.rmdirSync).not.toHaveBeenCalled();
    expect(stubs["."].purgeVectorCache).not.toHaveBeenCalled();
    expect(stubs["../../models/documents"].Document.removeDocuments).not.toHaveBeenCalled();
  });

});
