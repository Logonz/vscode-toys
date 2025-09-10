import * as vscode from "vscode";
import path from "path";
import fs from "fs";
import { printChannelOutput } from "../extension";
import deindent from "deindent";

// Static mappings from icon theme definition
const iconDefinitions = new Map<string, vscode.Uri>();
const iconFileNames = new Map<string, vscode.Uri>();
const iconFolderNames = new Map<string, vscode.Uri>();
const iconLanguageIds = new Map<string, vscode.Uri>();
const iconFileExtensions = new Map<string, vscode.Uri>();

// Runtime performance caches
const extensionToIcon = new Map<string, vscode.Uri>(); // Smart cache: theme definitions + learned mappings
const filePathToIcon = new Map<string, vscode.Uri>(); // File path → icon cache for instant lookups
const extensionsWithoutIcons = new Set<string>(); // Extensions we've checked but found no icon for
let iconCacheStats = { hits: 0, misses: 0, extensionHits: 0, quickExits: 0 };

/**
 * Loads icon theme from VS Code and populates static mapping caches.
 * Reads the active icon theme's JSON file and builds lookup maps for fast icon resolution.
 */
export function LoadIcons() {
  // Clear all caches to ensure clean state (important for theme switches or reloading)
  iconDefinitions.clear();
  iconFileNames.clear();
  iconFolderNames.clear();
  iconLanguageIds.clear();
  iconFileExtensions.clear();
  extensionToIcon.clear();
  filePathToIcon.clear();
  extensionsWithoutIcons.clear();
  iconCacheStats = { hits: 0, misses: 0, extensionHits: 0, quickExits: 0 };

  printChannelOutput("Loading icons", false);
  const configuration = vscode.workspace.getConfiguration();

  console.log(configuration, configuration.workbench.iconTheme);

  // The full extension
  let iconTheme: vscode.Extension<any> | null = null;

  for (let index = 0; index < vscode.extensions.all.length; index++) {
    const ext = vscode.extensions.all[index];
    const iconThemes = ext.packageJSON?.contributes?.iconThemes;
    if (
      ext.id.includes(configuration.workbench.iconTheme) ||
      (iconThemes && iconThemes.length > 0 && iconThemes[0]?.id?.includes(configuration.workbench.iconTheme))
    ) {
      // Print extensions, this contains packageJSON and the path to the extension
      console.log("Extension found:", ext);
      iconTheme = ext;
      break;
    }
  }

  console.log("IconTheme", iconTheme);

  if (iconTheme) {
    const iconContributions = iconTheme.packageJSON.contributes.iconThemes[0];
    const iconExtPath = iconTheme.extensionUri.fsPath;
    console.log("iconExtPath", iconExtPath);

    const iconJSONPath = path.join(iconExtPath, iconContributions.path);
    console.log("iconJSONPath", iconJSONPath);

    // Parse the JSON file
    // Read and parse the JSON file
    try {
      const iconJSONContent = fs.readFileSync(iconJSONPath, "utf8");
      const iconJSON = JSON.parse(iconJSONContent);

      let warnUserThatIconPackIsNotSupported = false;
      // Example: Iterate through icon definitions
      if (iconJSON.iconDefinitions) {
        Object.entries(iconJSON.iconDefinitions).forEach(([key, value]: any) => {
          // console.log(`Icon: ${key}`, path.join(path.dirname(iconJSONPath), value.iconPath));
          // console.log(`Icon: ${key}`, vscode.Uri.file(path.join(path.dirname(iconJSONPath), value.iconPath)));
          if (value.iconPath) {
            iconDefinitions.set(key, vscode.Uri.file(path.join(path.dirname(iconJSONPath), value.iconPath)));
            // console.log(value.iconPath);
          } else if (value.fontCharacter) {
            warnUserThatIconPackIsNotSupported = true;
            return;
          }
        });
      }
      if (warnUserThatIconPackIsNotSupported) {
        vscode.window
          .showErrorMessage(deindent`Icon packs that use fonts rather than SVGs are not supported (e.g. vscode-seti which is default)

          Use something like "Material Icon Theme" or "vscode-icons" instead.

          See issue: https://github.com/microsoft/vscode/issues/59826 for more information
          `);
      }

      // TODO: Should we always tolower the key or not?
      if (iconJSON.fileExtensions) {
        Object.entries(iconJSON.fileExtensions).forEach(([key, value]: any) => {
          const iconDefinitionKey = value;
          const icon = iconDefinitions.get(iconDefinitionKey);
          if (icon) {
            iconFileExtensions.set(key, icon);
            extensionToIcon.set(key, icon);
          }
        });
      }
      if (iconJSON.fileNames) {
        Object.entries(iconJSON.fileNames).forEach(([key, value]: any) => {
          const iconDefinitionKey = value;
          const icon = iconDefinitions.get(iconDefinitionKey);
          if (icon) {
            iconFileNames.set(key, icon);
          }
        });
      }
      if (iconJSON.folderNames) {
        Object.entries(iconJSON.folderNames).forEach(([key, value]: any) => {
          const iconDefinitionKey = value;
          const icon = iconDefinitions.get(iconDefinitionKey);
          if (icon) {
            iconFolderNames.set(key, icon);
          }
        });
      }
      if (iconJSON.languageIds) {
        Object.entries(iconJSON.languageIds).forEach(([key, value]: any) => {
          const iconDefinitionKey = value;
          const icon = iconDefinitions.get(iconDefinitionKey);
          if (icon) {
            iconLanguageIds.set(key, icon);
          }
        });
      }

      // Add more logic to process the iconJSON as needed
    } catch (error) {
      console.error(`Error reading or parsing icon JSON file: ${error}`);
    }
  }
  printChannelOutput("Icons loaded", false);
  console.log("iconDefinitions length:", iconDefinitions.size);
  console.log("iconFileNames length:", iconFileNames.size);
  console.log("iconFolderNames length:", iconFolderNames.size);
  console.log("iconLanguageIds length:", iconLanguageIds.size);
  console.log("iconFileExtensions length:", iconFileExtensions.size);
  console.log("extensionToIcon cache size:", extensionToIcon.size);
}

