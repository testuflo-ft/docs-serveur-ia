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
const { Workspace } = require("../../models/workspace");

async function purgeDocument(filename = null) {
  if (!filename || !normalizePath(filename)) return;

  await purgeVectorCache(filename);
  await purgeSourceDocument(filename);
  const workspaces = await Workspace.where();
  for (const workspace of workspaces) {
    await Document.removeDocuments(workspace, [filename]);
  }
  return;
}

/**
 * Purge a folder and all its contents. This will also remove all vector-cache files and workspace document associations
 * for the documents within the folder.
 * @notice This function recursively purges the specified folder and its contents.
 * @notice You cannot purge the `custom-documents` folder.
 * @param {string} folderName - The name/path of the folder to purge.
 * @returns {Promise<void>}
 */
async function purgeFolder(folderName = null) {
  const fail = (statusCode, code, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    throw error;
  };

  if (typeof folderName !== "string" || !folderName.trim())
    fail(400, "INVALID_FOLDER_NAME", "A folder name must be provided.");

  const rawName = folderName.trim();

  // Only a single direct-child folder name is accepted; do not normalize
  // traversal segments into a seemingly valid name.
  if (
    rawName === "." ||
    rawName === ".." ||
    rawName.includes("/") ||
    rawName.includes("\\") ||
    path.isAbsolute(rawName)
  )
    fail(400, "INVALID_FOLDER_PATH", "Only a top-level folder name is allowed.");

  if (rawName === "custom-documents")
    fail(403, "FOLDER_PROTECTED", 'The "custom-documents" folder is protected.');

  let subFolder;
  try {
    subFolder = normalizePath(rawName);
  } catch {
    fail(400, "INVALID_FOLDER_PATH", "The folder name is invalid.");
  }

  if (subFolder !== rawName)
    fail(400, "INVALID_FOLDER_PATH", "The folder name is invalid.");

  const subFolderPath = path.resolve(documentsPath, subFolder);
  if (!isWithin(documentsPath, subFolderPath))
    fail(400, "INVALID_FOLDER_PATH", "The folder path is outside the documents directory.");

  if (!fs.existsSync(subFolderPath))
    fail(404, "FOLDER_NOT_FOUND", "The requested folder does not exist.");

  const folderStat = fs.lstatSync(subFolderPath);
  if (!folderStat.isDirectory() || folderStat.isSymbolicLink())
    fail(400, "INVALID_FOLDER_TYPE", "The requested path is not an allowed directory.");

  const filenames = [];
  function collectFiles(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isSymbolicLink())
        fail(400, "UNSUPPORTED_FOLDER_ENTRY", "Symbolic links are not allowed in a folder being purged.");
      if (entry.isDirectory()) collectFiles(fullPath);
      else if (entry.isFile()) filenames.push(path.relative(documentsPath, fullPath));
      else fail(400, "UNSUPPORTED_FOLDER_ENTRY", "Unsupported entry type in folder being purged.");
    }
  }

  collectFiles(subFolderPath);
  const workspaces = await Workspace.where();

  const purgePromises = [];
  for (const filename of filenames)
    purgePromises.push(purgeVectorCache(filename));
  for (const workspace of workspaces)
    purgePromises.push(Document.removeDocuments(workspace, filenames));

  // A rejection prevents final folder removal. Earlier cleanup operations
  // may already have completed; this function is not transactional.
  await Promise.all(purgePromises);
  fs.rmSync(subFolderPath, { recursive: true });

  return { success: true, message: "Folder removed successfully" };
}
module.exports = {
  purgeDocument,
  purgeFolder,
};
