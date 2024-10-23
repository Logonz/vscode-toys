//@ts-check

"use strict";

const path = require("path");
// const CopyWebpackPlugin = require("copy-webpack-plugin");
const webpack = require("webpack");
const homedir = require("os").homedir();
const packageJSON = require("./package.json");

const extensionDir = path.join(
  homedir,
  `.vscode/extensions/${packageJSON.publisher}.${packageJSON.name}-${packageJSON.version}`
);

console.log("Node Env: ", process.env.NODE_ENV);

// TODO: This is a bit of a work in progress with the injections...
console.log("Starting to inject package.json files");
const fs = require("fs");
const JSONC = require("jsonc").jsonc;
// Read the main package.json
let packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
// Clear out configurations, keybinds and commands
packageJson.tags = {};
packageJson.contributes.commands = [];
packageJson.contributes.configuration.properties = {};
packageJson.contributes.keybindings = [];

// Get all files called "inject-package.json" under the src folder
const injectFiles = require("glob").sync("src/**/.*-package.jsonc");
// Recursively inject the files into the package.json
for (const file of injectFiles) {
  console.log("Injecting file: ", file);
  // Read the inject file content
  const injectContent = JSONC.parse(fs.readFileSync(file, "utf8"));

  // Deep merge the inject content into package.json
  const merged = require("webpack-merge").merge(packageJson, injectContent);

  // Write back to package.json
  fs.writeFileSync("package.json", JSON.stringify(merged, null, 2));

  // Read the main package.json
  packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
}

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: "node", // VS Code extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
  // mode: "none", // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
  mode: process.env.NODE_ENV === "production" ? "production" : "development",

  entry: "./src/extension.ts", // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, "dist"),
    filename: "extension.js",
    libraryTarget: "commonjs2",
    // devtoolModuleFilenameTemplate: "../[resource-path]",
  },
  externals: {
    vscode: "commonjs vscode", // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    // modules added here also need to be added in the .vscodeignore file
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
          },
        ],
      },
    ],
  },
  // devtool: "nosources-source-map",
  devtool: process.env.NODE_ENV === "production" ? "source-map" : "inline-source-map",
  infrastructureLogging: {
    level: "log", // enables logging required for problem matchers
  },
  plugins: [
    new webpack.DefinePlugin({
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
      "process.env.DIST_DIR": JSON.stringify(path.resolve(__dirname, "dist")),
    }),
    // Copy icons and images to dist folder
    // new CopyWebpackPlugin({
    //   patterns: [
    //     {
    //       from: "icons",
    //       to: "icons",
    //     },
    //   ],
    // }),
    process.env.NODE_ENV === "production"
      ? undefined
      : {
          apply: (compiler) => {
            compiler.hooks.afterEmit.tap("AfterEmitPlugin", (compilation) => {
              // const JSONC = require("jsonc").jsonc;
              // // Get all files called "inject-package.json" under the src folder
              // const injectFiles = require("glob").sync("src/**/.*-package.jsonc");
              // // Recursively inject the files into the package.json
              // for (const file of injectFiles) {
              //   console.log("Injecting file: ", file);
              //   // Read the inject file content
              //   const injectContent = JSONC.parse(fs.readFileSync(file, "utf8"));
              //   // Read the main package.json
              //   const packageJson = JSONC.parse(fs.readFileSync("package.json", "utf8"));

              //   // Deep merge the inject content into package.json
              //   const merged = require("webpack-merge").merge(packageJson, injectContent);

              //   // Write back to package.json
              //   fs.writeFileSync("package.json", JSON.stringify(merged, null, 2));
              // }
              return;
              const fs = require("fs");
              console.log("Compilation finished");
              console.log("In Development mode, Copying files");
              // Copy package.json to dist folder
              fs.copyFileSync(
                "package.json",
                path.join(
                  extensionDir,
                  // `.vscode\\extensions\\logonz.double-action-${version}\\package.json`
                  "package.json"
                )
              );

              // Copy dist folder to extension folder
              // Get all files in dist folder
              const files = fs.readdirSync("dist");
              // Copy each file to extension folder
              for (const file of files) {
                fs.copyFileSync(
                  `dist/${file}`,
                  path.join(
                    extensionDir,
                    // homedir,
                    // `.vscode\\extensions\\logonz.double-action-${version}\\dist\\${file}`
                    "dist",
                    file
                  )
                );
              }
            });
          },
        },
  ],
};
module.exports = [extensionConfig];
