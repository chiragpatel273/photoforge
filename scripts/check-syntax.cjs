const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
let files = 0;
let errors = 0;

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', '.next', 'dist'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);

    if (entry.isDirectory()) visit(file);
    else if (/\.tsx?$/.test(file) && !file.endsWith('.d.ts')) {
      files++;
      const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        fileName: file,
        reportDiagnostics: true,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          strict: true,
        },
      });

      for (const diagnostic of result.diagnostics || []) {
        errors++;
        console.error(file, ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
      }
    }
  }
}

visit(process.cwd());
console.log(JSON.stringify({ files, syntaxErrors: errors }));
process.exitCode = errors ? 1 : 0;
