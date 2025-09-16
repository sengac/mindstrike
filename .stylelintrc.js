module.exports = {
  extends: [
    'stylelint-config-standard',
    'stylelint-prettier/recommended',
  ],
  plugins: [
    'stylelint-prettier',
  ],
  rules: {
    'prettier/prettier': true,
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: [
          'tailwind',
          'apply',
          'variants',
          'responsive',
          'screen',
          'layer',
        ],
      },
    ],
  },
  ignoreFiles: [
    'dist/**/*',
    'node_modules/**/*',
  ],
};
