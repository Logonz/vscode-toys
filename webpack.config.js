//@ts-check
// @ts-ignore TS80001

"use strict";

import path from "path";
import fs from "fs";
import process from "process";
import webpack from "webpack";
import perf from "perf_hooks";
import { sync } from "glob";
import { merge } from "webpack-merge";
import { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";
import { jsonc } from "jsonc";
import { fileURLToPath } from "url";

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// import { exit } from "process";
// const CopyWebpackPlugin = require("copy-webpack-plugin");
// const homedir = require("os").homedir();
// const packageJSON = require("./package.json");

// const extensionDir = path.join(
//   homedir,
//   `.vscode/extensions/${packageJSON.publisher}.${packageJSON.name}-${packageJSON.version}`
// );

console.log("Node Env: ", process.env.NODE_ENV);

const start = perf.performance.now();

// TODO: This is a bit of a work in progress with the injections...
function mergePackageJSON() {
  console.log("Starting to inject package.json files");
  // Read the main package.json once
  let packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  // Clear out configurations, keybinds and commands
  packageJson.tags = {};
  packageJson.contributes.commands = [];
  packageJson.contributes.configuration.properties = {};
  packageJson.contributes.keybindings = [];
  packageJson.contributes.views = {};
  packageJson.contributes.menus = {};
  packageJson.contributes.viewsContainers = {};

  // Get all files called "inject-package.json" under the src folder
  const injectFiles = sync("src/**/.*-package.jsonc");
  // Recursively inject the files into the package.json (in memory)
  for (const file of injectFiles) {
    console.log("  - ", file);
    // Read the inject file content
    const injectContent = jsonc.parse(fs.readFileSync(file, "utf8"));

    // Deep merge the inject content into package.json (in memory)
    packageJson = merge(packageJson, injectContent);
  }

  // Write the final merged result to disk once
  fs.writeFileSync("package.json", JSON.stringify(packageJson, null, 2));
}
mergePackageJSON();
const end = perf.performance.now();
console.log(`Finished injecting package.json files - ${(end - start).toFixed(2)} ms`);

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

  // Enable caching for faster rebuilds
  cache: {
    type: "filesystem",
    buildDependencies: {
      config: [__filename],
    },
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
            options: {
              compilerOptions: {
                // Enable source maps for development
                sourceMap: process.env.NODE_ENV !== "production",
                // Skip type checking for faster builds (ESLint handles this)
                transpileOnly: false,
                // Enable incremental compilation for faster rebuilds
                incremental: true,
              },
            },
          },
        ],
      },
    ],
  },
  // devtool: "nosources-source-map",
  devtool: process.env.NODE_ENV === "production" ? "source-map" : "inline-source-map",

  // Add optimization settings
  optimization: {
    minimize: process.env.NODE_ENV === "production",
    usedExports: true, // Enable tree shaking
    sideEffects: false, // Your extension should be side-effect free
  },

  // Performance settings
  performance: {
    hints: process.env.NODE_ENV === "production" ? "warning" : false,
    maxAssetSize: 512000, // 500kb
    maxEntrypointSize: 512000,
  },

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
    // Add bundle analyzer only when specifically requested
    process.env.ANALYZE_BUNDLE === "true"
      ? new BundleAnalyzerPlugin({
          analyzerMode: "static",
          openAnalyzer: false,
          reportFilename: "bundle-report.html",
        })
      : undefined,
    // process.env.NODE_ENV === "production"
    //   ? new BundleAnalyzerPlugin({
    //       analyzerMode: "static",
    //       openAnalyzer: false,
    //       reportFilename: "bundle-report.html",
    //     })
    //   : undefined,
    // process.env.NODE_ENV === "production"
  ],
};
console.log(`\n`);

export default extensionConfig;
