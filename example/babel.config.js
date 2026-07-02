const path = require('path');
const pkg = require('../packages/rich-text-editor/package.json');

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        // Resolve the library to its source so the example hot-reloads library edits.
        alias: {
          [pkg.name]: path.join(__dirname, '..', 'packages', 'rich-text-editor', pkg.source),
        },
      },
    ],
  ],
};
