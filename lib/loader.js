'use strict';

const debug = require('debug')('egg-socket.io:lib:loader.js');
const path = require('node:path');

/**
 * 加载 app/io 下的中间件与控制器。
 *
 * 控制器直接复用 egg 自己的 `loader.loadController()`：
 * Egg 3 时代插件写的是 `loadController({ target: app.io.controller })`，
 * 而 Egg 4 的 `loadToApp()` 会把 target 强制指向 `app.controller`（忽略传入的 target），
 * 所以改为「借框架的 loadController 加载并包装，再把结果挪到 app.io.controller」。
 * 这样类 / 对象 / 单函数三种控制器写法、generator 报错、pathName/fullPath 等
 * 仍全部由 core 处理，插件不需要复刻这近百行包装逻辑。
 *
 * @param {Object} app egg 应用实例
 */
module.exports = app => {
  const middlewareDirs = app.loader.getLoadUnits().map(unit => path.join(unit.path, 'app', 'io', 'middleware'));

  app.io.middleware = app.io.middleware || {};
  const middlewareLoading = new app.loader.FileLoader({
    directory: middlewareDirs,
    target: app.io.middleware,
    inject: app,
  }).load();

  /* istanbul ignore next */
  app.io.__defineGetter__('middlewares', () => {
    app.deprecate('app.io.middlewares has been deprecated, please use app.io.middleware instead!');
    return app.io.middleware;
  });

  debug('[egg-socket.io] app.io.middleware:', app.io.middleware);

  app.io.controller = app.io.controller || {};
  const controllerDirs = app.loader.getLoadUnits().map(unit => path.join(unit.path, 'app', 'io', 'controller'));
  // 框架稍后调用 loadController() 时会进入这里：先用它加载/包装 socket.io 控制器
  // （结果暂存在 app.controller），再执行框架原本的加载 —— 后者会用 HTTP 控制器覆盖
  // app.controller，所以要在两次调用之间把结果挪到 app.io.controller。
  const loadController = app.loader.loadController.bind(app.loader);
  app.loader.loadController = async (...args) => {
    await loadController({ directory: controllerDirs });
    app.io.controller = app.controller;
    debug('[egg-socket.io] app.io.controller:', app.io.controller);
    return loadController(...args);
  };

  /* istanbul ignore next */
  app.io.__defineGetter__('controllers', () => {
    app.deprecate('app.io.controllers has been deprecated, please use app.io.controller instead!');
    return app.io.controller;
  });

  // Egg 4 的 FileLoader#load() 是异步的（Egg 3 为同步），把 Promise 交给 io.js await，
  // 避免中间件尚未挂载就被读取。
  return middlewareLoading;
};
