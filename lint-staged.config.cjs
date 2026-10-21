/**
 * Commit hook (husky → lint-staged): staged files are linted with no
 * warnings allowed, so the lint stays at zero, then formatted. ESLint is
 * given only the files it lints: passing it an ignored one (a test, say)
 * is itself a warning.
 */
const { ESLint } = require('eslint');

const quoted = (files) => files.map((file) => JSON.stringify(file)).join(' ');

module.exports = {
  '*.{ts,tsx}': async (files) => {
    const eslint = new ESLint();
    const linted = [];
    for (const file of files) {
      if (!(await eslint.isPathIgnored(file))) linted.push(file);
    }
    return [
      ...(linted.length > 0 ? [`eslint --fix --max-warnings 0 ${quoted(linted)}`] : []),
      `prettier --write ${quoted(files)}`,
    ];
  },
  '*.{js,jsx,json,md,css}': 'prettier --write',
};
