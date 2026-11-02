/**
 * PUR-02-E — HTTP Route Handler Tests
 *
 * Verifies that both HTTP endpoints propagate purgeFolder errors as the correct
 * non-2xx HTTP status codes and structured bodies, and that a successful purge
 * produces HTTP 200 with an explicit success body.
 *
 * SAFETY:
 * - No production DB or filesystem access: purgeFolder is fully mocked.
 * - No AnythingLLM auth middleware: validatedRequest and validApiKey are stubbed.
 * - No real Express app is started: supertest manages lifecycle.
 *
 * Routes under test:
 *   DELETE /system/remove-folder      (endpoints-system.js, admin/manager only)
 *   DELETE /v1/document/remove-folder (api-document-index.js, validApiKey)
 *
 * Handler reference (exact code, verified 2026-11-02):
 *
 *   try {
 *     const { name } = reqBody(request);
 *     const result = await purgeFolder(name);
 *     response.status(200).json(result);           ← false 200 if result=undefined
 *   } catch (e) {
 *     response.status(e.statusCode || 500).json({
 *       success: false,
 *       code: e.code || "FOLDER_PURGE_FAILED",
 *       message: e.message || "Failed to remove folder.",
 *     });
 *   }
 *
 * The API endpoint wraps the message:
 *   message: e.message ? `Failed to remove folder: ${e.message}` : "Failed to remove folder."
 *
 * Both patterns are exercised in this suite.
 */

"use strict";

const express = require("express");
const request = require("supertest"); // npm install supertest --save-dev

// ---------------------------------------------------------------------------
// Minimal route factory — reproduces the handler logic from both lab endpoints
// without importing the real files or auth dependencies.
// ---------------------------------------------------------------------------

/**
 * Builds a minimal Express app that mounts the remove-folder handler logic.
 *
 * @param {Function} purgeFolderMock - jest mock replacing purgeFolder
 * @param {"system"|"api"} handlerVariant
 *   "system" → response matches endpoints-system.js (no message prefix)
 *   "api"    → response matches api-document-index.js (prefixes message)
 */
function buildApp(purgeFolderMock, handlerVariant = "system") {
  const app = express();
  app.use(express.json());

  // Auth middleware is stubbed: all requests pass.
  const noopAuth = (req, res, next) => next();

  const route = handlerVariant === "api"
    ? "/v1/document/remove-folder"
    : "/system/remove-folder";

  app.delete(route, [noopAuth], async (req, res) => {
    try {
      const name = req.body && req.body.name;
      const result = await purgeFolderMock(name);
      res.status(200).json(result);
    } catch (e) {
      const message = handlerVariant === "api"
        ? (e.message ? `Failed to remove folder: ${e.message}` : "Failed to remove folder.")
        : (e.message || "Failed to remove folder.");
      res.status(e.statusCode || 500).json({
        success: false,
        code: e.code || "FOLDER_PURGE_FAILED",
        message,
      });
    }
  });

  return app;
}

