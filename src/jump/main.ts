import * as vscode from "vscode";
import { createOutputChannel } from "../extension";
import OpenAI from "openai";
import { generatePastelColor, pickColorType, updateDecorationTypes } from "./decorations";
import { JumpInput } from "./jumpInput";
import { Jump } from "./ai";

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
`;
// main();
/**
 * Prints the given content on the output channel.
 *
 * @param content The content to be printed.
 * @param reveal Whether the output channel should be revealed.
 */
export let printJumpOutput: (content: string, reveal?: boolean) => void;

export function activateJump(name: string, context: vscode.ExtensionContext) {
  printJumpOutput = createOutputChannel(`${name}`);
  printJumpOutput(`${name} activated`);
  const client = new OpenAI({
    apiKey: "<API-KEY-HERE>", // This is the default and can be omitted
    // apiKey: process.env["OPENAI_API_KEY"], // This is the default and can be omitted
  });
  updateDecorationTypes();

  // async function main() {
  //   const chatCompletion = await client.chat.completions.create({
  //     messages: [{ role: "user", content: "Say this is a test" }],
  //     model: "gpt-3.5-turbo",
  //   });
  // }
  context.subscriptions.push(
    vscode.commands.registerCommand("vstoys.jump.jumpAI", Jump),
    // vscode.commands.registerCommand("vstoys.jump.jumpAI", async () => {
    //   // Get all selections
    //   const editor = vscode.window.activeTextEditor;
    //   if (!editor) {
    //     return; // No open text editor
    //   }

    //   const currentSelection = editor.selection;
    //   const currentLine = editor.document.lineAt(currentSelection.active.line);

    //   const topVisibleLine = editor.visibleRanges[0].start.line;
    //   const bottomVisibleLine = editor.visibleRanges[editor.visibleRanges.length - 1].end.line;

    //   console.log("Current line:", currentLine.text);
    //   console.log("Top visible line:", topVisibleLine);
    //   console.log("Bottom visible line:", bottomVisibleLine);

    //   const linesPrioritySort: {
    //     line: vscode.TextLine;
    //     distance: number;
    //     lineNumber: number;
    //     messages: any[];
    //     done: boolean;
    //   }[] = [];
    //   // Loop through all visible lines and get the text
    //   for (let i = topVisibleLine; i <= bottomVisibleLine; i++) {
    //     const line = editor.document.lineAt(i);
    //     const distance = Math.abs(i - currentSelection.active.line);
    //     linesPrioritySort.push({
    //       line: line,
    //       distance: distance,
    //       lineNumber: i,
    //       messages: [],
    //       done: false,
    //     });
    //   }

    //   // Sort lines by distance from current selection
    //   linesPrioritySort.sort((a, b) => a.distance - b.distance);

    //   function dec(
    //     lines: { line: vscode.TextLine; distance: number; lineNumber: number; messages: any[]; done: boolean }[]
    //   ) {
    //     const editor = vscode.window.activeTextEditor;
    //     if (!editor) {
    //       return; // No open text editor
    //     }
    //     lines.forEach((lineData) => {
    //       const line = lineData.line;
    //       let currentPosition = 0;
    //       const lineText = line.text;

    //       while (currentPosition < lineText.length) {
    //         // Find which message matches at the current position
    //         const remainingText = lineText.slice(currentPosition);
    //         const matchingMessage = lineData.messages.find((msg) => remainingText.startsWith(msg));

    //         if (matchingMessage) {
    //           const range = new vscode.Range(
    //             line.lineNumber,
    //             currentPosition,
    //             line.lineNumber,
    //             currentPosition + matchingMessage.length
    //           );

    //           const character = availableCharacters.pop();
    //           if (!character) {
    //             console.error("No more characters available");
    //             return;
    //           }
    //           const contentText: any = { before: character || "" };
    //           // const contentText = { before: matchingMessage, after: "" };
    //           decorate(editor, matchingMessage, contentText, range, generatePastelColor(), false);

    //           currentPosition += matchingMessage.length;
    //         } else {
    //           // No match found, move to next character
    //           currentPosition++;
    //         }
    //       }
    //     });
    //     if (editor) {
    //       // Toggle line numbers mode for the jump
    //       const currentSetting = editor.options.lineNumbers;
    //       console.log("Current line numbers setting:", currentSetting, "Setting to:", vscode.TextEditorLineNumbersStyle.Relative);
    //       editor.options.lineNumbers = vscode.TextEditorLineNumbersStyle.Relative;

    //       vscode.window.showInformationMessage(`Line numbers set to ${editor.options.lineNumbers}`);
    //       const g = new JumpInput({
    //         textEditor: editor,
    //         onInput: (input: any, char: any) => {
    //           console.log("Input:", input, char);
    //         },
    //         onCancel: () => {
    //           // Reset line numbers mode
    //           console.log("Resetting line numbers to:", currentSetting);
    //           editor.options.lineNumbers = currentSetting;
    //           console.log("Cancelled");
              
    //           // Clear all decorations
    //           console.log("Clearing all decorations");
    //           decorators.forEach((decorator) => {
    //             decorator.dispose();
    //           });
    //         },
    //       });
    //     }
    //   }

    //   const availableCharacters = "jfdksa;wibceghlmnopqrtuvxyzJFDKSABCEGHILMNOPQRTUVWXYZ".split("");

    //   let intervalId: NodeJS.Timeout;

    //   intervalId = setInterval(() => {
    //     const allDone = linesPrioritySort.every((lineData) => lineData.done);
    //     if (allDone) {
    //       console.log("All done");
    //       dec(linesPrioritySort);
    //       clearInterval(intervalId);
    //     }
    //   }, 100);

    //   // Loop through all visible lines and get the text
    //   for (let i = 0; i < linesPrioritySort.length; i++) {
    //     const lineData = linesPrioritySort[i];
    //     const line = editor.document.lineAt(lineData.lineNumber);

    //     const text = line.text.trim();
    //     if (text === "") {
    //       lineData.done = true;
    //       continue;
    //     }
    //     const requestStartTimestamp = Date.now();
    //     client.chat.completions
    //       .create({
    //         messages: [
    //           { role: "system", content: systemMessage },
    //           { role: "user", content: text },
    //         ],
    //         // Mini
    //         model: "gpt-4o-mini",
    //       })
    //       .then(async (response) => {
    //         const requestEndTimestamp = Date.now();
    //         console.log("Request time:", requestEndTimestamp - requestStartTimestamp, "ms", text);
    //         lineData.done = true;
    //         // console.log("Resp", response);
    //         if (response.choices && response.choices.length > 0) {
    //           const completion = response.choices[0];
    //           if (completion.finish_reason === "stop") {
    //             const message = completion.message.content;
    //             if (message) {
    //               const messages = message.split("\n");
    //               console.log("Message:", messages);
    //               lineData.messages = messages;
    //             }
    //           }
    //         }
    //       });
    //   }
    // })
  );

  // Get the current visible text editors from all groups
  // let visibleTextEditors = vscode.window.visibleTextEditors;
  // console.log("Visible text editors:", visibleTextEditors);

  // for (let editor of visibleTextEditors) {
  //   console.log("Editor:", editor);
  //   console.log(editor.visibleRanges);z
  //   console.log(editor.document.getText(editor.visibleRanges[0]));
  //   console.log("hej");
  // }
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
      margin: "0 0 0 5px",
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
