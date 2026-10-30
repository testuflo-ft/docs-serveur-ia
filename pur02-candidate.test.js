/**
 * PUR-02 Candidate Patch — Isolated Test Suite
 *
 * SAFETY GUARANTEES:
 * - No production DB access: prisma is fully mocked via jest.mock().
 * - No NAS file access: fs operations are mocked via jest.mock('fs').
 * - No active LanceDB namespace is touched: lancedb is mocked via jest.mock().
 * - No real Workspace or Document model is loaded: all dependencies mocked.
 *
 * 12 scenarios:
 *   1. removeDocuments — absent document (not found → silently skip, no error)
 *   2. removeDocuments — SQL read error (_getStrict propagates, does NOT return null)
 *   3. removeDocuments — LanceDB error (aborts before SQL, record preserved)
 *   4. removeDocuments — SQL cleanup error after successful LanceDB deletion
 *      (orphan warning logged, error propagated, source preserved)
 *   5. purgeFolder — custom-documents folder is rejected
 *   6. purgeFolder — folder containing a nested subdirectory is rejected
 *   7. purgeFolder — folder containing a symbolic link entry is rejected
 *   8. purgeDocument — cleanup (removeDocuments) failure prevents source deletion
 *   --- Scenarios 9-12: deleteDocumentFromNamespace() direct tests ---
 *   9.  Namespace absent → returns false, no LanceDB or SQL call
 *  10.  No vectors found (SQL returns []) → returns false, no table.delete call
 *  11.  SQL read error → throws with clear message, no table.delete call
 *  12.  LanceDB table.delete() error → throws with clear message
 */

"use strict";

// ---------------------------------------------------------------------------
// Module resolution helpers
// ---------------------------------------------------------------------------

// We load the candidate modules directly from the scratchpad. Because they
// require paths that don't exist in the scratchpad (e.g. "../../models/..."),
// we intercept those requires via jest.mock() and manual Module registration.

const path = require("path");
const Module = require("module");
const fs = require("fs");

// ---------------------------------------------------------------------------
// Mock: prisma
// ---------------------------------------------------------------------------
let mockPrismaDocumentVectorsFindMany = jest.fn();
let mockPrismaWorkspaceDocumentsDelete = jest.fn();
let mockPrismaDocumentVectorsDeleteMany = jest.fn();
let mockPrismaWorkspaceDocumentsFindFirst = jest.fn();
let mockPrismaWorkspacesFindMany = jest.fn();
// PUR-02 v2: removeDocuments() wraps both SQL deletions in prisma.$transaction([...]).
// The individual mock fns (delete / deleteMany) are still called to build the array,
// but the actual execution is performed by $transaction.  We need a separate mock so
// that Scenario 4 can make the transaction fail without creating unhandled rejections
// from the individual operation mocks.
let mockPrismaTransaction = jest.fn();

const mockPrisma = {
  document_vectors: {
    findMany: (...args) => mockPrismaDocumentVectorsFindMany(...args),
    deleteMany: (...args) => mockPrismaDocumentVectorsDeleteMany(...args),
  },
  workspace_documents: {
    findFirst: (...args) => mockPrismaWorkspaceDocumentsFindFirst(...args),
    delete: (...args) => mockPrismaWorkspaceDocumentsDelete(...args),
  },
  workspaces: {
    findMany: (...args) => mockPrismaWorkspacesFindMany(...args),
  },
  // Batch transaction — executes the array of PrismaPromises atomically.
  $transaction: (...args) => mockPrismaTransaction(...args),
};

// ---------------------------------------------------------------------------
// Mock: VectorDb (LanceDB provider facade returned by getVectorDbClass)
// ---------------------------------------------------------------------------
let mockDeleteDocumentFromNamespace = jest.fn();

const mockVectorDb = {
  deleteDocumentFromNamespace: (...args) =>
    mockDeleteDocumentFromNamespace(...args),
};

// ---------------------------------------------------------------------------
// Mock: EventLogs
// ---------------------------------------------------------------------------
const mockEventLogs = {
  logEvent: jest.fn().mockResolvedValue(undefined),
};

// ---------------------------------------------------------------------------
// Mock: fs module (for purgeFolder tests only)
// ---------------------------------------------------------------------------
// We do NOT mock fs globally so that the test file itself can use real fs;
// instead we inject a controlled fs substitute into the candidate module.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Inline loader for candidate modules without real requires
// ---------------------------------------------------------------------------

