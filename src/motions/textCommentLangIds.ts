// Comprehensive mapping of language IDs to their comment patterns
export const LANGUAGE_COMMENT_MAP: Record<string, { line?: string[]; block?: { start: string; end: string } }> = {
  // C-style languages
  c: { line: ["//"], block: { start: "/*", end: "*/" } },
  cpp: { line: ["//"], block: { start: "/*", end: "*/" } },
  csharp: { line: ["//"], block: { start: "/*", end: "*/" } },
  java: { line: ["//"], block: { start: "/*", end: "*/" } },
  javascript: { line: ["//"], block: { start: "/*", end: "*/" } },
  typescript: { line: ["//"], block: { start: "/*", end: "*/" } },
  javascriptreact: { line: ["//"], block: { start: "/*", end: "*/" } },
  typescriptreact: { line: ["//"], block: { start: "/*", end: "*/" } },
  go: { line: ["//"], block: { start: "/*", end: "*/" } },
  rust: { line: ["//"], block: { start: "/*", end: "*/" } },
  swift: { line: ["//"], block: { start: "/*", end: "*/" } },
  kotlin: { line: ["//"], block: { start: "/*", end: "*/" } },
  scala: { line: ["//"], block: { start: "/*", end: "*/" } },
  dart: { line: ["//"], block: { start: "/*", end: "*/" } },
  jsonc: { line: ["//"], block: { start: "/*", end: "*/" } },
  php: { line: ["//", "#"], block: { start: "/*", end: "*/" } },
  groovy: { line: ["//"], block: { start: "/*", end: "*/" } },

  // Script languages with #
  python: { line: ["#"] },
  ruby: { line: ["#"], block: { start: "=begin", end: "=end" } },
  perl: { line: ["#"], block: { start: "=pod", end: "=cut" } },
  bash: { line: ["#"] },
  shell: { line: ["#"] },
  shellscript: { line: ["#"] },
  zsh: { line: ["#"] },
  fish: { line: ["#"] },
  powershell: { line: ["#"], block: { start: "<#", end: "#>" } },
  yaml: { line: ["#"] },
  toml: { line: ["#"] },
  ini: { line: [";", "#"] },
  dockerfile: { line: ["#"] },
  makefile: { line: ["#"] },
  cmake: { line: ["#"] },
  r: { line: ["#"] },
  julia: { line: ["#"], block: { start: "#=", end: "=# " } },
  coffeescript: { line: ["#"], block: { start: "###", end: "###" } },
  crystal: { line: ["#"] },
  nim: { line: ["#"], block: { start: "#[", end: "]#" } },

  // SQL variants
  sql: { line: ["--"], block: { start: "/*", end: "*/" } },
  mysql: { line: ["--", "#"], block: { start: "/*", end: "*/" } },
  postgresql: { line: ["--"], block: { start: "/*", end: "*/" } },
  plsql: { line: ["--"], block: { start: "/*", end: "*/" } },
  tsql: { line: ["--"], block: { start: "/*", end: "*/" } },

  // Assembly languages
  asm: { line: [";"] },
  nasm: { line: [";"] },
  masm: { line: [";"] },
  gas: { line: ["#", "//"] },

  // Functional languages
  haskell: { line: ["--"], block: { start: "{-", end: "-}" } },
  elm: { line: ["--"], block: { start: "{-", end: "-}" } },
  purescript: { line: ["--"], block: { start: "{-", end: "-}" } },
  fsharp: { line: ["//"], block: { start: "(*", end: "*)" } },
  ocaml: { line: [], block: { start: "(*", end: "*)" } },
  reason: { line: ["//"], block: { start: "/*", end: "*/" } },
  erlang: { line: ["%"] },
  elixir: { line: ["#"] },
  clojure: { line: [";"] },
  scheme: { line: [";"], block: { start: "#|", end: "|#" } },
  racket: { line: [";"], block: { start: "#|", end: "|#" } },
  lisp: { line: [";"] },
  commonlisp: { line: [";"], block: { start: "#|", end: "|#" } },

  // ML family
  sml: { line: [], block: { start: "(*", end: "*)" } },

  // Other languages
  lua: { line: ["--"], block: { start: "--[[", end: "]]" } },
  vim: { line: ['"'] },
  vimscript: { line: ['"'] },
  tex: { line: ["%"] },
  latex: { line: ["%"] },
  bibtex: { line: ["%"] },
  matlab: { line: ["%"], block: { start: "%{", end: "%}" } },
  octave: { line: ["%", "#"] },
  fortran: { line: ["!", "C", "c"] },
  fortran90: { line: ["!"] },
  ada: { line: ["--"] },
  pascal: { line: ["//"], block: { start: "(*", end: "*)" } },
  delphi: { line: ["//"], block: { start: "(*", end: "*)" } },
  vb: { line: ["'"] },
  vbnet: { line: ["'"] },
  bat: { line: ["REM", "rem", "::"] },
  batch: { line: ["REM", "rem", "::"] },
  ahk: { line: [";"] },
  autohotkey: { line: [";"] },
  autoit: { line: [";"] },
  nsis: { line: [";", "#"] },

  // Web technologies
  html: { line: [], block: { start: "<!--", end: "-->" } },
  xml: { line: [], block: { start: "<!--", end: "-->" } },
  xsl: { line: [], block: { start: "<!--", end: "-->" } },
  svg: { line: [], block: { start: "<!--", end: "-->" } },
  css: { line: [], block: { start: "/*", end: "*/" } },
  scss: { line: ["//"], block: { start: "/*", end: "*/" } },
  sass: { line: ["//"] },
  less: { line: ["//"], block: { start: "/*", end: "*/" } },
  stylus: { line: ["//"], block: { start: "/*", end: "*/" } },

  // Data formats
  json: { line: [] }, // JSON doesn't support comments
  json5: { line: ["//"], block: { start: "/*", end: "*/" } }, // JSON5 supports comments
  hjson: { line: ["//"], block: { start: "/*", end: "*/" } }, // Human JSON
  properties: { line: ["#", "!"] },
  gitignore: { line: ["#"] },
  gitconfig: { line: [";", "#"] },
  gitattributes: { line: ["#"] },
  editorconfig: { line: [";", "#"] },

  // Additional config formats
  conf: { line: ["#", ";"] },
  config: { line: ["#", ";"] },
  cfg: { line: ["#", ";"] },
  "docker-compose": { line: ["#"] }, // Docker Compose files
  dockercompose: { line: ["#"] },

  // Shell variants
  sh: { line: ["#"] },
  ksh: { line: ["#"] },
  csh: { line: ["#"] },
  tcsh: { line: ["#"] },

  // Specialized languages
  verilog: { line: ["//"], block: { start: "/*", end: "*/" } },
  systemverilog: { line: ["//"], block: { start: "/*", end: "*/" } },
  vhdl: { line: ["--"] },
  tcl: { line: ["#"] },
  diff: { line: ["#"] },
  handlebars: { line: [], block: { start: "{{!--", end: "--}}" } },
  mustache: { line: [], block: { start: "{{!", end: "}}" } },
  twig: { line: [], block: { start: "{#", end: "#}" } },
  smarty: { line: [], block: { start: "{*", end: "*}" } },
  pug: { line: ["//"] },
  jade: { line: ["//"] },
  haml: { line: ["-#", "/"] },

  // Domain-specific
  graphql: { line: ["#"] },
  prisma: { line: ["//"] },
  proto: { line: ["//"], block: { start: "/*", end: "*/" } },
  protobuf: { line: ["//"], block: { start: "/*", end: "*/" } },
  thrift: { line: ["//", "#"], block: { start: "/*", end: "*/" } },
  avro: { line: ["//"], block: { start: "/*", end: "*/" } },

  // Configuration languages
  nginx: { line: ["#"] },
  apache: { line: ["#"] },
  htaccess: { line: ["#"] },
  crontab: { line: ["#"] },

  // Game development
  gdscript: { line: ["#"] },
  hlsl: { line: ["//"], block: { start: "/*", end: "*/" } },
  glsl: { line: ["//"], block: { start: "/*", end: "*/" } },
  cg: { line: ["//"], block: { start: "/*", end: "*/" } },

  // Modern Web Technologies
  svelte: { line: ["//"], block: { start: "<!--", end: "-->" } }, // HTML comments in template, JS comments in script
  vue: { line: ["//"], block: { start: "<!--", end: "-->" } }, // Similar to Svelte
  astro: { line: ["//"], block: { start: "<!--", end: "-->" } },
  mdx: { line: [], block: { start: "<!--", end: "-->" } },
  jsx: { line: ["//"], block: { start: "/*", end: "*/" } },

  // Systems Languages
  zig: { line: ["//"] },
  v: { line: ["//"], block: { start: "/*", end: "*/" } },
  odin: { line: ["//"], block: { start: "/*", end: "*/" } },
  carbon: { line: ["//"], block: { start: "/*", end: "*/" } },
  mojo: { line: ["#"] },
  gleam: { line: ["//"] },
  roc: { line: ["#"] },

  // Blockchain/Smart Contracts
  solidity: { line: ["//"], block: { start: "/*", end: "*/" } },
  vyper: { line: ["#"] },
  cadence: { line: ["//"], block: { start: "/*", end: "*/" } },
  move: { line: ["//"], block: { start: "/*", end: "*/" } },

  // Infrastructure/Configuration
  terraform: { line: ["#"], block: { start: "/*", end: "*/" } },
  puppet: { line: ["#"] },
  chef: { line: ["#"] },
  vagrant: { line: ["#"] },

  // Documentation/Markup
  asciidoc: { line: ["//"] },
  restructuredtext: { line: [".."] }, // reStructuredText comments
  rst: { line: [".."] },
  markdown: { line: [], block: { start: "<!--", end: "-->" } },
  org: { line: ["#"] }, // Org-mode

  // Database/Query Languages
  cypher: { line: ["//"], block: { start: "/*", end: "*/" } }, // Neo4j
  sparql: { line: ["#"] },
  influxql: { line: ["--"] },

  // Templating Languages
  jinja2: { line: [], block: { start: "{#", end: "#}" } },
  jinja: { line: [], block: { start: "{#", end: "#}" } },
  erb: { line: [], block: { start: "<%#", end: "%>" } },
  ejs: { line: [], block: { start: "<%#", end: "%>" } },
  liquid: { line: [], block: { start: "{% comment %}", end: "{% endcomment %}" } },
  nunjucks: { line: [], block: { start: "{#", end: "#}" } },
  velocity: { line: [], block: { start: "#*", end: "*#" } },

  // Legacy/Enterprise Languages
  cobol: { line: ["*", "/"], block: { start: "/*", end: "*/" } },
  pl1: { line: [], block: { start: "/*", end: "*/" } },
  "pl/i": { line: [], block: { start: "/*", end: "*/" } },
  jcl: { line: ["//", "*"] },
  rexx: { line: [], block: { start: "/*", end: "*/" } },

  // Data Science
  stata: { line: ["*", "//"] },
  sas: { line: [], block: { start: "/*", end: "*/" } },
  spss: { line: ["*"] },

  // Scientific Languages
  apl: { line: ["⍝"] }, // APL comment character
  j: { line: ["NB."] }, // J language
  mathematica: { line: [], block: { start: "(*", end: "*)" } },
  wolfram: { line: [], block: { start: "(*", end: "*)" } },

  // Default fallback for unknown languages
  plaintext: { line: ["//", "#", "--", ";"] },
};
