/**
 * PUR-02-E — HTTP Route Handler Tests (real handlers)
 *
 * Strategy
 * --------
 * Both handler files export a setup function that registers routes on an
 * Express `app` passed in as an argument:
 *
 *   systemEndpoints(app)        ← endpoints-system.js
 *   apiDocumentEndpoints(app)   ← api-document-index.js
 *
 * We load each file with loadCandidateModule() (the same stub-injection
 * mechanism used by the unit tests), pass a "route recorder" object instead
 * of a real Express app, and capture the actual async handler function for
 * DELETE /system/remove-folder and DELETE /v1/document/remove-folder.
 *
 * That captured function IS the real handler code.  We call it directly with
 * controlled req/res objects — no Express server is started, no HTTP network
 * is involved, but the exact lines that ship in production run.
 *
 * What is stubbed
 * ---------------
 * - purgeFolder (from ../utils/files/purgeDocument) — the function under test
 * - reqBody (from ../utils/http) — returns req.body so name is parsed correctly
 * - All auth middleware — replaced with (req, res, next) => next() so no JWT
 *   or API-key check blocks the handler
 * - All other imports — empty stub objects; they are not called by the route
 *   bodies under test
 *
 * What is NOT stubbed
 * -------------------
 * - The handler body itself — every line of the try/catch in each handler runs
 *   exactly as it does in production
 *
 * SAFETY:
 * - No production DB, filesystem, or network access
 * - No Docker containers touched
 * - No production files modified
 *
 * Routes under test:
 *   DELETE /system/remove-folder      (endpoints-system.js  line 500)
 *   DELETE /v1/document/remove-folder (api-document-index.js line 1036)
 *
 * Key difference between the two handlers:
 *   endpoints-system.js  → message: e.message || "Failed to remove folder."
 *   api-document-index.js→ message: e.message ? `Failed to remove folder: ${e.message}` : "Failed to remove folder."
 */

"use strict";

const path   = require("path");
const Module = require("module");
const fs     = require("fs");

// ---------------------------------------------------------------------------
// loadCandidateModule — same technique as pur02-candidate.test.js
// ---------------------------------------------------------------------------
function loadCandidateModule(filePath, stubs) {
  const src = fs.readFileSync(filePath, "utf8");
  const wrapped = Module.wrap(src);
  // eval the wrapped string to get the IIFE function
  // eslint-disable-next-line no-eval
  const script = eval(wrapped);

  const mod = { exports: {} };
  const fakeRequire = (id) => {
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
    try {
      return require(id);
    } catch (_) {
      throw new Error(
        `[loadCandidateModule] Unresolved require('${id}') in ${path.basename(filePath)} — add a stub.`
      );
    }
  };
  fakeRequire.resolve = (id) => id;

  script(mod.exports, fakeRequire, mod, filePath, path.dirname(filePath));
  return mod.exports;
}

// ---------------------------------------------------------------------------
// Route recorder — captures app.delete() registrations without Express
// ---------------------------------------------------------------------------
function makeRouteRecorder() {
  const routes = {};          // "DELETE /path" → async handler fn
  const noopMiddleware = (req, res, next) => { if (next) next(); };
  const noop = () => {};

  const recorder = {
    _routes: routes,
    delete: (routePath, ...args) => {
      // last arg is always the async handler; middlewares come before it
      routes[`DELETE ${routePath}`] = args[args.length - 1];
    },
    get:   noop,
    post:  noop,
    put:   noop,
    patch: noop,
  };
  return recorder;
}

// ---------------------------------------------------------------------------
// Minimal req / res builders
// ---------------------------------------------------------------------------
function makeReq(body = {}) {
  return { body };
}

function makeRes() {
  const res = {};
  // status() returns `this` for chaining: res.status(200).json({...})
  res.status = jest.fn(() => res);
  res.json    = jest.fn();
  res.sendStatus = jest.fn(() => res);
  res.end     = jest.fn();
  return res;
}

