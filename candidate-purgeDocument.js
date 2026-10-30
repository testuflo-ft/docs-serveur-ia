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
  if (!filename || !normalizePath(filename)) return;

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
    await Document.removeDocuments(workspace, [filename]);
  }

  // Step 2: Remove the vector cache (safe to delete now; association cleanup
  // completed successfully).
  await purgeVectorCache(filename);

  // Step 3: Remove the source document file.
  await purgeSourceDocument(filename);
  return;
}

/**
 * PUR-02 PATCH: purgeFolder
 *
 * Changes vs original:
 * 1. Rejects the folder if it contains nested subdirectories or symbolic links.
 *    The function is documented as non-recursive and must only contain flat
 *    regular files. Unexpected entries abort the operation with an error log.
 * 2. Rejects top-level symlinks when building the list of removable folders.
 * 3. Collects cleanup errors (purgeVectorCache + removeDocuments) instead of
 *    swallowing them via unhandled Promise rejections. If any cleanup step
 *    fails, the folder is NOT deleted so the operation can be retried.
 * 4. Deletes files individually with unlinkSync, then removes the now-empty
 *    directory with rmdirSync (which refuses to delete a non-empty directory),
 *    replacing the original fs.rmSync({ recursive: true }) that would
 *    unconditionally recurse into any content regardless of what was cleaned.
 *
 * Residual limits:
 * - Prisma and LanceDB are not transactional together. A partial failure
 *   inside removeDocuments() leaves an inconsistent state that is logged but
 *   cannot be automatically remediated here.
 * - purgeVectorCache and removeDocuments are called sequentially per file /
 *   per workspace to avoid obscuring individual failures in a parallel fan-out.
 *
 * @param {string} folderName - The name/path of the folder to purge.
 * @returns {Promise<void>}
 */
async function purgeFolder(folderName = null) {
  if (!folderName) return;
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

  if (
    !validRemovableSubFolders.includes(subFolder) ||
    !fs.existsSync(subFolderPath) ||
    !isWithin(documentsPath, subFolderPath)
  )
    return;

  // Reject folders that contain nested subdirectories or symbolic links.
  // purgeFolder is documented as non-recursive and is only safe to use with
  // flat collections of regular files.
  const entries = fs.readdirSync(subFolderPath, { withFileTypes: true });
  const unexpected = entries.filter(
    (e) => !e.isFile() || e.isSymbolicLink()
  );
  if (unexpected.length > 0) {
    console.error(
      `[purgeFolder] ${subFolder} contains unexpected entries ` +
        `(subdirectories or symlinks): ` +
        `${unexpected.map((e) => e.name).join(", ")}. Aborting.`
    );
    return;
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
    return;
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

  for (const filename of filenames) {
    try {
      await purgeVectorCache(filename);
    } catch (err) {
      cleanupErrors.push(`purgeVectorCache(${filename}): ${err.message}`);
    }
  }

  if (cleanupErrors.length > 0) {
    console.error(
      `[purgeFolder] Cleanup errors in ${subFolder} — folder NOT deleted:`,
      cleanupErrors
    );
    return;
  }

  // All cleanup steps succeeded. Delete files individually to avoid any
  // implicit recursion into unexpected content, then remove the empty folder.
  for (const entry of entries) {
    fs.unlinkSync(path.join(subFolderPath, entry.name));
  }
  // rmdirSync (without recursive) only succeeds on an empty directory,
  // providing a final safety check against unexpected residual content.
  fs.rmdirSync(subFolderPath);

  return;
}

module.exports = {
  purgeDocument,
  purgeFolder,
};