/**
 * Fast synchronous icon lookup using cached mappings.
 * Checks file path cache first, then extension cache, avoiding expensive file I/O.
 * Internal function - use GetIconForFile() for consistent behavior.
 * @param file - File URI to get icon for
 * @returns Icon URI if cached, undefined if cache miss
 */
function FastGetIconForFileSync(file: vscode.Uri): vscode.Uri | undefined {
  const cached = filePathToIcon.get(file.fsPath);
  if (cached) {
    iconCacheStats.hits++;
    return cached;
  }

  // Get file extension
  const fileExtension = path.extname(file.fsPath).toLowerCase();
  if (binaryFileExtensions.has(fileExtension)) {
    return undefined;
  }
  // Quick exit if we've already determined this extension has no icon
  if (extensionsWithoutIcons.has(fileExtension)) {
    iconCacheStats.quickExits++;
    return undefined;
  }
  // Create all possible variations for lookup
  const fileExtensionWithoutDot = fileExtension.slice(1); // Remove the dot
  const fileName = path.basename(file.fsPath);
  const dotFileNameWithoutDot = fileName.startsWith(".") ? fileName.slice(1) : undefined;

  let icon: vscode.Uri | undefined;

  // TODO: Remove this debug output
  let whereFound = "";

  // Check for full file name match
  if (iconFileNames.has(fileName)) {
    whereFound = "fileName";
    icon = iconFileNames.get(fileName);
  }
  // Test for things such as .vscodeignore, gitlab-ci.yml and other files that start with a dot
  else if (dotFileNameWithoutDot && extensionToIcon.has(dotFileNameWithoutDot)) {
    whereFound = "dotFileNameExtension";
    icon = extensionToIcon.get(dotFileNameWithoutDot);
    iconCacheStats.extensionHits++;
  }
  // Test if the full filename exists in extensionToIcon (Some files do)
  else if (fileName && extensionToIcon.has(fileName)) {
    whereFound = "fileNameExtension";
    icon = extensionToIcon.get(fileName);
    iconCacheStats.extensionHits++;
  }
  // Check for learned extension match
  else if (extensionToIcon.has(fileExtensionWithoutDot)) {
    whereFound = "extension";
    icon = extensionToIcon.get(fileExtensionWithoutDot);
    iconCacheStats.extensionHits++;
  }

  if (icon == undefined) {
    // Output all variables we use to search
    console.log(`[vstoys-icons] File: ${file.fsPath} - Search variables:`);
    console.log(`[vstoys-icons]   fileExtension: ${fileExtension}`);
    console.log(`[vstoys-icons]   fileExtensionWithoutDot: ${fileExtensionWithoutDot}`);
    console.log(`[vstoys-icons]   fileName: ${fileName}`);
    console.log(`[vstoys-icons]   dotFileNameWithoutDot: ${dotFileNameWithoutDot}`);
  }

  if (icon) {
    filePathToIcon.set(file.fsPath, icon);
    return icon;
  }

  iconCacheStats.misses++;
  return undefined;
}

