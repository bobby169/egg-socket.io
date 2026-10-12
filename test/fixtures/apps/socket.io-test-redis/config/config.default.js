'use strict';

exports.io = {
  redis: {
    host: '127.0.0.1',
    // 默认与 CI 的 redis-server（6379，无密码）一致；本地可用环境变量指向其他端口。
    port: Number(process.env.EGG_SOCKET_IO_TEST_REDIS_PORT || 6379),
  },
};

exports.keys = '123';
