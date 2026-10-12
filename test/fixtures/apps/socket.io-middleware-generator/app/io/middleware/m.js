'use strict';

// Egg 4 已移除 generator 支持，这里用于验证插件会给出明确的报错
// （否则中间件会被静默忽略，例如 auth 中间件不生效）。
module.exports = app => {
  return function* (next) {
    yield* next;
  };
};
