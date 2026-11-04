const fs = require("fs");
const path = require("path");
const {
  purgeVectorCache,
  purgeSourceDocument,
  normalizePath,
  isWithin,
  documentsPath,
} = require(".");
const { Document } = require("../../models/documents");
const prisma = require("../../utils/prisma");

/**
 * PUR-02 helper: fetch all workspaces with strict error propagation.
 * Workspace.where() absorbs Prisma errors and returns [] — indistinguishable
 * from "no workspaces". A SQL failure here must abort the purge so the source
 * file is not deleted without having verified workspace associations.
 */
async function _getWorkspacesStrict() {
  return await prisma.workspaces.findMany();
}

/**
 * PUR-02-E PATCH: creates a typed error for purgeFolder validation failures.
 *
 * Both HTTP route handlers read err.statusCode and err.code to produce a
 * non-2xx response. Every validation rejection in purgeFolder must carry these
 * properties so the handler can distinguish "folder protected" (403) from
 * "folder not found" (404) from "unexpected content" (400).
 *
 * Without this, the handler falls through to response.status(200).json(result)
 * with result === undefined, producing a false HTTP success.
 *
 * @param {number} statusCode - HTTP status code to forward to the route handler
 * @param {string} code - Machine-readable error code
 * @param {string} message - Human-readable description
 * @returns {Error}
 */