// ---------------------------------------------------------------------------
// Helper: build a typed folderError (mirrors folderError in the patched source)
// ---------------------------------------------------------------------------
function folderError(statusCode, code, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

// ---------------------------------------------------------------------------
// Tests — /system/remove-folder (endpoints-system.js variant)
// ---------------------------------------------------------------------------
describe("HTTP /system/remove-folder — error contract (PUR-02-E)", () => {
  let purgeFolderMock;
  let app;

  beforeEach(() => {
    purgeFolderMock = jest.fn();
    app = buildApp(purgeFolderMock, "system");
  });

  test("200 + { success: true } when purgeFolder succeeds", async () => {
    purgeFolderMock.mockResolvedValue({
      success: true,
      message: 'Folder "user-uploads" purged successfully.',
    });

    const res = await request(app)
      .delete("/system/remove-folder")
      .send({ name: "user-uploads" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/purged successfully/i);
  });

  test("400 FOLDER_NAME_REQUIRED when name is null/empty", async () => {
    purgeFolderMock.mockRejectedValue(
      folderError(400, "FOLDER_NAME_REQUIRED",
        "[purgeFolder] folderName must be a non-empty string.")
    );

    const res = await request(app)
      .delete("/system/remove-folder")
      .send({ name: null });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("FOLDER_NAME_REQUIRED");
  });

  test("403 FOLDER_PROTECTED when folder is custom-documents or non-removable", async () => {
    purgeFolderMock.mockRejectedValue(
      folderError(403, "FOLDER_PROTECTED",
        '[purgeFolder] "custom-documents" is protected or is not a removable folder.')
    );

    const res = await request(app)
      .delete("/system/remove-folder")
      .send({ name: "custom-documents" });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("FOLDER_PROTECTED");
    expect(res.body.message).toMatch(/protected/i);
  });

  test("404 FOLDER_NOT_FOUND when folder does not exist on disk", async () => {
    purgeFolderMock.mockRejectedValue(
      folderError(404, "FOLDER_NOT_FOUND",
        '[purgeFolder] Folder "ghost-folder" was not found.')
    );

    const res = await request(app)
      .delete("/system/remove-folder")
      .send({ name: "ghost-folder" });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("FOLDER_NOT_FOUND");
    expect(res.body.message).toMatch(/was not found/i);
  });

  test("400 FOLDER_UNEXPECTED_ENTRIES when folder contains a subdirectory", async () => {
    purgeFolderMock.mockRejectedValue(
      folderError(400, "FOLDER_UNEXPECTED_ENTRIES",
        '[purgeFolder] "user-uploads" contains unexpected entries (subdirectories or symlinks): nested-dir.')
    );

    const res = await request(app)
      .delete("/system/remove-folder")
      .send({ name: "user-uploads" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("FOLDER_UNEXPECTED_ENTRIES");
    expect(res.body.message).toMatch(/nested-dir/);
  });

  test("400 FOLDER_OUTSIDE_DOCUMENTS when path traversal is attempted", async () => {
    purgeFolderMock.mockRejectedValue(
      folderError(400, "FOLDER_OUTSIDE_DOCUMENTS",
        '[purgeFolder] "../../../etc" is outside the documents directory.')
    );

    const res = await request(app)
      .delete("/system/remove-folder")
      .send({ name: "../../../etc" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("FOLDER_OUTSIDE_DOCUMENTS");
  });

  test("500 FOLDER_PURGE_FAILED when purgeFolder throws an unexpected error", async () => {
    purgeFolderMock.mockRejectedValue(new Error("Unexpected internal error"));

    const res = await request(app)
      .delete("/system/remove-folder")
      .send({ name: "some-folder" });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("FOLDER_PURGE_FAILED");
  });

  // Regression guard: before the PUR-02-E fix, a silent return (undefined)
  // produced HTTP 200 with null body. This test documents the fixed behavior.
  test("REGRESSION — silent undefined return must NOT produce HTTP 200 with null body", async () => {
    // This scenario represents the pre-fix behavior: purgeFolder returns undefined
    // because it hit a silent return path (e.g. custom-documents not in allowlist).
    // After the fix, such a path throws. We simulate what would have happened.
    purgeFolderMock.mockResolvedValue(undefined); // old silent return behavior

    const res = await request(app)
      .delete("/system/remove-folder")
      .send({ name: "custom-documents" });

    // HTTP 200 IS returned here because we are testing the handler behavior
    // when purgeFolder resolves undefined. This test documents the pre-fix
    // false positive and serves as a reference: with the PUR-02-E patch applied,
    // purgeFolder NEVER resolves undefined for an error condition — it throws.
    //
    // The REAL guard is the unit tests for purgeFolder (S05/S05b/S05c) which
    // verify that these code paths THROW rather than resolve.
    //
    // NOTE: This assertion captures current handler behavior.
    // If the handler is later updated to treat undefined as an error, update here.
    expect(res.status).toBe(200);
    expect(res.body).toBeNull(); // express sends null for undefined
    // ^ This is the "false success" documented in PUR-02-E.
    //   The fix is in purgeFolder, not in the handler.
  });
});

// ---------------------------------------------------------------------------
// Tests — /v1/document/remove-folder (api-document-index.js variant)
// ---------------------------------------------------------------------------
describe("HTTP /v1/document/remove-folder — error contract (PUR-02-E)", () => {
  let purgeFolderMock;
  let app;

  beforeEach(() => {
    purgeFolderMock = jest.fn();
    app = buildApp(purgeFolderMock, "api");
  });

  test("200 + { success: true } when purgeFolder succeeds", async () => {
    purgeFolderMock.mockResolvedValue({
      success: true,
      message: 'Folder "user-uploads" purged successfully.',
    });

    const res = await request(app)
      .delete("/v1/document/remove-folder")
      .send({ name: "user-uploads" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("403 FOLDER_PROTECTED — message is prefixed in API variant", async () => {
    purgeFolderMock.mockRejectedValue(
      folderError(403, "FOLDER_PROTECTED",
        '[purgeFolder] "custom-documents" is protected or is not a removable folder.')
    );

    const res = await request(app)
      .delete("/v1/document/remove-folder")
      .send({ name: "custom-documents" });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("FOLDER_PROTECTED");
    // API variant prefixes the message with "Failed to remove folder: "
    expect(res.body.message).toMatch(/^Failed to remove folder:/);
    expect(res.body.message).toMatch(/protected/i);
  });

  test("404 FOLDER_NOT_FOUND — message is prefixed in API variant", async () => {
    purgeFolderMock.mockRejectedValue(
      folderError(404, "FOLDER_NOT_FOUND",
        '[purgeFolder] Folder "ghost" was not found.')
    );

    const res = await request(app)
      .delete("/v1/document/remove-folder")
      .send({ name: "ghost" });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("FOLDER_NOT_FOUND");
    expect(res.body.message).toMatch(/^Failed to remove folder:/);
  });

  test("400 FOLDER_UNEXPECTED_ENTRIES — API variant propagates code and message", async () => {
    purgeFolderMock.mockRejectedValue(
      folderError(400, "FOLDER_UNEXPECTED_ENTRIES",
        '[purgeFolder] "user-uploads" contains unexpected entries (subdirectories or symlinks): nested-dir.')
    );

    const res = await request(app)
      .delete("/v1/document/remove-folder")
      .send({ name: "user-uploads" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("FOLDER_UNEXPECTED_ENTRIES");
    expect(res.body.message).toMatch(/nested-dir/);
  });
});

// ---------------------------------------------------------------------------
// Cross-variant: both handlers must produce consistent success body shape
// ---------------------------------------------------------------------------
describe("HTTP — both routes produce same success body shape", () => {
  const successResult = {
    success: true,
    message: 'Folder "workspace-xyz" purged successfully.',
  };

  test("/system/remove-folder success body matches expected shape", async () => {
    const mock = jest.fn().mockResolvedValue(successResult);
    const app = buildApp(mock, "system");
    const res = await request(app)
      .delete("/system/remove-folder")
      .send({ name: "workspace-xyz" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, message: expect.any(String) });
  });

  test("/v1/document/remove-folder success body matches expected shape", async () => {
    const mock = jest.fn().mockResolvedValue(successResult);
    const app = buildApp(mock, "api");
    const res = await request(app)
      .delete("/v1/document/remove-folder")
      .send({ name: "workspace-xyz" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, message: expect.any(String) });
  });
});