/**
 * Loads a candidate JS file as a module, intercepting specific require()
 * calls with the provided stub map.  The candidate files use relative require
 * paths; we map these to our stubs.
 *
 * @param {string} filePath - Absolute path to the candidate file.
 * @param {Object} stubs - Map of resolved module IDs → mock objects.
 */
function loadCandidateModule(filePath, stubs) {
  const src = fs.readFileSync(filePath, "utf8");
  const wrapped = Module.wrap(src);
  const compiledFn = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    wrapped
  );
  // Fallback: if compiledFn is not the Module.wrap style, use eval approach.
  // Module.wrap returns a string; we need to compile it.
  // eslint-disable-next-line no-eval
  const script = eval(wrapped); // wrapped is the full IIFE source string

  const mod = { exports: {} };
  const fakeRequire = (id) => {
    // Try the stubs first (exact key match).
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
    // Fall through to real require for built-ins (path, fs, etc.).
    try {
      return require(id);
    } catch (_) {
      throw new Error(
        `[test loadCandidateModule] Unresolved require('${id}') in ${path.basename(
          filePath
        )} — add it to the stubs map.`
      );
    }
  };
  fakeRequire.resolve = (id) => id;

  script(
    mod.exports,
    fakeRequire,
    mod,
    filePath,
    path.dirname(filePath)
  );
  return mod.exports;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const SCRATCHPAD = path.dirname(__filename);

