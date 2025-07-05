import * as vscode from "vscode";
import { createOutputChannel } from "../extension";
import OpenAI from "openai";
import { generatePastelColor, pickColorType, updateDecorationTypes } from "./decorations";
import { JumpInput } from "./jumpInput";

// Get systemMessage from systemMessage.md
const systemMessage = `
Extract tree-sitter-like objects from a single line of code and return them as a list of strings, each on a separate line. These strings represent objects that can be navigated using hotkeys, similar to the Neovim plugins Leap and Flash.

# Steps

1. **Parse the Line**: Analyze the provided line of code to identify tree-sitter-like objects. These may include parts of functions, classes, or other definable code structures that can be interpreted from a single line.
2. **Identify Objects**: Determine relevant code objects from the line, focusing on those useful for navigation.
3. **Extract and Format**: Extract these objects and format them as individual strings, ensuring each string occupies a separate line.
4. **Integration**: Organize the identified objects into a coherent list without including comments or non-relevant elements.

# Output Format

- The output should be a list of strings, where each string represents a tree-sitter-like object extracted from the provided single line of code. Each object should be on a separate line.

# Examples

**Input**: 
\`export function exampleFunction(test: string) {\`

**Output**:
export
function
exampleFunction
(
test
string
)
{

---

**Input:**
\`\`\`typescript
export interface ICustomEditorLabelPatterns { [pattern: string]: string; }
\`\`\`

**Output:**
export
interface
ICustomEditorLabelPatterns
{
[
pattern
string
]
string
}

---

**Input:**
\`\`\`typescript
export function IsCustomLabelEnabled(): boolean { return customLabelEnabled; }
\`\`\`

**Output:**
export
function
IsCustomLabelEnabled
(
)
boolean
{
return
customLabelEnabled
}

---

**Input:**
\`\`\`typescript
let customLabelEnabled: boolean = false;
\`\`\`

**Output:**
let
customLabelEnabled
boolean
=
false

---

**Input:**
\`\`\`typescript
const customLabelsEnabled: boolean | undefined = vscode.workspace.getConfiguration("workbench").get<boolean>("editor.customLabels.enabled");
\`\`\`

**Output:**
const
customLabelsEnabled
boolean
|
undefined
=
vscode
workspace
getConfiguration
(
"workbench"
)
get
<
boolean
>
(
"editor.customLabels.enabled"
)

---

**Input:**
\`\`\`typescript
if (customLabelsEnabled !== undefined) { customLabelEnabled = customLabelsEnabled; }
\`\`\`

**Output:**
if
(
customLabelsEnabled
!==
undefined
)
{
customLabelEnabled
=
customLabelsEnabled
}

---

**Input:**
\`\`\`typescript
customEditorLabelService = new CustomEditorLabelService(customLabelPatterns);
\`\`\`

**Output:**
customEditorLabelService
=
new
CustomEditorLabelService
(
customLabelPatterns
)

---

**Input:**
\`\`\`typescript
console.log(\`Max Files: \${maxFiles}\`);
\`\`\`

**Output:**
console
log
(
\`Max Files: 
\${
maxFiles
}
\`
)

# Notes

- Adapt for different programming languages and their syntax when identifying potential objects.
- NEVER INCLUDE comments or unexpected non-code elements ALWAYS exclude these from the results. If the entire line is a comment, just return a new line.
- Each line in the output should aid in navigation within the code.


DO NOT EXPLAIN ANYTHING OR REPLY IN ANY OTHER WAY THAN OUTPUT LINES
DO NOT WRAP THE OUTPUT IN ANYTHING SUCH AS A LIST OR CODE BLOCK
`;
function askJump(editor: vscode.TextEditor, client: OpenAI, lineData: lineData) {
  const line = editor.document.lineAt(lineData.lineNumber);

  const text = line.text.trim();
  if (text === "") {
    lineData.done = true;
    return;
  }
  const requestStartTimestamp = Date.now();
  client.chat.completions
    .create({
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: text },
      ],
      // Mini
      model: "gpt-4o-mini",
    })
    .then(async (response) => {
      const requestEndTimestamp = Date.now();
      console.log("Request time:", requestEndTimestamp - requestStartTimestamp, "ms", text);
      lineData.done = true;
      // console.log("Resp", response);
      if (response.choices && response.choices.length > 0) {
        const completion = response.choices[0];
        if (completion.finish_reason === "stop") {
          const message = completion.message.content;
          if (message) {
            const messages = message.split("\n");
            // Trim all messages
            for (let i = 0; i < messages.length; i++) {
              messages[i] = messages[i].trim();
            }
            const cleanedMessages = messages.filter((msg) => msg !== "");
            console.log(`${lineData.lineNumber + 1}: Message:`, cleanedMessages);
            lineData.messages = cleanedMessages;
          }
        }
      }
    });
}

