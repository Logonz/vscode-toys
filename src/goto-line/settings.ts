import * as vscode from "vscode";

export interface GotoLineSettings {
  enabled: boolean;
  upCharacter: string;
  downCharacter: string;
  defaultLineNumberMode: "auto" | "on" | "off" | "interval" | "relative";
  highlightingEnabled: boolean;
  selectColor: string;
  deleteColor: string;
  copyColor: string;
  cutColor: string;
}

/**
 * Gets the current goto-line settings from VS Code configuration
 */
export function getGotoLineSettings(): GotoLineSettings {
  const config = vscode.workspace.getConfiguration("vstoys.goto-line");

  return {
    enabled: config.get("enabled", true),
    upCharacter: config.get("upCharacter", "k"),
    downCharacter: config.get("downCharacter", "j"),
    defaultLineNumberMode: config.get("defaultLineNumberMode", "auto"),
    highlightingEnabled: config.get("highlightingEnabled", true),
    selectColor: config.get("selectColor", "editor.wordHighlightBackground"),
    deleteColor: config.get("deleteColor", "inputValidation.errorBackground"),
    copyColor: config.get("copyColor", "editor.findRangeHighlightBackground"),
    cutColor: config.get("cutColor", "editor.findMatchHighlightBackground"),
  };
}

/**
 * Settings manager for goto-line module
 */
export class GotoLineSettingsManager {
  private _settings: GotoLineSettings;
  private _onSettingsChanged = new vscode.EventEmitter<GotoLineSettings>();
  private _disposables: vscode.Disposable[] = [];
  private _detectedLineNumberMode: "on" | "off" | "interval" | "relative";

  public readonly onSettingsChanged = this._onSettingsChanged.event;

  constructor() {
    this._settings = getGotoLineSettings();

    // Detect the current line number mode at startup
    const editorConfig = vscode.workspace.getConfiguration("editor");
    const currentLineNumbers = editorConfig.get<string>("lineNumbers", "on");
    this._detectedLineNumberMode = currentLineNumbers as "on" | "off" | "interval" | "relative";

    // Listen for configuration changes
    const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("vstoys.goto-line")) {
        this.updateSettings();
      }
    });

    this._disposables.push(configListener);
  }

  /**
   * Get the line number mode to restore to based on settings
   * If defaultLineNumberMode is "auto", returns the mode detected at startup
   * Otherwise returns the configured mode
   */
  getRestoreLineNumberMode(): "on" | "off" | "interval" | "relative" {
    if (this._settings.defaultLineNumberMode === "auto") {
      return this._detectedLineNumberMode;
    }
    return this._settings.defaultLineNumberMode;
  }

  /**
   * Get current settings
   */
  get settings(): GotoLineSettings {
    return { ...this._settings };
  }

  /**
   * Update settings from configuration and notify listeners
   */
  private updateSettings(): void {
    const newSettings = getGotoLineSettings();

    // Check if settings actually changeda
    const settingsChanged = JSON.stringify(this._settings) !== JSON.stringify(newSettings);

    if (settingsChanged) {
      this._settings = newSettings;
      this._onSettingsChanged.fire(this._settings);
    }
  }

  /**
   * Dispose of event listeners
   */
  dispose(): void {
    this._disposables.forEach((d) => d.dispose());
    this._onSettingsChanged.dispose();
  }
}