function folderError(statusCode, code, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

/**
 * PUR-02 PATCH: purgeDocument
 *
 * Changes vs original:
 * The original deleted the vector cache and the source document file BEFORE
 * removing workspace associations (SQL + LanceDB vectors). If the association
 * cleanup failed, the source data was already gone and the operation could not
 * be retried.
 *
 * New order:
 * 1. Remove workspace document associations and LanceDB vectors for all
 *    workspaces (requires source file only for path lookup — the file itself
 *    does not need to be readable at this stage).
 * 2. Remove the vector cache file.
 * 3. Remove the source document file.
 *
 * If step 1 throws, steps 2 and 3 are not reached, so the source file is
 * preserved and the purge can be retried.
 *
 * Residual limit: removeDocuments() may throw partway through the workspace
 * list (e.g. SQL error on workspace N after LanceDB cleaned workspace N-1).
 * In that case the source file is preserved but some workspaces are partially
 * cleaned. The caller should log and surface this condition.
 */
async function purgeDocument(filename = null) {
  if (!filename) return;
  // Normalize once; use the canonical path for every subsequent operation so
  // that SQL associations, the vector cache, and the source file all agree on
  // the same identifier.  A non-conforming path is rejected immediately.
  const normalized = normalizePath(filename);
  if (!normalized) return;

  // Step 1: Remove workspace associations and LanceDB vectors first.
  // Use _getWorkspacesStrict() so a SQL failure throws rather than being
  // silently treated as "no workspaces" (Workspace.where() absorbs errors).
  let workspaces;
  try {
    workspaces = await _getWorkspacesStrict();
  } catch (sqlError) {
    throw new Error(
      `[purgeDocument] SQL error fetching workspaces: ${sqlError.message}`
    );
  }
  for (const workspace of workspaces) {
    await Document.removeDocuments(workspace, [normalized]);
  }

  // Step 2: Remove the vector cache (safe to delete now; association cleanup
  // completed successfully).
  await purgeVectorCache(normalized);

  // Step 3: Remove the source document file.
  await purgeSourceDocument(normalized);
  return;
}

/**
 * PUR-02 PATCH: purgeFolder
 *
 * Changes vs original:
 * 1. Rejects the folder if it contains nested subdirectories or symbolic links.
 *    The function is documented as non-recursive and must only contain flat
 *    regular files. Unexpected entries abort the operation with a typed error.
 * 2. Rejects top-level symlinks when building the list of removable folders.
 * 3. Collects cleanup errors (purgeVectorCache + removeDocuments) instead of
 *    swallowing them via unhandled Promise rejections. If any cleanup step
 *    fails, the folder is NOT deleted so the operation can be retried.
 * 4. Deletes files individually with unlinkSync, then removes the now-empty
 *    directory with rmdirSync (which refuses to delete a non-empty directory),
 *    replacing the original fs.rmSync({ recursive: true }) that would
 *    unconditionally recurse into any content regardless of what was cleaned.
 *
 * PUR-02-E FIX (error contract):
 * All early-exit paths now throw a typed error (folderError) instead of
 * returning undefined. This ensures the HTTP route handler can propagate the
 * correct non-2xx status instead of sending HTTP 200 with an empty body.
 *
 *   400 FOLDER_NAME_REQUIRED    — folderName is null, empty, or not a string
 *   400 FOLDER_NAME_INVALID     — folderName contains path separators (/,\) or equals "." or ".."
 *   400 FOLDER_OUTSIDE_DOCUMENTS — normalized path resolves outside the documents directory
 *   400 FOLDER_UNEXPECTED_ENTRIES — subdir or symlink found inside folder
 *   403 FOLDER_PROTECTED        — custom-documents or non-removable directory
 *   404 FOLDER_NOT_FOUND        — folder path does not exist on disk
 *
 * On success the function returns an explicit result object so the handler
 * can send a meaningful HTTP 200 body rather than serializing undefined.
 *
 * Residual limits:
 * - Prisma and LanceDB are not transactional together. A partial failure
 *   inside removeDocuments() leaves an inconsistent state that is logged but
 *   cannot be automatically remediated here.
 * - purgeVectorCache and removeDocuments are called sequentially per file /
 *   per workspace to avoid obscuring individual failures in a parallel fan-out.
 *
 * @param {string} folderName - The name/path of the folder to purge.
 * @returns {Promise<{success: true, message: string}>}
 */
async function purgeFolder(folderName = null) {
  // PUR-02-E fix #1: reject missing or invalid folder name with 400
  if (!folderName || typeof folderName !== "string" || !folderName.trim())
    throw folderError(
      400,
      "FOLDER_NAME_REQUIRED",
      "[purgeFolder] folderName must be a non-empty string."
    );

  // PUR-02-E fix #1b: reject path separators and traversal sequences before
  // normalizePath can silently transform them into valid-looking folder names.
  //
  // Background: normalizePath("../secret") strips the leading "../" and returns
  // "secret". If documents/secret is a removable folder, that traversal input
  // would trigger its deletion — a silent semantic confusion even though no path
  // escape occurs (isWithin would catch a true escape). The API contract is that
  // folderName must be a plain top-level name, not a path expression.
  //
  // Fix: reject any input that contains path separators (/ or \) or equals "."
  // or "..". This prevents the input from reaching normalizePath, isWithin, or
  // any filesystem operation.
  //
  // Side-effect: "." is now rejected with FOLDER_NAME_INVALID (400) instead of
  // triggering normalizePath to throw Error("Invalid path.") without a statusCode
  // (which the HTTP handler mapped to 500). This fixes open defect O-1.
  const trimmedFolderName = folderName.trim();
  if (
    /[/\\]/.test(trimmedFolderName) ||
    trimmedFolderName === ".." ||
    trimmedFolderName === "."
  ) {
    throw folderError(
      400,
      "FOLDER_NAME_INVALID",
      `[purgeFolder] "${trimmedFolderName}" is not a valid top-level folder name (contains path separators or traversal sequences).`
    );
  }

  const subFolder = normalizePath(folderName);
  const subFolderPath = path.resolve(documentsPath, subFolder);

  // Build the list of removable top-level folders. custom-documents and
  // symbolic links are excluded.
  const validRemovableSubFolders = fs
    .readdirSync(documentsPath)
    .map((folder) => {
      if (folder === "custom-documents") return null;
      const subfolderPath = path.resolve(documentsPath, folder);
      const stat = fs.lstatSync(subfolderPath);
      // Reject symbolic links at the top level as well as non-directories.
      if (stat.isSymbolicLink() || !stat.isDirectory()) return null;
      return folder;
    })
    .filter((subFolder) => !!subFolder);

  // PUR-02-E fix #2: replace the combined silent return with three typed throws.
  // Order: traversal check first, then existence, then allowlist.
  // NOTE: readdirSync(documentsPath) above reads only the fixed documents root
  // (a trusted constant, not the caller-supplied path), so it is not a traversal
  // risk. The first access to the caller-supplied subFolderPath is existsSync
  // below, after isWithin has confirmed it is within documentsPath.
  if (!isWithin(documentsPath, subFolderPath))
    throw folderError(
      400,
      "FOLDER_OUTSIDE_DOCUMENTS",
      `[purgeFolder] "${subFolder}" is outside the documents directory.`
    );
  if (!fs.existsSync(subFolderPath))
    throw folderError(
      404,
      "FOLDER_NOT_FOUND",
      `[purgeFolder] Folder "${subFolder}" was not found.`
    );
  if (!validRemovableSubFolders.includes(subFolder))
    throw folderError(
      403,
      "FOLDER_PROTECTED",
      `[purgeFolder] "${subFolder}" is protected or is not a removable folder.`
    );

  // Reject folders that contain nested subdirectories or symbolic links.
  // purgeFolder is documented as non-recursive and is only safe to use with
  // flat collections of regular files.
  const entries = fs.readdirSync(subFolderPath, { withFileTypes: true });
  const unexpected = entries.filter(
    (e) => !e.isFile() || e.isSymbolicLink()
  );
  // PUR-02-E fix #3: throw instead of log+return so the HTTP handler propagates
  // a 400 rather than a false HTTP 200.
  if (unexpected.length > 0) {
    const names = unexpected.map((e) => e.name).join(", ");
    throw folderError(
      400,
      "FOLDER_UNEXPECTED_ENTRIES",
      `[purgeFolder] "${subFolder}" contains unexpected entries (subdirectories or symlinks): ${names}.`
    );
  }

  const filenames = entries.map((e) =>
    path.join(subFolderPath, e.name).replace(documentsPath + "/", "")
  );

  // Use _getWorkspacesStrict() so a SQL failure throws rather than being
  // silently treated as "no workspaces" (Workspace.where() absorbs errors).
  let workspaces;
  try {
    workspaces = await _getWorkspacesStrict();
  } catch (sqlError) {
    console.error(
      `[purgeFolder] SQL error fetching workspaces — folder NOT deleted:`,
      sqlError.message
    );
    throw new Error(
      `[purgeFolder] SQL error fetching workspaces: ${sqlError.message}`
    );
  }

  // Collect cleanup errors; if any step fails, abort folder deletion so the
  // operation can be retried without losing source data.
  const cleanupErrors = [];

  // Remove workspace document associations and LanceDB vectors FIRST.
  // Vector caches are deleted afterwards so that a cache is only lost once
  // the SQL and LanceDB state it describes has been cleaned.
  for (const workspace of workspaces) {
    try {
      await Document.removeDocuments(workspace, filenames);
    } catch (err) {
      cleanupErrors.push(
        `removeDocuments(${workspace.slug}): ${err.message}`
      );
    }
  }

  // PUR-02 v3: early-exit after association cleanup.
  // purgeVectorCache must NOT run if any workspace association cleanup failed.
  // Without this check, caches would be deleted even in partial-failure state,
  // making the operation harder to retry (the vector cache describes the SQL /
  // LanceDB state and should only be removed once that state is fully clean).
  if (cleanupErrors.length > 0) {
    console.error(
      `[purgeFolder] Association cleanup errors in ${subFolder} — caches and folder NOT deleted:`,
      cleanupErrors
    );
    throw new Error(
      `[purgeFolder] Association cleanup errors in ${subFolder}: ${cleanupErrors.join("; ")}`
    );
  }

  for (const filename of filenames) {
    try {
      await purgeVectorCache(filename);
    } catch (err) {
      cleanupErrors.push(`purgeVectorCache(${filename}): ${err.message}`);
    }
  }

  if (cleanupErrors.length > 0) {
    console.error(
      `[purgeFolder] Cache purge errors in ${subFolder} — folder NOT deleted:`,
      cleanupErrors
    );
    throw new Error(
      `[purgeFolder] Cache purge errors in ${subFolder}: ${cleanupErrors.join("; ")}`
    );
  }

  // All cleanup steps succeeded. Delete files individually to avoid any
  // implicit recursion into unexpected content, then remove the empty folder.
  for (const entry of entries) {
    fs.unlinkSync(path.join(subFolderPath, entry.name));
  }
  // rmdirSync (without recursive) only succeeds on an empty directory,
  // providing a final safety check against unexpected residual content.
  fs.rmdirSync(subFolderPath);

  // PUR-02-E fix: explicit success return so the HTTP handler serializes a
  // meaningful body instead of undefined (which becomes HTTP 200 + empty body).
  return { success: true, message: `Folder "${subFolder}" purged successfully.` };
}

module.exports = {
  purgeDocument,
  purgeFolder,
};