const CANDIDATE_DOCUMENTS = path.join(SCRATCHPAD, "candidate-documents.js");
const CANDIDATE_PURGE = path.join(SCRATCHPAD, "candidate-purgeDocument.js");
const CANDIDATE_LANCE = path.join(SCRATCHPAD, "candidate-lance-index.js");

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helper: build a minimal workspace object
// ---------------------------------------------------------------------------
function makeWorkspace(overrides = {}) {
  return {
    id: 1,
    slug: "test-workspace",
    name: "Test Workspace",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: build a minimal document record (Prisma row shape)
// ---------------------------------------------------------------------------
function makeDocumentRow(overrides = {}) {
  return {
    id: 42,
    docId: "doc-uuid-001",
    filename: "test-doc.json",
    docpath: "workspace-folder/test-doc.json",
    workspaceId: 1,
    metadata: "{}",
    pinned: false,
    watched: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1 — removeDocuments: absent document silently skipped
// ---------------------------------------------------------------------------
describe("Scenario 1 — removeDocuments: absent document silently skipped", () => {
  test("When _getStrict returns null, no LanceDB or SQL calls are made", async () => {
    // _getStrict returns null → document not in this workspace → skip
    mockPrismaWorkspaceDocumentsFindFirst.mockResolvedValue(null);

    const stubs = {
      "../utils/prisma": mockPrisma,
      "../utils/helpers": { getVectorDbClass: () => mockVectorDb },
      "./telemetry": { Telemetry: { sendTelemetry: jest.fn() } },
      "./eventLogs": { EventLogs: mockEventLogs },
      "../utils/http": { safeJsonParse: JSON.parse },
      "../endpoints/utils": { getModelTag: () => "test" },
      uuid: { v4: () => "uuid-stub" },
    };

    const { Document } = loadCandidateModule(CANDIDATE_DOCUMENTS, stubs);

    const workspace = makeWorkspace();
    await Document.removeDocuments(workspace, ["workspace-folder/missing.json"]);

    expect(mockPrismaWorkspaceDocumentsFindFirst).toHaveBeenCalledTimes(1);
    expect(mockDeleteDocumentFromNamespace).not.toHaveBeenCalled();
    expect(mockPrismaWorkspaceDocumentsDelete).not.toHaveBeenCalled();
    expect(mockPrismaDocumentVectorsDeleteMany).not.toHaveBeenCalled();
    // EventLogs called once (always called after the loop)
    expect(mockEventLogs.logEvent).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — removeDocuments: SQL read error propagates (not swallowed)
// ---------------------------------------------------------------------------
describe("Scenario 2 — removeDocuments: SQL read error propagates", () => {
  test("When _getStrict throws, removeDocuments re-throws (not null-returns)", async () => {
    const sqlErr = new Error("SQLITE_IOERR: disk I/O error");
    mockPrismaWorkspaceDocumentsFindFirst.mockRejectedValue(sqlErr);

    const stubs = {
      "../utils/prisma": mockPrisma,
      "../utils/helpers": { getVectorDbClass: () => mockVectorDb },
      "./telemetry": { Telemetry: { sendTelemetry: jest.fn() } },
      "./eventLogs": { EventLogs: mockEventLogs },
      "../utils/http": { safeJsonParse: JSON.parse },
      "../endpoints/utils": { getModelTag: () => "test" },
      uuid: { v4: () => "uuid-stub" },
    };

    const { Document } = loadCandidateModule(CANDIDATE_DOCUMENTS, stubs);

    const workspace = makeWorkspace();
    await expect(
      Document.removeDocuments(workspace, ["workspace-folder/test-doc.json"])
    ).rejects.toThrow("SQLITE_IOERR: disk I/O error");

    // LanceDB must NOT have been called — SQL failed before we could reach it.
    expect(mockDeleteDocumentFromNamespace).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — removeDocuments: LanceDB error aborts; SQL record preserved
// ---------------------------------------------------------------------------
describe("Scenario 3 — removeDocuments: LanceDB error aborts; SQL record preserved", () => {
  test("When deleteDocumentFromNamespace throws, SQL deletion is NOT attempted", async () => {
    const docRow = makeDocumentRow();
    mockPrismaWorkspaceDocumentsFindFirst.mockResolvedValue(docRow);

    const lanceErr = new Error("LanceDB connection refused");
    mockDeleteDocumentFromNamespace.mockRejectedValue(lanceErr);

    const stubs = {
      "../utils/prisma": mockPrisma,
      "../utils/helpers": { getVectorDbClass: () => mockVectorDb },
      "./telemetry": { Telemetry: { sendTelemetry: jest.fn() } },
      "./eventLogs": { EventLogs: mockEventLogs },
      "../utils/http": { safeJsonParse: JSON.parse },
      "../endpoints/utils": { getModelTag: () => "test" },
      uuid: { v4: () => "uuid-stub" },
    };

    const { Document } = loadCandidateModule(CANDIDATE_DOCUMENTS, stubs);

    const workspace = makeWorkspace();
    await expect(
      Document.removeDocuments(workspace, ["workspace-folder/test-doc.json"])
    ).rejects.toThrow("LanceDB connection refused");

    // SQL cleanup must NOT have been called — LanceDB failed first.
    expect(mockPrismaWorkspaceDocumentsDelete).not.toHaveBeenCalled();
    expect(mockPrismaDocumentVectorsDeleteMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — removeDocuments: SQL cleanup error after successful LanceDB deletion
// ---------------------------------------------------------------------------
describe("Scenario 4 — removeDocuments: SQL cleanup error propagates with orphan warning", () => {
  test("SQL cleanup failure throws; LanceDB already cleaned; orphan log emitted", async () => {
    const docRow = makeDocumentRow();
    mockPrismaWorkspaceDocumentsFindFirst.mockResolvedValue(docRow);
    mockDeleteDocumentFromNamespace.mockResolvedValue(true); // LanceDB OK
    // The candidate wraps both SQL ops in prisma.$transaction([...]).
    // The individual delete / deleteMany mocks are called to build the array
    // (return undefined by default after clearAllMocks) but it is $transaction
    // that executes them.  Mock $transaction to reject so that no unhandled
    // rejections are created by the individual operation mocks.
    mockPrismaTransaction.mockRejectedValue(
      new Error("SQLITE_BUSY: database is locked")
    );

    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const stubs = {
      "../utils/prisma": mockPrisma,
      "../utils/helpers": { getVectorDbClass: () => mockVectorDb },
      "./telemetry": { Telemetry: { sendTelemetry: jest.fn() } },
      "./eventLogs": { EventLogs: mockEventLogs },
      "../utils/http": { safeJsonParse: JSON.parse },
      "../endpoints/utils": { getModelTag: () => "test" },
      uuid: { v4: () => "uuid-stub" },
    };

    const { Document } = loadCandidateModule(CANDIDATE_DOCUMENTS, stubs);

    const workspace = makeWorkspace();
    await expect(
      Document.removeDocuments(workspace, ["workspace-folder/test-doc.json"])
    ).rejects.toThrow("SQLITE_BUSY");

    // LanceDB was called and succeeded.
    expect(mockDeleteDocumentFromNamespace).toHaveBeenCalledTimes(1);

    // $transaction was attempted (and failed).
    expect(mockPrismaTransaction).toHaveBeenCalledTimes(1);

    // The error log should mention "orphaned" to guide manual remediation.
    const errorCalls = consoleSpy.mock.calls.flat().join(" ");
    expect(errorCalls).toMatch(/orphaned|Manual cleanup/i);

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — purgeFolder: custom-documents folder is rejected
// ---------------------------------------------------------------------------
describe("Scenario 5 — purgeFolder: custom-documents folder rejected", () => {
  test("purgeFolder('custom-documents') returns without calling any cleanup", async () => {
    // Provide a minimal fs stub where documentsPath contains only
    // custom-documents.  The function should detect that folder and return.
    const DOCS_PATH = "/storage/documents";

    const fsMock = {
      readdirSync: jest.fn((p) => {
        if (p === DOCS_PATH) return ["custom-documents"];
        return [];
      }),
      lstatSync: jest.fn(() => ({ isDirectory: () => true, isSymbolicLink: () => false })),
      existsSync: jest.fn(() => true),
      unlinkSync: jest.fn(),
      rmdirSync: jest.fn(),
    };

    const stubs = {
      ".": {
        purgeVectorCache: jest.fn().mockResolvedValue(undefined),
        purgeSourceDocument: jest.fn().mockResolvedValue(undefined),
        normalizePath: (p) => p,
        isWithin: () => true,
        documentsPath: DOCS_PATH,
      },
      "../../models/documents": {
        Document: { removeDocuments: jest.fn().mockResolvedValue(undefined) },
      },
      // PUR-02 v2: candidate-purgeDocument.js imports prisma directly.
      "../../utils/prisma": mockPrisma,
      fs: fsMock,
    };

    const { purgeFolder } = loadCandidateModule(CANDIDATE_PURGE, stubs);

    await purgeFolder("custom-documents");

    // The folder list contains only custom-documents, which is excluded →
    // validRemovableSubFolders will be empty → return early.
    expect(fsMock.unlinkSync).not.toHaveBeenCalled();
    expect(fsMock.rmdirSync).not.toHaveBeenCalled();
    expect(stubs["../../models/documents"].Document.removeDocuments).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — purgeFolder: folder containing a nested subdirectory is rejected
// ---------------------------------------------------------------------------
describe("Scenario 6 — purgeFolder: nested subdirectory aborts operation", () => {
  test("purgeFolder aborts and does NOT delete folder when a subdir is present", async () => {
    const DOCS_PATH = "/storage/documents";
    const TARGET = "user-uploads";

    const fsMock = {
      readdirSync: jest.fn((p, opts) => {
        if (p === DOCS_PATH) return [TARGET];
        // Inside the target folder: one file and one subdirectory.
        if (opts && opts.withFileTypes) {
          return [
            {
              name: "document.json",
              isFile: () => true,
              isSymbolicLink: () => false,
            },
            {
              name: "nested-dir",
              isFile: () => false,
              isSymbolicLink: () => false,
            },
          ];
        }
        return ["document.json", "nested-dir"];
      }),
      lstatSync: jest.fn(() => ({
        isDirectory: () => true,
        isSymbolicLink: () => false,
      })),
      existsSync: jest.fn(() => true),
      unlinkSync: jest.fn(),
      rmdirSync: jest.fn(),
    };

    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const stubs = {
      ".": {
        purgeVectorCache: jest.fn().mockResolvedValue(undefined),
        purgeSourceDocument: jest.fn().mockResolvedValue(undefined),
        normalizePath: (p) => p,
        isWithin: () => true,
        documentsPath: DOCS_PATH,
      },
      "../../models/documents": {
        Document: { removeDocuments: jest.fn().mockResolvedValue(undefined) },
      },
      // PUR-02 v2: candidate-purgeDocument.js imports prisma directly.
      "../../utils/prisma": mockPrisma,
      fs: fsMock,
    };

    const { purgeFolder } = loadCandidateModule(CANDIDATE_PURGE, stubs);

    await purgeFolder(TARGET);

    // No files deleted, no directory removed.
    expect(fsMock.unlinkSync).not.toHaveBeenCalled();
    expect(fsMock.rmdirSync).not.toHaveBeenCalled();

    // An error log mentioning the unexpected entry should have been emitted.
    const errorLog = consoleSpy.mock.calls.flat().join(" ");
    expect(errorLog).toMatch(/nested-dir/);
    expect(errorLog).toMatch(/Aborting/i);

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Scenario 7 — purgeFolder: folder containing a symbolic link entry is rejected
// ---------------------------------------------------------------------------
describe("Scenario 7 — purgeFolder: symbolic link entry aborts operation", () => {
  test("purgeFolder aborts and does NOT delete folder when a symlink is present", async () => {
    const DOCS_PATH = "/storage/documents";
    const TARGET = "user-uploads";

    const fsMock = {
      readdirSync: jest.fn((p, opts) => {
        if (p === DOCS_PATH) return [TARGET];
        if (opts && opts.withFileTypes) {
          return [
            {
              name: "real-doc.json",
              isFile: () => true,
              isSymbolicLink: () => false,
            },
            {
              name: "link-to-secret",
              isFile: () => true,  // isFile() is true on a symlink to a file
              isSymbolicLink: () => true, // but isSymbolicLink() also true
            },
          ];
        }
        return ["real-doc.json", "link-to-secret"];
      }),
      lstatSync: jest.fn((p) => {
        // Top-level target dir is a normal directory.
        return { isDirectory: () => true, isSymbolicLink: () => false };
      }),
      existsSync: jest.fn(() => true),
      unlinkSync: jest.fn(),
      rmdirSync: jest.fn(),
    };

    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const stubs = {
      ".": {
        purgeVectorCache: jest.fn().mockResolvedValue(undefined),
        purgeSourceDocument: jest.fn().mockResolvedValue(undefined),
        normalizePath: (p) => p,
        isWithin: () => true,
        documentsPath: DOCS_PATH,
      },
      "../../models/documents": {
        Document: { removeDocuments: jest.fn().mockResolvedValue(undefined) },
      },
      // PUR-02 v2: candidate-purgeDocument.js imports prisma directly.
      "../../utils/prisma": mockPrisma,
      fs: fsMock,
    };

    const { purgeFolder } = loadCandidateModule(CANDIDATE_PURGE, stubs);

    await purgeFolder(TARGET);

    expect(fsMock.unlinkSync).not.toHaveBeenCalled();
    expect(fsMock.rmdirSync).not.toHaveBeenCalled();

    const errorLog = consoleSpy.mock.calls.flat().join(" ");
    expect(errorLog).toMatch(/link-to-secret/);
    expect(errorLog).toMatch(/Aborting/i);

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Scenario 8 — purgeDocument: cleanup failure prevents source deletion
// ---------------------------------------------------------------------------
describe("Scenario 8 — purgeDocument: cleanup failure preserves source file", () => {
  test("When removeDocuments throws, purgeVectorCache and purgeSourceDocument are NOT called", async () => {
    const purgeVectorCacheMock = jest.fn().mockResolvedValue(undefined);
    const purgeSourceDocumentMock = jest.fn().mockResolvedValue(undefined);
    const removeDocumentsMock = jest
      .fn()
      .mockRejectedValue(new Error("LanceDB connection refused"));

    // PUR-02 v2: purgeDocument() uses _getWorkspacesStrict() which calls
    // prisma.workspaces.findMany() directly.  Set it up via the shared mock.
    mockPrismaWorkspacesFindMany.mockResolvedValue([makeWorkspace()]);

    const stubs = {
      ".": {
        purgeVectorCache: purgeVectorCacheMock,
        purgeSourceDocument: purgeSourceDocumentMock,
        normalizePath: (p) => p,
        isWithin: () => true,
        documentsPath: "/storage/documents",
      },
      "../../models/documents": {
        Document: { removeDocuments: removeDocumentsMock },
      },
      // PUR-02 v2: candidate-purgeDocument.js imports prisma directly.
      "../../utils/prisma": mockPrisma,
      fs: {
        readdirSync: jest.fn().mockReturnValue([]),
        lstatSync: jest.fn(),
        existsSync: jest.fn(),
        unlinkSync: jest.fn(),
        rmdirSync: jest.fn(),
      },
    };

    const { purgeDocument } = loadCandidateModule(CANDIDATE_PURGE, stubs);

    await expect(
      purgeDocument("workspace-folder/important-doc.json")
    ).rejects.toThrow("LanceDB connection refused");

    // The association cleanup failed → source files must NOT be deleted.
    expect(purgeVectorCacheMock).not.toHaveBeenCalled();
    expect(purgeSourceDocumentMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Helper: build a minimal LanceDB client stub
// ---------------------------------------------------------------------------
function makeLanceClientStub({ namespaces = [], tableDeleteFn = jest.fn().mockResolvedValue(undefined) } = {}) {
  return {
    tableNames: jest.fn().mockResolvedValue(namespaces),
    openTable: jest.fn().mockResolvedValue({ delete: tableDeleteFn }),
  };
}

// ---------------------------------------------------------------------------
// Scenario 9 — deleteDocumentFromNamespace: namespace absent → false, no calls
// ---------------------------------------------------------------------------
describe("Scenario 9 — deleteDocumentFromNamespace: namespace absent returns false", () => {
  test("Returns false without querying SQL or calling table.delete when namespace does not exist", async () => {
    const tableDeleteFn = jest.fn();
    const mockPrismaLocal = {
      document_vectors: { findMany: jest.fn() },
    };

    // Namespace list is empty → namespaceExists returns false.
    const lanceClientStub = makeLanceClientStub({ namespaces: [], tableDeleteFn });

    const stubs = {
      "@lancedb/lancedb": { connect: jest.fn().mockResolvedValue(lanceClientStub) },
      "../../helpers": { toChunks: jest.fn(), getEmbeddingEngineSelection: jest.fn() },
      "../../TextSplitter": { TextSplitter: jest.fn() },
      "../../../models/systemSettings": { SystemSettings: { getValueOrFallback: jest.fn() } },
      "../../files": { storeVectorResult: jest.fn(), cachedVectorInformation: jest.fn() },
      uuid: { v4: () => "uuid-stub" },
      "../../chats": { sourceIdentifier: jest.fn() },
      "../../EmbeddingRerankers/native": { NativeEmbeddingReranker: jest.fn() },
      "../base": { VectorDatabase: class { logger(...args) { /* silent */ } curateSources(s) { return s; } } },
      path: require("path"),
      "../../../utils/prisma": mockPrismaLocal,
      "../../../models/vectors": { DocumentVectors: {} },
    };

    const { LanceDb } = loadCandidateModule(CANDIDATE_LANCE, stubs);
    const instance = new LanceDb();

    const result = await instance.deleteDocumentFromNamespace("absent-namespace", "doc-uuid-001");

    expect(result).toBe(false);
    expect(mockPrismaLocal.document_vectors.findMany).not.toHaveBeenCalled();
    expect(tableDeleteFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Scenario 10 — deleteDocumentFromNamespace: no vectors found → false, no table.delete
// ---------------------------------------------------------------------------
describe("Scenario 10 — deleteDocumentFromNamespace: no vectors found returns false", () => {
  test("Returns false without calling table.delete when SQL returns empty vector list", async () => {
    const tableDeleteFn = jest.fn();
    const mockPrismaLocal = {
      document_vectors: {
        findMany: jest.fn().mockResolvedValue([]), // no vectors
      },
    };

    const lanceClientStub = makeLanceClientStub({
      namespaces: ["test-workspace"],
      tableDeleteFn,
    });

    const stubs = {
      "@lancedb/lancedb": { connect: jest.fn().mockResolvedValue(lanceClientStub) },
      "../../helpers": { toChunks: jest.fn(), getEmbeddingEngineSelection: jest.fn() },
      "../../TextSplitter": { TextSplitter: jest.fn() },
      "../../../models/systemSettings": { SystemSettings: { getValueOrFallback: jest.fn() } },
      "../../files": { storeVectorResult: jest.fn(), cachedVectorInformation: jest.fn() },
      uuid: { v4: () => "uuid-stub" },
      "../../chats": { sourceIdentifier: jest.fn() },
      "../../EmbeddingRerankers/native": { NativeEmbeddingReranker: jest.fn() },
      "../base": { VectorDatabase: class { logger(...args) {} curateSources(s) { return s; } } },
      path: require("path"),
      "../../../utils/prisma": mockPrismaLocal,
      "../../../models/vectors": { DocumentVectors: {} },
    };

    const { LanceDb } = loadCandidateModule(CANDIDATE_LANCE, stubs);
    const instance = new LanceDb();

    const result = await instance.deleteDocumentFromNamespace("test-workspace", "doc-uuid-no-vectors");

    expect(result).toBe(false);
    expect(tableDeleteFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Scenario 11 — deleteDocumentFromNamespace: SQL read error throws
// ---------------------------------------------------------------------------
describe("Scenario 11 — deleteDocumentFromNamespace: SQL read error propagates", () => {
  test("Throws with a clear message when prisma.document_vectors.findMany rejects", async () => {
    const tableDeleteFn = jest.fn();
    const mockPrismaLocal = {
      document_vectors: {
        findMany: jest.fn().mockRejectedValue(new Error("SQLITE_CORRUPT: database disk image is malformed")),
      },
    };

    const lanceClientStub = makeLanceClientStub({
      namespaces: ["test-workspace"],
      tableDeleteFn,
    });

    const stubs = {
      "@lancedb/lancedb": { connect: jest.fn().mockResolvedValue(lanceClientStub) },
      "../../helpers": { toChunks: jest.fn(), getEmbeddingEngineSelection: jest.fn() },
      "../../TextSplitter": { TextSplitter: jest.fn() },
      "../../../models/systemSettings": { SystemSettings: { getValueOrFallback: jest.fn() } },
      "../../files": { storeVectorResult: jest.fn(), cachedVectorInformation: jest.fn() },
      uuid: { v4: () => "uuid-stub" },
      "../../chats": { sourceIdentifier: jest.fn() },
      "../../EmbeddingRerankers/native": { NativeEmbeddingReranker: jest.fn() },
      "../base": { VectorDatabase: class { logger(...args) {} curateSources(s) { return s; } } },
      path: require("path"),
      "../../../utils/prisma": mockPrismaLocal,
      "../../../models/vectors": { DocumentVectors: {} },
    };

    const { LanceDb } = loadCandidateModule(CANDIDATE_LANCE, stubs);
    const instance = new LanceDb();

    await expect(
      instance.deleteDocumentFromNamespace("test-workspace", "doc-uuid-001")
    ).rejects.toThrow(/SQL error fetching vector IDs/);

    // table.delete must NOT be reached after a SQL failure.
    expect(tableDeleteFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Scenario 12 — deleteDocumentFromNamespace: LanceDB table.delete() error throws
// ---------------------------------------------------------------------------
describe("Scenario 12 — deleteDocumentFromNamespace: LanceDB table.delete error propagates", () => {
  test("Throws with a clear message when table.delete rejects", async () => {
    const tableDeleteFn = jest.fn().mockRejectedValue(new Error("LanceDB I/O error: shard write failed"));
    const mockPrismaLocal = {
      document_vectors: {
        findMany: jest.fn().mockResolvedValue([
          { vectorId: "vec-aaa" },
          { vectorId: "vec-bbb" },
        ]),
      },
    };

    const lanceClientStub = makeLanceClientStub({
      namespaces: ["test-workspace"],
      tableDeleteFn,
    });

    const stubs = {
      "@lancedb/lancedb": { connect: jest.fn().mockResolvedValue(lanceClientStub) },
      "../../helpers": { toChunks: jest.fn(), getEmbeddingEngineSelection: jest.fn() },
      "../../TextSplitter": { TextSplitter: jest.fn() },
      "../../../models/systemSettings": { SystemSettings: { getValueOrFallback: jest.fn() } },
      "../../files": { storeVectorResult: jest.fn(), cachedVectorInformation: jest.fn() },
      uuid: { v4: () => "uuid-stub" },
      "../../chats": { sourceIdentifier: jest.fn() },
      "../../EmbeddingRerankers/native": { NativeEmbeddingReranker: jest.fn() },
      "../base": { VectorDatabase: class { logger(...args) {} curateSources(s) { return s; } } },
      path: require("path"),
      "../../../utils/prisma": mockPrismaLocal,
      "../../../models/vectors": { DocumentVectors: {} },
    };

    const { LanceDb } = loadCandidateModule(CANDIDATE_LANCE, stubs);
    const instance = new LanceDb();

    await expect(
      instance.deleteDocumentFromNamespace("test-workspace", "doc-uuid-001")
    ).rejects.toThrow(/LanceDB deletion failed/);

    // SQL was called and succeeded (vector IDs were fetched).
    expect(mockPrismaLocal.document_vectors.findMany).toHaveBeenCalledTimes(1);
    // table.delete was called (and threw).
    expect(tableDeleteFn).toHaveBeenCalledTimes(1);
  });
});
