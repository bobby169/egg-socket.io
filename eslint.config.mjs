import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      // 测试用的 egg 应用，风格与插件源码不同，且本身是临时夹具。
      'test/fixtures/**',
      'example/**',
    ],
  },
  ...compat.extends('eslint-config-egg'),
  {
    // eslint-config-egg 按 CommonJS 解析（sourceType: script），ESM 文件需要单独声明。
    files: [ '**/*.mjs' ],
    languageOptions: {
      sourceType: 'module',
    },
  },
  {
    rules: {
      // eslint-plugin-node@11 与 ESLint 9 不兼容（context.getScope 已被移除），
      // 这些规则一执行就会抛错，故整体关闭。
      'node/no-unsupported-features/es-syntax': 'off',
      'node/no-unsupported-features/es-builtins': 'off',
      'node/no-unsupported-features/node-builtins': 'off',
      'node/no-deprecated-api': 'off',
      'node/exports-style': 'off',
      'node/file-extension-in-import': 'off',
      'node/global-require': 'off',
      'node/handle-callback-err': 'off',
      'node/no-callback-literal': 'off',
      'node/no-mixed-requires': 'off',
      'node/no-new-require': 'off',
      'node/no-path-concat': 'off',
      'node/no-process-env': 'off',
      'node/no-process-exit': 'off',
      'node/no-restricted-modules': 'off',
      'node/no-sync': 'off',
      'node/prefer-global/buffer': 'off',
      'node/prefer-global/console': 'off',
      'node/prefer-global/process': 'off',
      'node/prefer-global/text-decoder': 'off',
      'node/prefer-global/text-encoder': 'off',
      'node/prefer-global/url-search-params': 'off',
      'node/prefer-global/url': 'off',
      'node/prefer-promises/dns': 'off',
      'node/prefer-promises/fs': 'off',
    },
  },
];
