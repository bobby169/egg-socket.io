'use strict';

const redisPlugin = require('@eggjs/redis').default;

// Egg 4 的官方插件：@eggjs/redis 通过工厂函数提供元数据（plugin 目录在 dist 下），
// @eggjs/session-redis 通过 eggPlugin.exports 声明入口。
module.exports = {
  ...redisPlugin(),
  sessionRedis: {
    enable: true,
    package: '@eggjs/session-redis',
  },
};