// ---------------------------------------------------------------------------
// folderError helper — mirrors the one in the patched purgeDocument
// ---------------------------------------------------------------------------
function folderError(statusCode, code, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

// ---------------------------------------------------------------------------
// Environment — api-document-index.js evaluates path.resolve(STORAGE_DIR, ...)
// at module load time (outside any function). STORAGE_DIR must be defined
// before loadCandidateModule is called for that file.
// ---------------------------------------------------------------------------
if (!process.env.STORAGE_DIR) {
  process.env.STORAGE_DIR = "/tmp/stub-storage";
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const SCRATCHPAD = path.resolve(__dirname, "..");
const LAB = path.join(SCRATCHPAD, "lab-extract", "pur02-lab-extraction");

const ENDPOINTS_SYSTEM = path.join(LAB, "endpoints-system.js");
const API_DOCUMENT     = path.join(LAB, "api-document-index.js");

// ---------------------------------------------------------------------------
// Stub factories
// ---------------------------------------------------------------------------

/**
 * Stubs for endpoints-system.js.
 * purgeFolder is replaced with `purgeFolderMock` on each call.
 */
function makeSystemStubs(purgeFolderMock) {
  const noopMw = (req, res, next) => { if (next) next(); };
  return {
    "dotenv": { config: () => {} },
    "../utils/files": {
      normalizePath: (p) => p,
      isWithin: () => true,
      listFolders: jest.fn(),
      getDocumentsByFolder: jest.fn(),
      searchDocuments: jest.fn(),
      getDocumentsByDocPaths: jest.fn(),
    },
    "../utils/files/purgeDocument": {
      purgeDocument: jest.fn(),
      purgeFolder: purgeFolderMock,
    },
    "../utils/helpers": { getVectorDbClass: jest.fn() },
    "../utils/helpers/updateENV": { updateENV: jest.fn(), dumpENV: jest.fn() },
    "../utils/http": {
      reqBody: (req) => req.body || {},
      makeJWT: jest.fn(),
      userFromSession: jest.fn(),
      multiUserMode: jest.fn(),
      queryParams: jest.fn(() => ({})),
    },
    "../utils/files/multer": {
      handleAssetUpload: noopMw,
      handlePfpUpload: noopMw,
      handleAudioUpload: noopMw,
    },
    "uuid": { v4: () => "uuid-stub" },
    "../models/systemSettings": { SystemSettings: {} },
    "../models/user": { User: {} },
    "../utils/middleware/validatedRequest": noopMw,
    "../utils/middleware/validApiKey": noopMw,
    "fs": fs,
    "path": path,
    "../utils/files/logo": { fetchLogo: jest.fn(), determinePfpFilepath: jest.fn() },
    "../models/telemetry": { Telemetry: { sendTelemetry: jest.fn() } },
    "../models/apiKeys": { ApiKey: {} },
    "../utils/helpers/customModels": { getCustomModels: jest.fn() },
    "../models/workspaceChats": { WorkspaceChats: {} },
    "../models/workspaceThread": { WorkspaceThread: {} },
    "../models/workspaceParsedFiles": { WorkspaceParsedFiles: {} },
    "../utils/middleware/multiUserProtected": {
      flexUserRoleValid: () => noopMw,
      ROLES: { admin: "admin", manager: "manager" },
    },
    "../utils/files/pfp": { fetchPfp: jest.fn(), determinePfpFilepath: jest.fn() },
    "../utils/helpers/chat/convertTo": { exportChatsAsType: jest.fn() },
    "../models/eventLogs": { EventLogs: { logEvent: jest.fn() } },
    "../utils/collectorApi": { CollectorApi: jest.fn(() => ({})) },
    "../utils/PasswordRecovery": {
      requestPasswordResetEmail: jest.fn(),
      resetPassword: jest.fn(),
      PasswordRecoveryToken: {},
    },
    "../models/slashCommandsPresets": { SlashCommandPresets: {} },
    "../utils/EncryptionManager": { EncryptionManager: {} },
    "../models/browserExtensionApiKey": { BrowserExtensionApiKey: {} },
    "../models/mobileDevice": { MobileDevice: {} },
    "../utils/middleware/chatHistoryViewable": {
      chatHistoryViewable: noopMw,
    },
    "../utils/middleware/simpleSSOEnabled": {
      simpleSSOEnabled: noopMw,
    },
    "../models/temporaryAuthToken": { TemporaryAuthToken: {} },
    "../models/systemPromptVariables": { SystemPromptVariables: {} },
    "../utils/chats": { isReservedCommand: jest.fn() },
    "../models/agentSkillWhitelist": { AgentSkillWhitelist: {} },
    "../models/memory": { Memory: {} },
    "../utils/helpers/dummyHashCompare": { dummyHashCompare: jest.fn() },
  };
}

/**
 * Stubs for api-document-index.js.
 */
function makeApiStubs(purgeFolderMock) {
  const noopMw = (req, res, next) => { if (next) next(); };
  return {
    "../../../models/telemetry": { Telemetry: { sendTelemetry: jest.fn() } },
    "../../../utils/middleware/validApiKey": noopMw,
    "../../../utils/files/multer": { handleAPIFileUpload: noopMw },
    "../../../utils/files": {
      findDocumentInDocuments: jest.fn(),
      getDocumentsByFolder: jest.fn(),
      normalizePath: (p) => p,
      isWithin: () => true,
      moveProcessedDocsToFolder: jest.fn(),
      viewLocalFiles: jest.fn(),
    },
    "../../../utils/http": {
      reqBody: (req) => req.body || {},
      safeJsonParse: JSON.parse,
      queryParams: jest.fn(() => ({})),
    },
    "../../../models/eventLogs": { EventLogs: { logEvent: jest.fn() } },
    "../../../utils/collectorApi": { CollectorApi: jest.fn(() => ({})) },
    "fs": fs,
    "path": path,
    "../../../models/documents": { Document: {} },
    "../../../utils/files/purgeDocument": {
      purgeFolder: purgeFolderMock,
    },
    "../../../utils/agents/aibitat/plugins/create-files/lib": {},
    // inner require at line 1261
    "../../../utils/files": {
      findDocumentInDocuments: jest.fn(),
      getDocumentsByFolder: jest.fn(),
      normalizePath: (p) => p,
      isWithin: () => true,
      moveProcessedDocsToFolder: jest.fn(),
      viewLocalFiles: jest.fn(),
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: load handler and extract a specific route
// ---------------------------------------------------------------------------
function extractRoute(handlerFilePath, exportedFnName, routeKey, stubsFn) {
  const purgeFolderMock = jest.fn();
  const stubs = stubsFn(purgeFolderMock);
  const recorder = makeRouteRecorder();
  const mod = loadCandidateModule(handlerFilePath, stubs);
  mod[exportedFnName](recorder);
  const handler = recorder._routes[routeKey];
  if (!handler) {
    throw new Error(
      `Route "${routeKey}" not found in ${path.basename(handlerFilePath)}. ` +
      `Registered routes: ${Object.keys(recorder._routes).join(", ")}`
    );
  }
  return { handler, purgeFolderMock };
}

// ===========================================================================
// Suite A — endpoints-system.js → DELETE /system/remove-folder
// ===========================================================================
describe("Real handler: DELETE /system/remove-folder (endpoints-system.js)", () => {

  test("200 + { success: true } when purgeFolder resolves with success object", async () => {
    const { handler, purgeFolderMock } = extractRoute(
      ENDPOINTS_SYSTEM, "systemEndpoints", "DELETE /system/remove-folder", makeSystemStubs
    );
    purgeFolderMock.mockResolvedValue({
      success: true,
      message: 'Folder "user-uploads" purged successfully.',
    });

    const req = makeReq({ name: "user-uploads" });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, message: expect.stringMatching(/purged successfully/i) })
    );
  });

  test("400 FOLDER_NAME_REQUIRED when name is null", async () => {
    const { handler, purgeFolderMock } = extractRoute(
      ENDPOINTS_SYSTEM, "systemEndpoints", "DELETE /system/remove-folder", makeSystemStubs
    );
    purgeFolderMock.mockRejectedValue(
      folderError(400, "FOLDER_NAME_REQUIRED",
        "[purgeFolder] folderName must be a non-empty string.")
    );

    const req = makeReq({ name: null });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: "FOLDER_NAME_REQUIRED",
    }));
  });

  test("403 FOLDER_PROTECTED when folder is protected", async () => {
    const { handler, purgeFolderMock } = extractRoute(
      ENDPOINTS_SYSTEM, "systemEndpoints", "DELETE /system/remove-folder", makeSystemStubs
    );
    purgeFolderMock.mockRejectedValue(
      folderError(403, "FOLDER_PROTECTED",
        '[purgeFolder] "custom-documents" is protected or is not a removable folder.')
    );

    const req = makeReq({ name: "custom-documents" });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: "FOLDER_PROTECTED",
      message: expect.stringMatching(/protected/i),
    }));
  });

  test("404 FOLDER_NOT_FOUND when folder does not exist on disk", async () => {
    const { handler, purgeFolderMock } = extractRoute(
      ENDPOINTS_SYSTEM, "systemEndpoints", "DELETE /system/remove-folder", makeSystemStubs
    );
    purgeFolderMock.mockRejectedValue(
      folderError(404, "FOLDER_NOT_FOUND",
        '[purgeFolder] Folder "ghost-folder" was not found.')
    );

    const req = makeReq({ name: "ghost-folder" });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: "FOLDER_NOT_FOUND",
    }));
  });

  test("400 FOLDER_UNEXPECTED_ENTRIES when folder contains a subdirectory", async () => {
    const { handler, purgeFolderMock } = extractRoute(
      ENDPOINTS_SYSTEM, "systemEndpoints", "DELETE /system/remove-folder", makeSystemStubs
    );
    purgeFolderMock.mockRejectedValue(
      folderError(400, "FOLDER_UNEXPECTED_ENTRIES",
        '[purgeFolder] "user-uploads" contains unexpected entries (subdirectories or symlinks): nested-dir.')
    );

    const req = makeReq({ name: "user-uploads" });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: "FOLDER_UNEXPECTED_ENTRIES",
      message: expect.stringMatching(/nested-dir/),
    }));
  });

  test("400 FOLDER_OUTSIDE_DOCUMENTS when path traversal attempted", async () => {
    const { handler, purgeFolderMock } = extractRoute(
      ENDPOINTS_SYSTEM, "systemEndpoints", "DELETE /system/remove-folder", makeSystemStubs
    );
    purgeFolderMock.mockRejectedValue(
      folderError(400, "FOLDER_OUTSIDE_DOCUMENTS",
        '[purgeFolder] "../../../etc" is outside the documents directory.')
    );

    const req = makeReq({ name: "../../../etc" });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: "FOLDER_OUTSIDE_DOCUMENTS",
    }));
  });

  test("500 FOLDER_PURGE_FAILED when purgeFolder throws an unexpected error", async () => {
    const { handler, purgeFolderMock } = extractRoute(
      ENDPOINTS_SYSTEM, "systemEndpoints", "DELETE /system/remove-folder", makeSystemStubs
    );
    purgeFolderMock.mockRejectedValue(new Error("Unexpected internal error"));

    const req = makeReq({ name: "some-folder" });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: "FOLDER_PURGE_FAILED",
    }));
  });

  // REGRESSION: with the PUR-02-E patch applied, purgeFolder NEVER resolves
  // undefined on an error path — it throws instead.  If it somehow did resolve
  // undefined (pre-fix behavior), the handler would serialize null to HTTP 200.
  // This test documents that contract: the handler itself passes undefined through.
  // The real guard is the unit tests (S05/S05b/S05c) which verify purgeFolder throws.
  test("REGRESSION DOCUMENTED: handler passes undefined through as HTTP 200 (pre-fix behavior)", async () => {
    const { handler, purgeFolderMock } = extractRoute(
      ENDPOINTS_SYSTEM, "systemEndpoints", "DELETE /system/remove-folder", makeSystemStubs
    );
    // Simulate old pre-fix behavior: silent return (undefined)
    purgeFolderMock.mockResolvedValue(undefined);

    const req = makeReq({ name: "custom-documents" });
    const res = makeRes();

    await handler(req, res);

    // Handler calls response.status(200).json(undefined) → json(null) in Express.
    // This is the FALSE SUCCESS documented in PUR-02-E.
    // With the patch applied, this path is unreachable for any error condition.
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(undefined);
  });
});

