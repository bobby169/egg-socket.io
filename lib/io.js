'use strict';

const http = require('node:http');
const assert = require('node:assert');
const is = require('is-type-of');
const { createAdapter } = require('@socket.io/redis-adapter');
// ioredis 的 built/index.js 会把 `default` 等属性定义在 Redis 类对象上，且不可重定义；
// 当该文件被二次执行时（例如 vitest 内联依赖后又在 Node 侧 require）会抛
// "Cannot redefine property: default"。这里降级为直接加载 Redis 类。
let Redis;
try {
  Redis = require('ioredis');
} catch {
  Redis = require('ioredis/built/Redis.js').default;
}
const compose = require('koa-compose');
const debug = require('debug')('egg-socket.io:lib:io.js');

const loader = require('./loader');
const packetMiddlewareInit = require('./packetMiddlewareInit');
const connectionMiddlewareInit = require('./connectionMiddlewareInit');

const CtxEventSymbol = Symbol.for('EGG-SOCKET.IO#CTX-EVENT');
const RouterConfigSymbol = Symbol.for('EGG-SOCKET.IO#ROUTERCONFIG');

const errorEvent = {
  disconnect: 1,
  error: 1,
  disconnecting: 1,
};

/**
 * Egg 4 的插件入口（app.js 导出 Boot 类）：
 * - configDidLoad 早于 app/router.js 执行，在这里启动控制器 / 中间件加载；
 * - willReady 在 loader 全部执行完之后触发（didLoad 有可能在 loader 执行中途就被调用，
 *   此时 app.middleware 还是空的），等控制器 / 中间件就绪后再注册命名空间。
 */