type lineData = {
  line: vscode.TextLine;
  distance: number;
  lineNumber: number;
  relativeLineNumber: number;
  messages: any[];
  done: boolean;
  matches?: Record<string, number>;
};

export async function Jump() {
  const client = new OpenAI({
    apiKey: "<API-KEY-HERE>", // This is the default and can be omitted
    // apiKey: process.env["OPENAI_API_KEY"], // This is the default and can be omitted
  });
  // Get all selections
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return; // No open text editor
  }

  const currentSelection = editor.selection;
  const currentLine = editor.document.lineAt(currentSelection.active.line);

  const topVisibleLine = editor.visibleRanges[0].start.line;
  const bottomVisibleLine = editor.visibleRanges[editor.visibleRanges.length - 1].end.line;

  console.log("Current line:", currentLine.text);
  console.log("Top visible line:", topVisibleLine);
  console.log("Bottom visible line:", bottomVisibleLine);

  const linesPrioritySort: lineData[] = [];
  // Loop through all visible lines and get the text
  for (let i = topVisibleLine; i <= bottomVisibleLine; i++) {
    const line = editor.document.lineAt(i);
    const distance = Math.abs(i - currentSelection.active.line);
    linesPrioritySort.push({
      line: line,
      distance: distance,
      lineNumber: i,
      relativeLineNumber: distance,
      messages: [],
      done: false,
    });
  }

  const NumberLookup: Record<string, string> = {
    "1": "1",
    "2": "2",
    "3": "3",
    "4": "4",
    "5": "5",
    "6": "q",
    "7": "w",
    "8": "e",
    "9": "r",
    "0": "t",
  };

  const ReverseNumberLookup: Record<string, string> = {
    "1": "1",
    "2": "2",
    "3": "3",
    "4": "4",
    "5": "5",
    q: "6",
    w: "7",
    e: "8",
    r: "9",
    t: "0",
  };

  // Sort lines by distance from current selection
  linesPrioritySort.sort((a, b) => a.distance - b.distance);

  // const availableCharacters = "jfdksa;wibceghlmnopqrtuvxyzJFDKSABCEGHILMNOPQRTUVWXYZ".split("").reverse();
  // const availableCharacters = "jfdksawibceghlmnopqrtuvxyzJFDKSABCEGHILMNOPQRTUVWXYZ".split("").reverse();
  // const availableCharacters = ("qwertasdfgQWERTASDFG" + "zxcvbZXCVB" + "yhujikolpYHUJIKOLPnmNM").split("").reverse();
  const availableCharacters = "qwertasdfgQWERTASDFGzxcvbZXCVByhujikolpYHUJIKOLPnmNM".split("").reverse();
  function dec(lines: lineData[]) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return []; // No open text editor
    }
    for (let i = 0; i < lines.length; i++) {
      const lineData = lines[i];
      const line = lineData.line;
      let currentPosition = 0;
      const lineText = line.text;

      while (currentPosition < lineText.length) {
        // Find which message matches at the current position
        const remainingText = lineText.slice(currentPosition);
        const matchingMessage = lineData.messages.find((msg) => remainingText.startsWith(msg));

        if (matchingMessage) {
          const range = new vscode.Range(
            line.lineNumber,
            currentPosition,
            line.lineNumber,
            currentPosition + matchingMessage.length
          );

          const character = availableCharacters.pop();
          if (!character) {
            console.error("No more characters available");
            return;
          }
          const contentText: any = { before: character || "" };
          // const contentText = { before: matchingMessage, after: "" };
          decorate(editor, matchingMessage, contentText, range, generatePastelColor(), false);
          // console.log("Matched:", matchingMessage, "At:", currentPosition, "Character:", character);
          if (!lineData.matches) {
            lineData.matches = {};
          }
          lineData.matches[character] = currentPosition;

          currentPosition += matchingMessage.length;
        } else {
          // No match found, move to next character
          currentPosition++;
        }
      }
      // TODO: This adds a place if there is no match, Do we want this?
      try {
        if (!lineData.matches) {
          lineData.matches = {};
          const character = availableCharacters.pop();
          if (!character) {
            console.error("No more characters available");
            return;
          }
          const contentText: any = { before: character || "" };
          // const contentText = { before: matchingMessage, after: "" };
          const range = new vscode.Range(line.lineNumber, lineText.length, line.lineNumber, lineText.length);
          decorate(editor, "", contentText, range, generatePastelColor(), false);
          lineData.matches[character] = lineText.length - 1;
        }
      } catch (e) {
        console.error("Error:", e);
      }
    }
    return lines;
  }

  let intervalId: NodeJS.Timeout;
  if (editor) {
    // Toggle line numbers mode for the jump
    const currentSetting = editor.options.lineNumbers;
    console.log(
      "Current line numbers setting:",
      currentSetting,
      "Setting to:",
      vscode.TextEditorLineNumbersStyle.Relative
    );
    // editor.options.lineNumbers = vscode.TextEditorLineNumbersStyle.Relative;

    // vscode.window.showInformationMessage(`Line numbers set to ${editor.options.lineNumbers}`);

    let lineSelected = false;
    const lines: lineData[] = [];
    const g = new JumpInput({
      textEditor: editor,
      onInput: (input: any, char: any) => {
        console.log("Input:", input, char);
        if (lineSelected) {
          console.log(lines);
          lines.forEach((lineData) => {
            if (lineData.matches && lineData.matches[char] !== undefined) {
              const match = lineData.matches[char];
              // Move cursor to the line
              console.log("Jumping to line:", lineData.lineNumber);
              const position = new vscode.Position(lineData.lineNumber, match);
              editor.selections = [new vscode.Selection(position, position)];
              g.destroy();
              decorators.forEach((decorator) => {
                decorator.dispose();
              });
              return;
            }
          });
        } else {
          linesPrioritySort.forEach((lineData) => {
            // if (lineData.distance.toString().endsWith(input)) {
            // ! We add one here to make it 1-based
            const lineNr = lineData.lineNumber + 1;
            if (lineNr.toString().endsWith(ReverseNumberLookup[input])) {
              console.log(`Line ${lineData.lineNumber} Ending with input:`, input);
              lines.push(lineData);
              askJump(editor, client, lineData);
            }
          });
          if (lines.length > 0) {
            lineSelected = true;
            decorators.forEach((decorator) => {
              decorator.dispose();
            });
            intervalId = setInterval(() => {
              const allDone = lines.every((lineData) => lineData.done);
              if (allDone) {
                console.log("All donee");
                clearInterval(intervalId);
                console.log("All donee");
                lines.sort((a, b) => a.distance - b.distance);
                console.log("All donee");

                const newLines = dec(lines);
                console.log("New lines:", newLines);
                if (newLines) {
                  const allowedChars: string[] = [];
                  newLines.forEach((lineData) => {
                    for (const key in lineData.matches) {
                      allowedChars.push(key);
                    }
                  });
                  g.changeAllowedChars(allowedChars);
                }
              }
            }, 100);
            // Reset line numbers mode
            console.log("Resetting line numbers to:", currentSetting);
            editor.options.lineNumbers = currentSetting;
          } else {
            g.destroy();
          }
        }
      },
      onCancel: () => {
        // Reset line numbers mode
        console.log("Resetting line numbers to:", currentSetting);
        editor.options.lineNumbers = currentSetting;
        console.log("Cancelled");

        // Clear all decorations
        console.log("Clearing all decorations");
        decorators.forEach((decorator) => {
          decorator.dispose();
        });
      },
    });
  }

  // intervalId = setInterval(() => {
  //   const allDone = linesPrioritySort.every((lineData) => lineData.done);
  //   if (allDone) {
  //     console.log("All done");
  //     dec(linesPrioritySort);
  //     clearInterval(intervalId);
  //   }
  // }, 100);

  // // Loop through all visible lines and get the text
  for (let i = 0; i < linesPrioritySort.length; i++) {
    const lineData = linesPrioritySort[i];

    const range = new vscode.Range(lineData.line.lineNumber, 0, lineData.line.lineNumber, 0);
    // ! We add one here to make it 1-based
    const baseLineNumber = lineData.line.lineNumber + 1;
    const lastLineNumberNumber = baseLineNumber.toString().split("").reverse()[0];
    const contentText: any = { before: NumberLookup[lastLineNumberNumber] || "" };
    // const contentText = { before: matchingMessage, after: "" };
    decorateLineNumber(editor, "", contentText, range, generatePastelColor(), false);
  }
}