// ===========================================================================
// Suite B — api-document-index.js → DELETE /v1/document/remove-folder
// ===========================================================================
describe("Real handler: DELETE /v1/document/remove-folder (api-document-index.js)", () => {

  test("200 + { success: true } when purgeFolder resolves with success object", async () => {
    const { handler, purgeFolderMock } = extractRoute(
      API_DOCUMENT, "apiDocumentEndpoints", "DELETE /v1/document/remove-folder", makeApiStubs
    );
    purgeFolderMock.mockResolvedValue({
      success: true,
      message: 'Folder "user-uploads" purged successfully.',
    });

    const req = makeReq({ name: "user-uploads" });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });

  test("403 FOLDER_PROTECTED — message is prefixed with 'Failed to remove folder:'", async () => {
    const { handler, purgeFolderMock } = extractRoute(
      API_DOCUMENT, "apiDocumentEndpoints", "DELETE /v1/document/remove-folder", makeApiStubs
    );
    purgeFolderMock.mockRejectedValue(
      folderError(403, "FOLDER_PROTECTED",
        '[purgeFolder] "custom-documents" is protected or is not a removable folder.')
    );

    const req = makeReq({ name: "custom-documents" });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.code).toBe("FOLDER_PROTECTED");
    // API variant prefixes: "Failed to remove folder: [purgeFolder] ..."
    expect(body.message).toMatch(/^Failed to remove folder:/);
    expect(body.message).toMatch(/protected/i);
  });

  test("404 FOLDER_NOT_FOUND — message is prefixed in API variant", async () => {
    const { handler, purgeFolderMock } = extractRoute(
      API_DOCUMENT, "apiDocumentEndpoints", "DELETE /v1/document/remove-folder", makeApiStubs
    );
    purgeFolderMock.mockRejectedValue(
      folderError(404, "FOLDER_NOT_FOUND",
        '[purgeFolder] Folder "ghost" was not found.')
    );

    const req = makeReq({ name: "ghost" });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.code).toBe("FOLDER_NOT_FOUND");
    expect(body.message).toMatch(/^Failed to remove folder:/);
  });

  test("400 FOLDER_UNEXPECTED_ENTRIES — API variant propagates code and prefixed message", async () => {
    const { handler, purgeFolderMock } = extractRoute(
      API_DOCUMENT, "apiDocumentEndpoints", "DELETE /v1/document/remove-folder", makeApiStubs
    );
    purgeFolderMock.mockRejectedValue(
      folderError(400, "FOLDER_UNEXPECTED_ENTRIES",
        '[purgeFolder] "user-uploads" contains unexpected entries (subdirectories or symlinks): nested-dir.')
    );

    const req = makeReq({ name: "user-uploads" });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.code).toBe("FOLDER_UNEXPECTED_ENTRIES");
    expect(body.message).toMatch(/nested-dir/);
  });

  test("500 FOLDER_PURGE_FAILED when purgeFolder throws an unexpected error", async () => {
    const { handler, purgeFolderMock } = extractRoute(
      API_DOCUMENT, "apiDocumentEndpoints", "DELETE /v1/document/remove-folder", makeApiStubs
    );
    purgeFolderMock.mockRejectedValue(new Error("Unexpected internal error"));

    const req = makeReq({ name: "some-folder" });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: "FOLDER_PURGE_FAILED",
    }));
  });

  test("500 — message falls back to generic when e.message is empty", async () => {
    const { handler, purgeFolderMock } = extractRoute(
      API_DOCUMENT, "apiDocumentEndpoints", "DELETE /v1/document/remove-folder", makeApiStubs
    );
    // Error with no message: e.message is ""
    const err = new Error("");
    purgeFolderMock.mockRejectedValue(err);

    const req = makeReq({ name: "some-folder" });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe("Failed to remove folder.");
  });
});

// ===========================================================================
// Cross-variant: both handlers produce same success body shape
// ===========================================================================
describe("Cross-variant: both handlers produce consistent success body on purgeFolder success", () => {
  const successResult = {
    success: true,
    message: 'Folder "workspace-xyz" purged successfully.',
  };

  test("DELETE /system/remove-folder success body matches expected shape", async () => {
    const { handler, purgeFolderMock } = extractRoute(
      ENDPOINTS_SYSTEM, "systemEndpoints", "DELETE /system/remove-folder", makeSystemStubs
    );
    purgeFolderMock.mockResolvedValue(successResult);

    const req = makeReq({ name: "workspace-xyz" });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, message: expect.any(String) })
    );
  });

  test("DELETE /v1/document/remove-folder success body matches expected shape", async () => {
    const { handler, purgeFolderMock } = extractRoute(
      API_DOCUMENT, "apiDocumentEndpoints", "DELETE /v1/document/remove-folder", makeApiStubs
    );
    purgeFolderMock.mockResolvedValue(successResult);

    const req = makeReq({ name: "workspace-xyz" });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, message: expect.any(String) })
    );
  });
});