module.exports = class IOAppBoot {
  constructor(app) {
    this.app = app;
  }

  configDidLoad() {
    const app = this.app;
    const config = app.config.io;

    debug('[egg-socket.io] init start!');

    // 中间件由 FileLoader 异步加载，注册命名空间前需要等它完成；
    // 控制器则在 loader 里借框架的 loadController 加载，框架保证其在 app/router.js 之前就绪。
    this.loading = loader(app);

    if (config.redis) {
      const pubClient = new Redis(config.redis);
      const subClient = pubClient.duplicate();
      const adapterOptions = {
        key:
          config.adapter && 'key' in config.adapter
            ? config.adapter.key
            : undefined,
        requestsTimeout:
          config.adapter && 'requestsTimeout' in config.adapter
            ? config.adapter.requestsTimeout
            : 5000,
        publishOnSpecificResponseChannel:
          config.adapter && 'publishOnSpecificResponseChannel' in config.adapter
            ? config.adapter.publishOnSpecificResponseChannel
            : false,
      };
      pubClient.on('error', err => {
        app.coreLogger.error(err);
      });
      subClient.on('error', err => {
        app.coreLogger.error(err);
      });
      app.io.adapter(createAdapter(pubClient, subClient, adapterOptions));

      debug('[egg-socket.io] init socket.io-redis ready!');
    }

    app.on('server', server => {
      app.io.attach(server, config.init);

      // Check whether it's a common function, it shouldn't be
      // an async or generator function, or it will be ignored.
      if (
        typeof config.generateId === 'function' &&
        !is.isAsyncFunction(config.generateId) &&
        !is.isGeneratorFunction(config.generateId)
      ) {
        app.io.engine.generateId = config.generateId;
      }

      debug('[egg-socket.io] init ready!');
    });
  }

  async willReady() {
    const app = this.app;
    const namespace = app.config.io.namespace;

    await this.loading;

    for (const nsp in namespace) {
      const connectionMiddlewareConfig = namespace[nsp].connectionMiddleware;
      const packetMiddlewareConfig = namespace[nsp].packetMiddleware;

      debug(
        '[egg-socket.io] connectionMiddlewareConfig: ',
        connectionMiddlewareConfig
      );
      debug('[egg-socket.io] packetMiddlewareConfig: ', packetMiddlewareConfig);

      let connectionMiddlewares = [];
      let packetMiddlewares = [];

      if (connectionMiddlewareConfig) {
        assert(
          is.isArray(connectionMiddlewareConfig),
          'config.connectionMiddleware must be Array!'
        );
        for (const middleware of connectionMiddlewareConfig) {
          assert(
            app.io.middleware[middleware],
            `can't find middleware: ${middleware} !`
          );
          assert(
            !is.isGeneratorFunction(app.io.middleware[middleware]),
            `Support for generators was removed, middleware: ${middleware}`
          );
          connectionMiddlewares.push(app.io.middleware[middleware]);
        }
      }

      if (packetMiddlewareConfig) {
        assert(
          is.isArray(packetMiddlewareConfig),
          'config.packetMiddleware must be Array!'
        );
        for (const middleware of packetMiddlewareConfig) {
          assert(
            app.io.middleware[middleware],
            `can't find middleware: ${middleware} !`
          );
          assert(
            !is.isGeneratorFunction(app.io.middleware[middleware]),
            `Support for generators was removed, middleware: ${middleware}`
          );
          packetMiddlewares.push(app.io.middleware[middleware]);
        }
      }

      debug('[egg-socket.io] initNsp: %s', nsp);

      const sessionMiddleware = app.middleware.filter(mw => {
        return mw._name && mw._name.startsWith('session');
      })[0];

      connectionMiddlewares.unshift(sessionMiddleware);
      packetMiddlewares.unshift(sessionMiddleware);

      // Egg 4 已移除 generator 中间件，中间件本身就是普通 async 函数，
      // 不再需要 egg-core 的 utils.middleware（该函数在 @eggjs/core 中已不存在）做包装。
      connectionMiddlewares = compose(connectionMiddlewares);
      packetMiddlewares = compose(packetMiddlewares);

      debug('[egg-socket.io] connectionMiddlewares: ', connectionMiddlewares);
      debug('[egg-socket.io] packetMiddlewares: ', packetMiddlewares);
      this.initNsp(app.io.of(nsp), connectionMiddlewares, packetMiddlewares);
    }
  }

  initNsp(nsp, connectionMiddlewares, packetMiddlewares) {
    const app = this.app;

    nsp.on('connection', socket => {
      socket.use((packet, next) => {
        packetMiddlewareInit(app, socket, packet, next, packetMiddlewares, nsp);
      });

      if (nsp[RouterConfigSymbol]) {
        for (const [ event, handler ] of nsp[RouterConfigSymbol].entries()) {
          if (errorEvent[event]) {
            socket.on(event, (...args) => {
              debug('[egg-socket.io] socket closed:', args);
              const request = socket.request;
              request.socket = socket;
              const ctx = app.createContext(
                request,
                new http.ServerResponse(request)
              );
              ctx.args = args;
              // 控制器方法可能是同步函数（Egg 3 遗留写法），统一转成 Promise，
              // 顺带把同步抛出的异常也收敛到 catch 中，避免 worker 因未捕获异常退出。
              Promise.resolve()
                .then(() => handler.call(ctx))
                .catch(e => {
                  e.message =
                    '[egg-socket.io] controller execute error: ' + e.message;
                  app.coreLogger.error(e);
                });
            });
          } else {
            socket.on(event, (...args) => {
              const ctx = args.splice(-1)[0];
              ctx.args = ctx.req.args = args;
              // 同上：兼容同步控制器，并把同步异常统一走 catch。
              Promise.resolve()
                .then(() => handler.call(ctx))
                .then(() => ctx[CtxEventSymbol].emit('finshed'))
                .catch(e => {
                  if (e instanceof Error) {
                    e.message =
                      '[egg-socket.io] controller execute error: ' + e.message;
                  } /* istanbul ignore next */ else {
                    debug(e);
                  }
                  ctx[CtxEventSymbol].emit('finshed', e);
                });
            });
          }
        }
      }
    });

    nsp.use((socket, next) => {
      connectionMiddlewareInit(app, socket, next, connectionMiddlewares);
    });
  }
};