function getDecorator(backgroundColor: string): vscode.TextEditorDecorationType {
  const letterBackgroundLight = pickColorType("#4169E1");
  return vscode.window.createTextEditorDecorationType({
    backgroundColor: pickColorType("editor.wordHighlightBackground"),
    color: pickColorType(""),
    before: {
      // backgroundColor: backgroundColor,
      border: `1px solid`,
      // borderColor: generatePastelColor(),
      // color: "#000000",
      backgroundColor: letterBackgroundLight,
      borderColor: letterBackgroundLight,
      color: pickColorType("#ffffff"),
      // margin: '0 5px 0 5px',
      margin: "0 0 0 2px",
      // textDecoration: "none;position:absolute;z-index:999999;max-height:100%;",
    },
    after: {
      backgroundColor: backgroundColor,
      border: `1px solid`,
      borderColor: generatePastelColor(),
      color: "#000000",
      // textDecoration: "none;position:absolute;z-index:999999;max-height:100%;",
    },
    overviewRulerColor: "#4169E1",
    overviewRulerLane: 2, // vscode.OverviewRulerLane.Center
  });
}

let decorators: vscode.TextEditorDecorationType[] = [];
function decorate(
  editor: vscode.TextEditor,
  hoverMessage: string,
  contentText: { before: string; after: string },
  range: vscode.Range,
  backgroundColor: string = generatePastelColor(),
  highlight: boolean = false
) {
  const location = new vscode.Range(range.start, range.start);
  // decorationOptions.push();
  if (highlight) {
    const decorator = getDecorator(backgroundColor);
    decorators.push(decorator);
    editor.setDecorations(decorator, [
      {
        range: location,
        hoverMessage: hoverMessage, //String.fromCharCode(65 + i)
        renderOptions: {
          // after: {
          //   contentText: `${contentText.after}`,
          // },
          before: {
            contentText: `${contentText.before}`,
          },
        },
      },
    ]);
  } else {
    let decorator = getDecorator(backgroundColor);
    decorators.push(decorator);
    editor.setDecorations(decorator, [
      {
        range: location,
        hoverMessage: hoverMessage, //String.fromCharCode(65 + i)
        renderOptions: {
          // after: {
          //   contentText: `${contentText.after}`,
          // },
          before: {
            contentText: `${contentText.before}`,
          },
        },
      },
    ]);
    // decorator = getDecorator(backgroundColor);
    // decorators.push(decorator);
    // editor.setDecorations(decorator, [
    //   {
    //     range: location,
    //     hoverMessage: hoverMessage, //String.fromCharCode(65 + i)
    //     renderOptions: {
    //       after: {
    //         contentText: `${contentText.after}`,
    //       },
    //       // before: {
    //       //   contentText: `${contentText.before}`,
    //       // },
    //     },
    //   },
    // ]);
  }
}