/**
 * Full icon resolution with fallback to language ID analysis.
 * First tries sync cache lookup, then opens file to determine language ID for icon mapping.
 * Updates both file path and extension caches for future performance.
 * @param file - File URI to get icon for
 * @returns Icon URI if found, undefined otherwise
 */
export async function GetIconForFile(file: vscode.Uri): Promise<vscode.Uri | undefined> {
  const syncResult = FastGetIconForFileSync(file);
  if (syncResult) {
    return syncResult;
  }

  const fileExtension = path.extname(file.fsPath).toLowerCase();
  const fileExtensionWithoutDot = fileExtension.slice(1); // Remove the dot

  if (binaryFileExtensions.has(fileExtension)) {
    return undefined;
  }

  // Quick exit if we've already determined this extension has no icon
  if (extensionsWithoutIcons.has(fileExtension)) {
    iconCacheStats.quickExits++;
    return undefined;
  }

  try {
    console.log(`Opening file: ${file.fsPath}` + (fileExtension ? ` (ext: ${fileExtensionWithoutDot})` : ""));
    const fileDoc = await vscode.workspace.openTextDocument(file);

    let gIcon: vscode.Uri | undefined = undefined;
    if (iconLanguageIds.has(fileDoc.languageId)) {
      gIcon = iconLanguageIds.get(fileDoc.languageId);
    }
    if (!gIcon && iconFileExtensions.has(fileExtensionWithoutDot)) {
      gIcon = iconFileExtensions.get(fileExtensionWithoutDot);
    }
    if (!gIcon && iconFolderNames.has(path.basename(fileDoc.fileName))) {
      gIcon = iconFolderNames.get(path.basename(fileDoc.fileName));
    }
    if (!gIcon && iconDefinitions.has(fileDoc.languageId)) {
      gIcon = iconDefinitions.get(fileDoc.languageId);
    }

    if (gIcon) {
      filePathToIcon.set(file.fsPath, gIcon);
      if (!extensionToIcon.has(fileExtensionWithoutDot)) {
        extensionToIcon.set(fileExtensionWithoutDot, gIcon);
      }
      return gIcon;
    } else {
      console.log(`No icon found for ${fileDoc.fileName}`);
      // Cache this extension as having no icon to avoid future expensive lookups
      if (fileExtension) {
        extensionsWithoutIcons.add(fileExtension);
      }
      return undefined;
    }
  } catch (error: any) {
    // Check if this is a binary file error from VS Code
    // We check multiple indicators to be locale-independent:
    // 1. Error name/code (should be consistent across locales)
    // 2. Common English keywords in message (fallback)
    const errorMessage = error.message?.toLowerCase() || "";
    const isBinaryFileError =
      // Primary indicators (should be locale-independent)
      error.name === "CodeExpectedError" ||
      error.code === "BINARY_FILE_NOT_DISPLAYABLE" ||
      // Secondary indicators (English keywords as fallback)
      errorMessage.includes("binary") ||
      errorMessage.includes("cannot be opened as text") ||
      errorMessage.includes("seems to be binary");

    if (isBinaryFileError && fileExtension) {
      console.log(
        `[vstoys-icons] Detected binary file format: ${fileExtension} (${path.basename(
          file.fsPath
        )}) - adding to blacklist`
      );
      binaryFileExtensions.add(fileExtension);

      // Log for debugging and potential future static list updates
      printChannelOutput(`Auto-detected binary extension: ${fileExtension} from ${path.basename(file.fsPath)}`, false);
    }

    console.error(`Error opening file: ${error}`);
    return undefined;
  }
}

/**
 * Efficiently loads icons for multiple files by processing unique extensions once.
 * Avoids redundant processing by grouping files by extension and using cached results.
 * @param files - Array of file URIs to process
 */
