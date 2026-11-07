/**
 * PUR-02 — LanceDB companion v4f : tests de deleteDocumentFromNamespace
 *
 * Couverture
 * ----------
 * L-01  Namespace absent              → retourne true  (no-op = succès)
 * L-02  Namespace présent, 0 vecteur  → retourne true  (no-op = succès)
 * L-03  Suppression effective         → retourne true, table.delete() appelé avec bons IDs
 * L-04  Erreur SQL (findMany)         → lance Error avec message SQL
 * L-05  Erreur LanceDB (table.delete) → lance Error avec message LanceDB
 *
 * R-01  Rollback addDocuments : create() échoue, LanceDB retourne true
 *       → DocumentVectors.delete() est bien appelé (SQL nettoyé)
 * R-02  Rollback addDocuments : create() échoue, LanceDB retourne true
 *       pour namespace absent (v4f) → DocumentVectors.delete() est bien appelé
 * R-03  Contrôle négatif : LanceDB lève exception → DocumentVectors.delete() NON appelé
 *
 * Environnement
 * -------------
 * Aucun accès à la base de données, à LanceDB ou au système de fichiers réels.
 * Même technique de chargement que pur02-http-handler.test.js (Module.wrap + eval).
 *
 * SÉCURITÉ : aucune production touchée, aucun conteneur lancé.
 */

"use strict";

const path   = require("path");
const Module = require("module");
const fs     = require("fs");

// ---------------------------------------------------------------------------
// Chemins des candidats
// ---------------------------------------------------------------------------
const LANCE_V4F_PATH = path.resolve(__dirname, "candidate-lance-index-v4f.js");
// candidate-documents.js doit être dans le même dossier que ce fichier de tests
const CANDIDATE_DOCS_PATH = path.resolve(__dirname, "candidate-documents.js");