function getLineNumberDecorator(backgroundColor: string): vscode.TextEditorDecorationType {
  const letterBackgroundLight = pickColorType("#4169E1");
  return vscode.window.createTextEditorDecorationType({
    backgroundColor: pickColorType("editor.wordHighlightBackground"),
    color: pickColorType(""),
    before: {
      // backgroundColor: backgroundColor,
      // border: `1px solid`,
      // borderColor: generatePastelColor(),
      // color: "#000000",
      // backgroundColor: letterBackgroundLight,
      // borderColor: letterBackgroundLight,
      color: pickColorType("#ffffff"),
      // margin: '0 5px 0 5px',
      // margin: margin,
      textDecoration: "none;position:absolute;z-index:999999;max-height:100%;",
      // textDecoration: textDecoration,
    },
    after: {
      backgroundColor: backgroundColor,
      // border: border,
      borderColor: generatePastelColor(),
      color: "#000000",
      // textDecoration: "none;position:absolute;z-index:999999;max-height:100%;",
      // textDecoration: textDecoration,
    },
    overviewRulerColor: "#4169E1",
    overviewRulerLane: 2, // vscode.OverviewRulerLane.Center
  });
}

function decorateLineNumber(
  editor: vscode.TextEditor,
  hoverMessage: string,
  contentText: { before: string; after: string },
  range: vscode.Range,
  backgroundColor: string = generatePastelColor(),
  highlight: boolean = false
) {
  const location = new vscode.Range(range.start, range.start);

  let decorator = getLineNumberDecorator(backgroundColor);
  decorators.push(decorator);
  editor.setDecorations(decorator, [
    {
      range: location,
      hoverMessage: hoverMessage, //String.fromCharCode(65 + i)
      renderOptions: {
        // after: {
        //   contentText: `${contentText.after}`,
        // },
        before: {
          contentText: `${contentText.before}`,
        },
      },
    },
  ]);
}
