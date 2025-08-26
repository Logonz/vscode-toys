import * as vscode from "vscode";

export interface GotoLineSettings {
  enabled: boolean;
  upCharacter: string;
  downCharacter: string;
  highlightingEnabled: boolean;
  selectColor: string;
  deleteColor: string;
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
    highlightingEnabled: config.get("highlightingEnabled", true),
    selectColor: config.get("selectColor", "editor.wordHighlightBackground"),
    deleteColor: config.get("deleteColor", "inputValidation.errorBackground"),
  };
}

/**
 * Settings manager for goto-line module
 */
export class GotoLineSettingsManager {
  private _settings: GotoLineSettings;
  private _onSettingsChanged = new vscode.EventEmitter<GotoLineSettings>();
  private _disposables: vscode.Disposable[] = [];

  public readonly onSettingsChanged = this._onSettingsChanged.event;

  constructor() {
    this._settings = getGotoLineSettings();

    // Listen for configuration changes
    const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("vstoys.goto-line")) {
        this.updateSettings();
      }
    });

    this._disposables.push(configListener);
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

    // Check if settings actually changed
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
