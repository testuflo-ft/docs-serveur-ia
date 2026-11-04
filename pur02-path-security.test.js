/**
 * PUR-02-E — Suite C: Path security with REAL normalizePath and isWithin
 *
 * Purpose
 * -------
 * Suite A (pur02-candidate.test.js) stubs normalizePath as an identity function
 * and isWithin as always-true. That means the 22 unit tests do NOT exercise real
 * path-traversal blocking. This suite repairs that gap.
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
 * We then call purgeFolder() directly with inputs that would be dangerous if the
 * path layer were broken, and verify the correct typed error is thrown.
 *
 * What is NOT tested here
 * -----------------------
 * - Database/vector-cache teardown (covered by Suite A scenarios 6-16)
 * - HTTP handler error propagation (covered by Suite B)
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
// Suite C
// ---------------------------------------------------------------------------
describe("Suite C — Path security with REAL normalizePath and isWithin", () => {

  // -------------------------------------------------------------------------
  // C-01: Pure traversal input "../secret"
  //
  // normalizePath strips the leading "../" → "secret".
  // isWithin(STUB_DOCS, STUB_DOCS/secret) → TRUE (it IS inside).
  // existsSync → false → FOLDER_NOT_FOUND (not FOLDER_OUTSIDE_DOCUMENTS).
  //
  // This confirms the traversal is neutralised by normalizePath BEFORE isWithin
  // even runs. The result is a 404, not a path escape.
  // -------------------------------------------------------------------------
  test("C-01: '../secret' → normalizePath strips traversal → FOLDER_NOT_FOUND (not escape)", async () => {
    const fsMock = makeFsMock({
      readdirSync: jest.fn().mockReturnValue([]),   // empty documents root
      existsSync: jest.fn().mockReturnValue(false), // "secret" does not exist
    });
    const { purgeFolder } = loadCandidateModule(
      CANDIDATE_V4E,
      makeSecurityStubs(fsMock)
    );

    await expect(purgeFolder("../secret")).rejects.toMatchObject({
      code: "FOLDER_NOT_FOUND",
      statusCode: 404,
    });
    // Verify normalizePath stripped the traversal: readdirSync is called on the
    // FIXED documents root, not on any attacker-controlled path.
    expect(fsMock.readdirSync).toHaveBeenCalledWith(STUB_DOCS);
    expect(fsMock.readdirSync).not.toHaveBeenCalledWith(
      expect.stringContaining("..")
    );
  });

  // -------------------------------------------------------------------------
  // C-02: Deep traversal "../../etc/passwd"
  //
  // normalizePath strips all leading "../" sequences → "etc/passwd".
  // isWithin(STUB_DOCS, STUB_DOCS/etc/passwd) → TRUE (still inside docs root).
  // existsSync → false → FOLDER_NOT_FOUND.
  // -------------------------------------------------------------------------
  test("C-02: '../../etc/passwd' → normalizePath strips traversal → FOLDER_NOT_FOUND", async () => {
    const fsMock = makeFsMock();
    const { purgeFolder } = loadCandidateModule(
      CANDIDATE_V4E,
      makeSecurityStubs(fsMock)
    );

    await expect(purgeFolder("../../etc/passwd")).rejects.toMatchObject({
      code: "FOLDER_NOT_FOUND",
      statusCode: 404,
    });
  });

  // -------------------------------------------------------------------------
  // C-03: Bare ".." (two dots, no slash)
  //
  // normalizePath: path.normalize("..") = ".." → regex /^(\.\.(\/|\\|$))+/
  // matches ".." followed by $ (end of string) → strips entirely → result = "".
  // "" is not in ["..", ".", "/"] → normalizePath returns "".
  //
  // path.resolve(STUB_DOCS, "") = STUB_DOCS itself.
  // isWithin(STUB_DOCS, STUB_DOCS) → rel = "" → returns FALSE.
  // → FOLDER_OUTSIDE_DOCUMENTS.
  //
  // Edge-case: normalizePath does NOT throw for ".." (it returns ""). The
  // defence relies on isWithin catching the resulting same-path resolve.
  // -------------------------------------------------------------------------
  test("C-03: '..' → normalizePath returns '' → isWithin(docs,docs)=false → FOLDER_OUTSIDE_DOCUMENTS", async () => {
    const fsMock = makeFsMock();
    const { purgeFolder } = loadCandidateModule(
      CANDIDATE_V4E,
      makeSecurityStubs(fsMock)
    );

    await expect(purgeFolder("..")).rejects.toMatchObject({
      code: "FOLDER_OUTSIDE_DOCUMENTS",
      statusCode: 400,
    });
  });

  // -------------------------------------------------------------------------
  // C-04: Absolute path "/etc/passwd"
  //
  // normalizePath: path.normalize("/etc/passwd") = "/etc/passwd".
  // The regex only strips leading "../", not leading "/". Returns "/etc/passwd".
  //
  // path.resolve(STUB_DOCS, "/etc/passwd") = "/etc/passwd" (absolute overrides).
  // isWithin(STUB_DOCS, "/etc/passwd"):
  //   rel = path.relative(STUB_DOCS, "/etc/passwd") = "../../etc/passwd"
  //   rel.startsWith("../") = true → returns FALSE.
  // → FOLDER_OUTSIDE_DOCUMENTS.
  // -------------------------------------------------------------------------
  test("C-04: '/etc/passwd' → normalizePath passes through → isWithin catches → FOLDER_OUTSIDE_DOCUMENTS", async () => {
    const fsMock = makeFsMock();
    const { purgeFolder } = loadCandidateModule(
      CANDIDATE_V4E,
      makeSecurityStubs(fsMock)
    );

    await expect(purgeFolder("/etc/passwd")).rejects.toMatchObject({
      code: "FOLDER_OUTSIDE_DOCUMENTS",
      statusCode: 400,
    });
    // Confirm: no access attempt on /etc/passwd or anything outside STUB_DOCS
    expect(fsMock.existsSync).not.toHaveBeenCalledWith("/etc/passwd");
    expect(fsMock.existsSync).not.toHaveBeenCalledWith(
      expect.stringContaining("/etc")
    );
  });

  // -------------------------------------------------------------------------
  // C-05: Single dot "."
  //
  // normalizePath: path.normalize(".") = "." → not stripped by regex →
  // result = "." → "." IS in ["..", ".", "/"] → throws Error("Invalid path.").
  //
  // The error has no statusCode → handler maps to HTTP 500 / FOLDER_PURGE_FAILED.
  // This is a known UX gap (should be 400) but is NOT a security issue.
  // -------------------------------------------------------------------------
  test("C-05: '.' → normalizePath throws 'Invalid path.' (no statusCode → HTTP 500)", async () => {
    const fsMock = makeFsMock();
    const { purgeFolder } = loadCandidateModule(
      CANDIDATE_V4E,
      makeSecurityStubs(fsMock)
    );

    const err = await purgeFolder(".").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Invalid path.");
    // No statusCode → HTTP handler will use 500 (FOLDER_PURGE_FAILED)
    expect(err.statusCode).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // C-06: "custom-documents" — protected folder
  //
  // normalizePath → "custom-documents" (unchanged).
  // readdirSync returns ["custom-documents"]; the map function skips it
  // (folder === "custom-documents" → null) so validRemovableSubFolders = [].
  // isWithin → true (it IS inside documentsPath).
  // existsSync → true.
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
  // isWithin → true.
  // existsSync → true.
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
  // The fix#1 guard fires before normalizePath is ever called.
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
  // readdirSync(STUB_DOCS) → ["link-folder"].
  // lstatSync → { isSymbolicLink: true, isDirectory: false } → excluded.
  // isWithin → true.
  // existsSync → true.
  // validRemovableSubFolders.includes("link-folder") → false.
  // → FOLDER_PROTECTED.
  // -------------------------------------------------------------------------
  test("C-09: top-level symlink → excluded from allowlist → FOLDER_PROTECTED", async () => {
    const linkPath = path.resolve(STUB_DOCS, "link-folder");
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
  // normalizePath: path.normalize("..\\secret") on POSIX = "..\\" (unchanged?).
  // Actually on Node POSIX, path.normalize("..\\secret") = "..\\secret"
  // (backslash is not a separator on POSIX). The regex looks for
  // /^(\.\.(\/|\\|$))+/ which DOES match "..\\" at the start.
  // → strips "..\\" → result = "secret".
  // isWithin → true. existsSync → false. → FOLDER_NOT_FOUND.
  //
  // This confirms the regex handles backslash-prefixed traversal on POSIX too.
  // -------------------------------------------------------------------------
  test("C-10: '..\\\\secret' → regex strips backslash traversal → FOLDER_NOT_FOUND", async () => {
    const fsMock = makeFsMock();
    const { purgeFolder } = loadCandidateModule(
      CANDIDATE_V4E,
      makeSecurityStubs(fsMock)
    );

    // "..\\secret" — backslash traversal attempt
    await expect(purgeFolder("..\\secret")).rejects.toMatchObject({
      code: "FOLDER_NOT_FOUND",
      statusCode: 404,
    });
  });

});
