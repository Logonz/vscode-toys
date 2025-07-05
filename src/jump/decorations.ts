import { ThemableDecorationAttachmentRenderOptions, window, commands, ConfigurationChangeEvent, ExtensionContext, TextEditorDecorationType, TextEditor, workspace } from "vscode";
import { ThemeColor } from "vscode";

export abstract class Global {
  static letterDecorationType: TextEditorDecorationType;
}

/**
 * @param inputColor Takes a theme ID (like `editor.background`) or color string (like `#ffffff`) and returns vscode.ThemeColor or unchanged color string
 */
export function pickColorType(inputColor: string): ThemeColor | string {
  if (
    /[a-z]+\.[a-z]+/i.test(inputColor) ||
    ["contrastActiveBorder", "contrastBorder", "focusBorder", "foreground", "descriptionForeground", "errorForeground"].includes(inputColor)
  ) {
    return new ThemeColor(inputColor);
  } else {
    return inputColor;
  }
}
export function getIntRange(start: number, end: number): number[] {
  const range: number[] = [];
  for (let i = start; i < end; i++) {
    range.push(i);
  }
  return range;
}

export function first<T>(items: T[], compare: (a: T, b: T) => number): T | undefined {
  return items.slice(1).reduce((min, item) => (compare(item, min) > 0 ? min : item), items[0]);
}
export function generatePastelColor(): string {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 25 + Math.floor(Math.random() * 50); // 25-75%
  const lightness = 75 + Math.floor(Math.random() * 15); // 75-90%
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
export function updateDecorationTypes() {
  if (Global.letterDecorationType) {
    Global.letterDecorationType.dispose();
  }




  const letterBackground = generatePastelColor();//pickColorType("#4169E1");
  const letterBackgroundLight = pickColorType("#4169E1");

  const positionAbsolute = true;

  let beforeDecoration: ThemableDecorationAttachmentRenderOptions;
  if (positionAbsolute) {
    beforeDecoration = {
      backgroundColor: letterBackgroundLight,
      border: `1px solid`,
      borderColor: letterBackgroundLight,
      color: pickColorType("#ffffff"),
      textDecoration: "none;position:absolute;z-index:999999;max-height:100%;",
    };
  } else {
    beforeDecoration = {
      margin: "0 5px 0 5px",
      backgroundColor: letterBackgroundLight,
      border: `3px solid`,
      borderColor: letterBackgroundLight,
      color: pickColorType("#ffffff"),
    };
  }

  const matchBackground = "editor.wordHighlightBackground"
  const matchForeground = ""
  const scrollbarMatchForeground = "#4169E1"
  // These are unknown, just setting them to the same as matchBackground and matchForeground
  const light_matchBackground = "#4169E1"
  const light_matchForeground = "#4169E1"
  const light_letterForeground = "#4169E1"

  Global.letterDecorationType = window.createTextEditorDecorationType({
    backgroundColor: pickColorType(light_matchBackground),
    color: pickColorType(matchForeground),
    before: beforeDecoration,
    light: {
      backgroundColor: pickColorType(light_matchBackground),
      color: pickColorType(light_matchForeground),
      before: {
        // backgroundColor: letterBackgroundLight,
        // borderColor: letterBackgroundLight,
        backgroundColor: light_matchBackground,
        borderColor: light_matchBackground,
        color: pickColorType(light_letterForeground),
      },
    },
    overviewRulerColor: pickColorType(scrollbarMatchForeground),
    overviewRulerLane: 2, // vscode.OverviewRulerLane.Center
  });

}
