// I created this file to resolve the error message:
// Cannot read file '/Users/philipsmolen/Documents/fun-git/canvas-recorder/node_modules/mediabunny/tsconfig.json'.
// Grok suggested this solution.

module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',          // or ['./tsconfig.json'] if array
    tsconfigRootDir: __dirname,          // ← this is the key line
  },
};