export async function batchLoadIcons(files: vscode.Uri[]): Promise<void> {
  const processedExtensions = new Set<string>();

  for (const file of files) {
    const fileExtension = path.extname(file.fsPath).toLowerCase();
    const fileExtensionWithoutDot = fileExtension.slice(1); // Remove the dot

    if (
      binaryFileExtensions.has(fileExtension) ||
      extensionsWithoutIcons.has(fileExtension) ||
      processedExtensions.has(fileExtensionWithoutDot)
    ) {
      continue;
    }

    const cachedIcon = extensionToIcon.get(fileExtensionWithoutDot);
    if (cachedIcon) {
      filePathToIcon.set(file.fsPath, cachedIcon);
      processedExtensions.add(fileExtensionWithoutDot);
      continue;
    }

    const icon = await GetIconForFile(file);
    if (icon && !extensionToIcon.has(fileExtensionWithoutDot)) {
      extensionToIcon.set(fileExtensionWithoutDot, icon);
    }
    processedExtensions.add(fileExtensionWithoutDot);
  }
}

/**
 * Returns current icon cache performance statistics.
 * @returns Object with hits, misses, and extension hits counts
 */
export function getIconCacheStats(): typeof iconCacheStats {
  return { ...iconCacheStats };
}

/**
 * Clears runtime icon caches and resets performance statistics.
 * Restores extensionToIcon to initial theme state (removes learned mappings).
 */
export function clearIconCache(): void {
  filePathToIcon.clear();
  extensionToIcon.clear();
  extensionsWithoutIcons.clear(); // Clear the "no icon" cache

  // Restore base theme mappings to extensionToIcon
  iconFileExtensions.forEach((icon, extension) => {
    extensionToIcon.set(extension, icon);
  });

  iconCacheStats = { hits: 0, misses: 0, extensionHits: 0, quickExits: 0 };
}

// List of binary file extensions
const binaryFileExtensions = new Set([
  // Images
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".tiff",
  ".ico",
  ".svg",
  ".webp",
  ".heic",
  ".nef",
  ".cr2",
  ".arw",
  // Executables and libraries
  ".exe",
  ".dll",
  ".so",
  ".app",
  ".bin",
  ".com",
  ".msi",
  ".out",
  ".class",
  ".deb",
  ".rpm",
  ".apk",
  ".ipa",
  ".xpi",
  // Compiled code / Object files
  ".o",
  ".obj",
  ".a",
  ".lib",
  ".pyc",
  ".pyo",
  ".jar",
  ".war",
  ".wasm",
  ".swiftmodule",
  // Archives
  ".zip",
  ".tar",
  ".gz",
  ".rar",
  ".7z",
  ".iso",
  ".dmg",
  ".cue",
  ".bz2",
  ".xz",
  ".cab",
  ".lzh",
  ".arc",
  ".cbr",
  ".cbz",
  // Media files
  ".mp3",
  ".wav",
  ".aac",
  ".flac",
  ".ogg",
  ".mp4",
  ".mkv",
  ".avi",
  ".mov",
  ".wmv",
  ".webm",
  ".raw",
  ".flv",
  ".f4v",
  ".midi",
  ".mid",
  // Fonts
  ".ttf",
  ".otf",
  ".woff",
  ".eot",
  // Miscellaneous
  ".pdf",
  ".swf",
  ".psd",
  ".ai",
  ".dat",
  ".db",
  ".sqlite",
  ".mdb",
  ".bak",
  ".pak",
  ".vmdk",
  ".qcow2",
  ".dmp",
  ".tlb",
  ".pub",
  // Documents
  ".docx",
  ".xlsx",
  ".pptx",
  ".doc",
  ".xls",
  ".ppt",
  ".pub",
  ".mobi",
  ".epub",
  ".odt",
  ".ods",
  ".odp",
  // 3D Models
  ".blend",
  ".fbx",
  ".stl",
  ".3ds",
  ".dwg",
  ".dxf",
  ".eps",
  ".xcf",
  ".indd",
  ".psb",
  // Game/Specialized formats
  ".blp", // Blizzard Picture (WoW textures)
  ".tga", // Targa image format
  ".dds", // DirectDraw Surface
  ".m2", // Blizzard model format
  ".wmo", // World Model Object (WoW)
  ".mpq", // Mo'PaQ archive (Blizzard)
  ".pak", // Package archive
  ".wad", // Where's All the Data (game archive)
  ".vpk", // Valve Package format
  ".bsp", // Binary Space Partition (game maps)
  ".mdx", // Warcraft model format
]);