// ---------------------------------------------------------------------------
// loadCandidateModule — identique à pur02-http-handler.test.js
// ---------------------------------------------------------------------------
function loadCandidateModule(filePath, stubs) {
  const src = fs.readFileSync(filePath, "utf8");
  const wrapped = Module.wrap(src);
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
// Fabrique d'instance LanceDb avec connect/namespaceExists contrôlés
// ---------------------------------------------------------------------------
function makeLanceDb({ namespaceExists = true, findManyRows = [], findManyError = null, tableDeleteError = null } = {}) {
  const prismaStub = {
    document_vectors: {
      findMany: findManyError
        ? jest.fn().mockRejectedValue(new Error(findManyError))
        : jest.fn().mockResolvedValue(findManyRows),
    },
  };

  const tableDeleteFn = tableDeleteError
    ? jest.fn().mockRejectedValue(new Error(tableDeleteError))
    : jest.fn().mockResolvedValue(undefined);

  const { LanceDb } = loadCandidateModule(LANCE_V4F_PATH, {
    "@lancedb/lancedb":               { connect: jest.fn() },
    "../../helpers":                  { toChunks: () => [], getEmbeddingEngineSelection: () => ({}) },
    "../../TextSplitter":             { TextSplitter: class {} },
    "../../../models/systemSettings": { SystemSettings: { getValueOrFallback: jest.fn().mockResolvedValue(null) } },
    "../../files":                    { storeVectorResult: jest.fn(), cachedVectorInformation: jest.fn().mockResolvedValue({ exists: false }) },
    uuid:                             { v4: () => "test-uuid" },
    "../../chats":                    { sourceIdentifier: () => "" },
    "../../EmbeddingRerankers/native":{ NativeEmbeddingReranker: class {} },
    "../base":                        { VectorDatabase: class { logger() {} } },
    path:                             require("path"),
    "../../../utils/prisma":          prismaStub,
  });

  const db = new LanceDb();

  // Remplace connect() pour retourner un client contrôlé
  db.connect = jest.fn().mockResolvedValue({
    client: {
      tableNames: jest.fn().mockResolvedValue(namespaceExists ? ["test-ns"] : []),
      openTable: jest.fn().mockResolvedValue({ delete: tableDeleteFn }),
    },
  });
  db.namespaceExists = jest.fn().mockResolvedValue(namespaceExists);

  return { db, prismaStub, tableDeleteFn };
}

// ---------------------------------------------------------------------------
// Suite L — deleteDocumentFromNamespace
// ---------------------------------------------------------------------------

describe("Suite L — deleteDocumentFromNamespace (candidate-lance-index-v4f)", () => {

  test("L-01 namespace absent → retourne true (no-op)", async () => {
    const { db } = makeLanceDb({ namespaceExists: false });
    const result = await db.deleteDocumentFromNamespace("absent-ns", "doc-1");
    expect(result).toBe(true);
  });

  test("L-02 namespace présent, 0 vecteur → retourne true (no-op)", async () => {
    const { db, prismaStub } = makeLanceDb({ namespaceExists: true, findManyRows: [] });
    const result = await db.deleteDocumentFromNamespace("my-ns", "doc-no-vec");
    expect(result).toBe(true);
    expect(prismaStub.document_vectors.findMany).toHaveBeenCalledWith({
      where: { docId: "doc-no-vec" },
      select: { vectorId: true },
    });
  });

  test("L-03 suppression effective → retourne true, table.delete() appelé avec bons IDs", async () => {
    const rows = [{ vectorId: "vec-1" }, { vectorId: "vec-2" }];
    const { db, tableDeleteFn } = makeLanceDb({ namespaceExists: true, findManyRows: rows });
    const result = await db.deleteDocumentFromNamespace("my-ns", "doc-xyz");
    expect(result).toBe(true);
    expect(tableDeleteFn).toHaveBeenCalledTimes(1);
    const filter = tableDeleteFn.mock.calls[0][0];
    expect(filter).toContain("vec-1");
    expect(filter).toContain("vec-2");
  });

  test("L-04 erreur SQL (findMany) → lance Error avec message SQL", async () => {
    const { db } = makeLanceDb({ namespaceExists: true, findManyError: "SQL connection lost" });
    await expect(db.deleteDocumentFromNamespace("ns", "doc"))
      .rejects.toThrow(/SQL error/);
  });

  test("L-05 erreur LanceDB (table.delete) → lance Error avec message LanceDB", async () => {
    const rows = [{ vectorId: "vec-X" }];
    const { db } = makeLanceDb({ namespaceExists: true, findManyRows: rows, tableDeleteError: "I/O error" });
    await expect(db.deleteDocumentFromNamespace("ns", "doc"))
      .rejects.toThrow(/LanceDB deletion failed/);
  });

});

// ---------------------------------------------------------------------------
// Suite R — rollback addDocuments (candidate-documents.js + LanceDb v4f)
// ---------------------------------------------------------------------------

describe("Suite R — rollback addDocuments avec LanceDb v4f", () => {

  /**
   * Charge candidate-documents.js en injectant des stubs contrôlés.
   */
  function loadDocuments({ deleteFromNsResult = true, createShouldFail = true } = {}) {
    const documentVectorsDelete = jest.fn().mockResolvedValue(true);
    const documentVectorsBulkInsert = jest.fn().mockResolvedValue(true);

    const VectorDbStub = {
      addDocumentToNamespace:        jest.fn().mockResolvedValue({ vectorized: true, error: null }),
      deleteDocumentFromNamespace:   jest.fn().mockResolvedValue(deleteFromNsResult),
    };

    const prismaStub = {
      workspace_documents: {
        create: createShouldFail
          ? jest.fn().mockRejectedValue(new Error("DB constraint violation"))
          : jest.fn().mockResolvedValue({ id: 42 }),
      },
    };

    const { Document } = loadCandidateModule(CANDIDATE_DOCS_PATH, {
      uuid:                      { v4: () => "stub-uuid-" + Math.random().toString(36).slice(2) },
      "../utils/helpers":        { getVectorDbClass: () => VectorDbStub },
      "../utils/prisma":         prismaStub,
      "./telemetry":             { Telemetry: { sendTelemetry: jest.fn().mockResolvedValue(undefined) } },
      "./eventLogs":             { EventLogs: { logEvent: jest.fn().mockResolvedValue(undefined) } },
      "../utils/http":           { safeJsonParse: (s, d) => { try { return JSON.parse(s); } catch { return d; } } },
      "../endpoints/utils":      { getModelTag: () => "test-model" },
      "../utils/files":          {
        fileData: jest.fn().mockResolvedValue({
          pageContent: "Contenu de test",
          title: "test.txt",
          docId: "original-doc-id",
        }),
      },
      "../utils/EmbeddingWorkerManager": { emitProgress: jest.fn() },
      "./vectors":               { DocumentVectors: { delete: documentVectorsDelete, bulkInsert: documentVectorsBulkInsert } },
    });

    return { Document, VectorDbStub, prismaStub, documentVectorsDelete, documentVectorsBulkInsert };
  }

  test("R-01 rollback : create() échoue, LanceDB retourne true → DocumentVectors.delete() appelé", async () => {
    const { Document, documentVectorsDelete } = loadDocuments({ deleteFromNsResult: true });
    const workspace = { id: 1, slug: "ws-test", name: "Test WS" };

    await Document.addDocuments(workspace, ["docs/test.txt"]);

    expect(documentVectorsDelete).toHaveBeenCalledTimes(1);
    expect(documentVectorsDelete).toHaveBeenCalledWith(expect.objectContaining({ docId: expect.any(String) }));
  });

  test("R-02 test intégré : v4f réel (namespace absent) + rollback addDocuments → DocumentVectors.delete() appelé", async () => {
    // Ce test exerce la vraie deleteDocumentFromNamespace() de v4f
    // (contrairement à R-01 qui stubbe directement le résultat).
    // Avant v4f : namespaceExists=false → return false → vectorsRemoved=false → SQL skip
    // Après v4f  : namespaceExists=false → return true → vectorsRemoved=true → SQL nettoyé

    // 1. Charger la vraie LanceDb v4f et mocker connect/namespaceExists
    const { LanceDb } = loadCandidateModule(LANCE_V4F_PATH, {
      "@lancedb/lancedb":               { connect: jest.fn() },
      "../../helpers":                  { toChunks: () => [], getEmbeddingEngineSelection: () => ({}) },
      "../../TextSplitter":             { TextSplitter: class {} },
      "../../../models/systemSettings": { SystemSettings: { getValueOrFallback: jest.fn().mockResolvedValue(null) } },
      "../../files":                    { storeVectorResult: jest.fn(), cachedVectorInformation: jest.fn().mockResolvedValue({ exists: false }) },
      uuid:                             { v4: () => "test-uuid" },
      "../../chats":                    { sourceIdentifier: () => "" },
      "../../EmbeddingRerankers/native":{ NativeEmbeddingReranker: class {} },
      "../base":                        { VectorDatabase: class { logger() {} } },
      path:                             require("path"),
      "../../../utils/prisma":          { document_vectors: { findMany: jest.fn() } },
    });

    const lanceInstance = new LanceDb();
    lanceInstance.connect = jest.fn().mockResolvedValue({ client: {} });
    lanceInstance.namespaceExists = jest.fn().mockResolvedValue(false); // namespace absent
    lanceInstance.addDocumentToNamespace = jest.fn().mockResolvedValue({ vectorized: true, error: null });

    const documentVectorsDelete = jest.fn().mockResolvedValue(true);

    // 2. Injecter cette instance réelle dans candidate-documents
    const { Document } = loadCandidateModule(CANDIDATE_DOCS_PATH, {
      uuid:                      { v4: () => "stub-uuid-" + Math.random().toString(36).slice(2) },
      "../utils/helpers":        { getVectorDbClass: () => lanceInstance },
      "../utils/prisma":         {
        workspace_documents: { create: jest.fn().mockRejectedValue(new Error("DB constraint violation")) },
      },
      "./telemetry":             { Telemetry: { sendTelemetry: jest.fn().mockResolvedValue(undefined) } },
      "./eventLogs":             { EventLogs: { logEvent: jest.fn().mockResolvedValue(undefined) } },
      "../utils/http":           { safeJsonParse: (s, d) => { try { return JSON.parse(s); } catch { return d; } } },
      "../endpoints/utils":      { getModelTag: () => "test-model" },
      "../utils/files":          {
        fileData: jest.fn().mockResolvedValue({ pageContent: "Contenu de test", title: "t.txt", docId: "d1" }),
      },
      "../utils/EmbeddingWorkerManager": { emitProgress: jest.fn() },
      "./vectors":               { DocumentVectors: { delete: documentVectorsDelete, bulkInsert: jest.fn().mockResolvedValue(true) } },
    });

    // 3. Déclencher le rollback
    await Document.addDocuments({ id: 2, slug: "ws-new", name: "New WS" }, ["docs/another.txt"]);

    // La vraie deleteDocumentFromNamespace a été appelée via namespaceExists (preuve du chaînage)
    expect(lanceInstance.namespaceExists).toHaveBeenCalled();
    // Elle a retourné true (fix v4f) → SQL nettoyé
    expect(documentVectorsDelete).toHaveBeenCalledTimes(1);
  });

  test("R-03 contrôle négatif : LanceDB lève une exception → DocumentVectors.delete() NON appelé", async () => {
    const documentVectorsDelete = jest.fn().mockResolvedValue(true);
    const VectorDbStub = {
      addDocumentToNamespace:      jest.fn().mockResolvedValue({ vectorized: true, error: null }),
      deleteDocumentFromNamespace: jest.fn().mockRejectedValue(new Error("LanceDB unavailable")),
    };

    const { Document } = loadCandidateModule(CANDIDATE_DOCS_PATH, {
      uuid:                      { v4: () => "stub-uuid-" + Math.random().toString(36).slice(2) },
      "../utils/helpers":        { getVectorDbClass: () => VectorDbStub },
      "../utils/prisma":         {
        workspace_documents: { create: jest.fn().mockRejectedValue(new Error("create failed")) },
      },
      "./telemetry":             { Telemetry: { sendTelemetry: jest.fn().mockResolvedValue(undefined) } },
      "./eventLogs":             { EventLogs: { logEvent: jest.fn().mockResolvedValue(undefined) } },
      "../utils/http":           { safeJsonParse: (s, d) => { try { return JSON.parse(s); } catch { return d; } } },
      "../endpoints/utils":      { getModelTag: () => "test-model" },
      "../utils/files":          {
        fileData: jest.fn().mockResolvedValue({ pageContent: "content", title: "f.txt", docId: "d1" }),
      },
      "../utils/EmbeddingWorkerManager": { emitProgress: jest.fn() },
      "./vectors":               { DocumentVectors: { delete: documentVectorsDelete, bulkInsert: jest.fn().mockResolvedValue(true) } },
    });

    const workspace = { id: 3, slug: "ws-err", name: "Err WS" };
    await Document.addDocuments(workspace, ["docs/file.txt"]);

    // LanceDB a lancé une exception → le bloc catch absorbe et ne touche pas SQL
    expect(documentVectorsDelete).not.toHaveBeenCalled();
  });

});
