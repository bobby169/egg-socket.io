'use strict';

// Egg 4 已移除 generator 支持，这里用于验证插件会给出明确的报错。
module.exports = app => {
  class Controller extends app.Controller {
    * ping() {
      this.ctx.socket.emit('res', 'hello');
    }
  }
  return Controller;
};
