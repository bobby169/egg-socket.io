import { describe, it as vitestIt, beforeAll, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';
import mm from '@eggjs/mock';
import request from 'supertest';
import pedding from 'pedding';
import ioc from 'socket.io-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vitest 不支持 mocha 的 done 回调风格（回调不会被等待，用例会假通过），
// 这里把 done 包成 Promise，以便保留原有用例的写法与语义；同时兼容 async 用例。
function it(name, fn) {
  return vitestIt(name, () => {
    if (fn.length > 0) {
      return new Promise((resolve, reject) => {
        fn(err => (err ? reject(err) : resolve()));
      });
    }
    return fn();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function once(emitter, event) {
  return new Promise(resolve => emitter.once(event, resolve));
}

let basePort = 17001;

function client(nsp = '', opts = {}) {
  let url = 'http://127.0.0.1:' + opts.port + (nsp || '');
  if (opts.query) {
    url += '?' + opts.query;
  }
  return ioc(url, opts);
}

// 每个用例分配一个独立端口，避免上一个用例的 worker 尚未完全退出时端口被占用。
function cluster(baseDir, options = {}) {
  return mm.cluster({ baseDir, port: basePort, cache: false, ...options });
}

const mockApps = fs.readdirSync(path.join(__dirname, 'fixtures/apps'));

describe('test/socketio.test.mjs', () => {
  beforeAll(() => {
    mockApps.forEach(clean);
  });

  afterEach(async () => {
    await mm.restore();
    basePort++;
  });

  it('should async/await works ok', done => {
    const app = cluster('apps/socket.io-async', {
      workers: 1,
      sticky: false,
    });
    app.ready().then(() => {
      const socket = client('', { port: basePort });
      let success = 0;
      socket.on('connect', () => {
        socket.emit('chat-async-class', '');
        socket.emit('chat-async-object', '');
      });
      socket.on('disconnect', () => app.close().then(done, done));
      socket.on('res', msg => {
        assert(msg === 'hello');
        if (++success === 2) {
          socket.close();
        }
      });
    });
  });

  it('should controller class works ok', done => {
    const app = cluster('apps/socket.io-controller-class', {
      workers: 1,
      sticky: false,
    });
    app.ready().then(() => {
      const socket = client('', { port: basePort });
      socket.on('connect', () => {
        socket.emit('chat', '');
      });
      socket.on('disconnect', () => app.close().then(done, done));
      socket.on('res', msg => {
        assert(msg === 'hello');
        socket.close();
      });
    });
  });

  it('should customize generateId works ok', done => {
    const app = cluster('apps/socket.io-generateId', {
      workers: 1,
      sticky: false,
    });
    app.ready().then(() => {
      const socket = client('', { port: basePort });
      socket.on('connect', () => {
        // generateId 覆盖的是 engine.io 的会话 id，socket.io 4 起 socket.id 已与之解耦。
        assert(socket.io.engine.id === '1234567890');
        socket.emit('generateId', '');
      });
      socket.on('disconnect', () => app.close().then(done, done));
      socket.on('res', msg => {
        assert(msg === 'hello');
        socket.close();
      });
    });
  });

  it('should single worker works ok', done => {
    const app = cluster('apps/socket.io-test', {
      workers: 1,
      sticky: false,
    });
    app.ready().then(() => {
      const socket = client('', { port: basePort });
      socket.on('connect', () => socket.emit('chat', ''));
      socket.on('disconnect', () => app.close().then(done, done));
      socket.on('res', msg => {
        assert(msg === 'hello');
        socket.close();
      });
    });
  });

  it('should mutil process works ok with sticky mode', done => {
    const app = cluster('apps/socket.io-test', {
      workers: 2,
      sticky: true,
    });
    app.ready().then(() => {
      const socket = client('', { port: basePort });
      socket.on('connect', () => socket.emit('chat', ''));
      socket.on('disconnect', () => app.close().then(done, done));
      socket.on('res', msg => {
        assert(msg === 'hello');
        socket.close();
      });
    });
  });

  it('should redis adapter works ok', done => {
    const app = cluster('apps/socket.io-test-redis', {
      workers: 2,
      sticky: true,
    });
    app.ready().then(() => {
      const socket = client('', { port: basePort });
      socket.on('connect', () => socket.emit('chat', ''));
      socket.on('disconnect', () => app.close().then(done, done));
      socket.on('res', msg => {
        assert(msg === 'hello');
        socket.close();
      });
    });
  });

  describe('connectionMiddleware', () => {
    it('should connectionMiddleware works ok when connection established & disconnected', done => {
      test('apps/socket.io-connectionMiddleware', done);
    });

    it('should connectionMiddleware works ok when connection established & disconnected', done => {
      test('apps/socket.io-connectionMiddleware-async', done);
    });

    function test(appConfig, done) {
      const app = cluster(appConfig, {
        workers: 2,
        sticky: true,
      });
      app.ready().then(() => {
        const socket = client('', { port: basePort });
        socket.on('connected', disconnectFile => {
          socket.close();
          setTimeout(() => {
            assert(fs.readFileSync(disconnectFile).toString(), 'true');
            fs.unlinkSync(disconnectFile);
            app.close().then(done, done);
          }, 500);
        });
      });
    }
  });

  describe('packetMiddleware', () => {
    it('should packetMiddleware works ok', _done => {
      testPacketMiddleware('socket.io-packetMiddleware', _done);
    });

    it('should packetMiddleware async works ok', _done => {
      testPacketMiddleware('socket.io-packetMiddleware-async', _done);
    });

    function testPacketMiddleware(appName, _done) {
      const app = cluster(`apps/${appName}`, {
        workers: 2,
        sticky: true,
      });
      const done = pedding(_done, 2);
      app.ready().then(() => {
        const socket = client('', { port: basePort });
        socket.on('disconnect', () => app.close().then(done, done));
        socket.on('packet1', () => done());
        socket.on('packet2', () => socket.close());
        socket.on('connect', () => socket.emit('a', ''));
      });
    }

    it('manual register a event should  be release after packetMiddleware', _done => {
      const app = cluster('apps/socket.io-packetMiddleware', {
        workers: 2,
        sticky: true,
      });
      const done = pedding(_done, 2);
      app.ready().then(() => {
        const socket = client('', { port: basePort });
        socket.on('disconnect', () => app.close().then(done, done));
        socket.on('connect', () => {
          socket.emit('anEventNotRegisterInTheRouter', '1');
        });
        socket.on('thisMessageMeansRelease', () => {
          // testunit will failure(timeout) when not get this message
          done();
          socket.close();
        });
      });
    });

    it('manual register an event message and register an other event by app.io.route must be ok too', _done => {
      const app = cluster('apps/socket.io-packetMiddleware', {
        workers: 2,
        sticky: true,
      });
      const done = pedding(_done, 3);
      app.ready().then(() => {
        const socket = client('', { port: basePort });
        socket.on('connect', () => {
          socket.emit('chat', '1');
        });
        socket.on('disconnect', () => app.close().then(done, done));
        socket.on('chat', () => done());
        // when the server finished event emit
        socket.on('thisMessageMeansRelease', () => {
          socket.close();
          done();
        });
      });
    });

    it('return without wait next()', done => {
      const app = cluster('apps/socket.io-packetMiddleware-return-async', {
        workers: 2,
        sticky: true,
      });

      app.ready().then(() => {
        const socket = client('', { port: basePort });
        socket.on('disconnect', () => app.close().then(done, done));
        socket.on('msg', r => {
          assert(r === 'socket.io-packetMiddleware-return-async');
          socket.close();
        });
        socket.on('connect', () => socket.emit('chat', 'test'));
      });
    });

    it('should pass ctx as the first argument to a single function controller', async () => {
      const app = cluster('apps/socket.io-packetMiddleware-async', {
        workers: 1,
        sticky: false,
      });
      await app.ready();

      const socket = client('', { port: basePort });
      await once(socket, 'connect');
      socket.emit('chat', '');
      // 该夹具的控制器是 `module.exports = () => async ctx => {}`，
      // 依赖插件把 ctx 作为第一个参数传入。
      const payload = await once(socket, 'chat');
      assert.strictEqual(payload, 'message send back to client');

      socket.close();
      await app.close();
    });
  });

  describe('session', () => {
    it('with cookie session allowed', done => {
      const app = cluster('apps/socket.io-session', {
        workers: 2,
        sticky: true,
      });

      app.ready().then(() => {
        const req = request(`http://127.0.0.1:${basePort}`);
        req
          .get('/home')
          .expect(200)
          .expect('hello', function requestDone(err, res) {
            assert(!err, err);
            const cookie = res.headers['set-cookie'].join(';');
            const socket = client('', {
              extraHeaders: { cookie },
              port: basePort,
            });
            socket.on('connect_error', err => done(new Error(err.message)));
            socket.on('connect', () => socket.emit('chat', ''));
            let disconnectFile = '';
            socket.on('join', p => {
              disconnectFile = p;
            });
            socket.on('res', msg => {
              assert(msg === 'foo');
              socket.close();
              setTimeout(() => {
                assert(fs.readFileSync(disconnectFile).toString(), 'true');
                fs.unlinkSync(disconnectFile);
                app.close().then(done, done);
              }, 500);
            });
          });
      });
    });

    it('with external session allowed', done => {
      const app = cluster('apps/socket.io-external-session', {
        workers: 2,
        sticky: true,
      });

      app.ready().then(() => {
        const req = request(`http://127.0.0.1:${basePort}`);
        req
          .get('/home')
          .expect(200)
          .expect('hello', function requestDone(err, res) {
            assert(!err, err);
            const cookie = res.headers['set-cookie'].join(';');
            const socket = client('', {
              extraHeaders: { cookie },
              port: basePort,
            });
            socket.on('connect_error', err => done(new Error(err.message)));
            socket.on('connect', () => socket.emit('chat', ''));
            let disconnectFile = '';
            socket.on('join', p => {
              disconnectFile = p;
            });
            socket.on('res', msg => {
              assert(msg === 'foo');
              socket.close();
              setTimeout(() => {
                assert(fs.readFileSync(disconnectFile).toString(), 'true');
                fs.unlinkSync(disconnectFile);
                app.close().then(done, done);
              }, 500);
            });
          });
      });
    });

    it('without session forbidden', done => {
      const app = cluster('apps/socket.io-session', {
        workers: 2,
        sticky: true,
      });

      app.ready().then(() => {
        const req = request(`http://127.0.0.1:${basePort}`);
        req
          .get('/home')
          .expect(200)
          .expect('hello', function requestDone(err) {
            assert(!err, err);
            const socket = client('', { port: basePort });
            // socket.io 4 中命名空间中间件失败会以 connect_error 通知客户端。
            socket.on('connect_error', err => {
              if (err.message === 'auth failed!') {
                done();
              } else {
                done(new Error('should auth failed!'));
              }
            });
          });
      });
    });
  });

  describe('error', () => {
    it('Controller error', async () => {
      await testControllerError('socket.io-controller-error');
    });

    it('Controller error async', async () => {
      await testControllerError('socket.io-controller-error-async');
    });

    async function testControllerError(appName) {
      const app = cluster(`apps/${appName}`, {
        workers: 2,
        sticky: true,
      });

      await app.ready();
      const socket = client('', { port: basePort });
      await once(socket, 'connect');
      socket.emit('chat', '');
      // socket.io 4 的客户端不再处理服务端下发的 ERROR 包（socket.io-client 的
      // onpacket 里没有 ERROR 分支），因此这里直接断言服务端的错误日志。
      await sleep(500);
      socket.close();
      await sleep(1000);
      await app.close();

      const errorLog = getErrorLogContent(appName);
      assert.strictEqual(contains(errorLog, 'Controller Error!'), 1);
      assert.strictEqual(contains(errorLog, 'Controller Disconnect!'), 1);
      assert.strictEqual(contains(errorLog, 'Controller Disconnecting!'), 1);
    }

    it('connectionMiddleware error', done => {
      testConnectionMiddlewareError(
        'socket.io-connectionMiddleware-error',
        done
      );
    });

    it('connectionMiddleware error async', done => {
      testConnectionMiddlewareError(
        'socket.io-connectionMiddleware-error-async',
        done
      );
    });

    function testConnectionMiddlewareError(appName, _done) {
      const app = cluster(`apps/${appName}`, {
        workers: 2,
        sticky: true,
      });
      const done = pedding(_done, 2);

      app.ready().then(() => {
        const socket = client('', { port: basePort });
        socket.on('disconnect', () => app.close().then(done, done));
        socket.on('connect', () => socket.emit('chat', ''));
        // socket.io 4 中命名空间中间件失败会以 connect_error 通知客户端。
        socket.on('connect_error', e => {
          assert(contains(e.message, 'connectionMiddleware Error!') === 1);
          done();
        });
        setTimeout(() => {
          const errorLog = getErrorLogContent(appName);
          assert(contains(errorLog, 'connectionMiddleware Error!') === 1);
          done();
        }, 500);
      });
    }

    it('packetMiddleware error', async () => {
      await testPacketMiddlewareError('socket.io-packetMiddleware-error');
    });

    it('packetMiddleware error async', async () => {
      await testPacketMiddlewareError('socket.io-packetMiddleware-error-async');
    });

    async function testPacketMiddlewareError(appName) {
      const app = cluster(`apps/${appName}`, {
        workers: 2,
        sticky: true,
      });

      await app.ready();
      const socket = client('', { port: basePort });
      await once(socket, 'connect');
      socket.emit('chat', '');
      await sleep(500);
      await app.close();

      const errorLog = getErrorLogContent(appName);
      assert.strictEqual(contains(errorLog, 'packetMiddleware Error!'), 1);
    }

    it('redis connection error', done => {
      const appName = 'socket.io-test-redis-error';
      const app = cluster(`apps/${appName}`, {
        workers: 2,
        sticky: true,
      });
      app.ready().then(() => {
        setTimeout(() => {
          app
            .close()
            .then(() => {
              const errorLog = getErrorLogContent(appName);
              assert(
                contains(errorLog, 'connect ECONNREFUSED 127.0.0.1:6666') > 0
              );
            })
            .then(done, done);
        }, 300);
      });
    });
  });

  describe('namespace', () => {
    it('should namespace works ok', done => {
      const app = cluster('apps/socket.io-ns', {
        workers: 1,
        sticky: false,
      });
      app.ready().then(() => {
        const socket = client('/nstest', { port: basePort });
        socket.on('connect', () => socket.emit('chat', ''));
        socket.on('disconnect', () => app.close().then(done, done));
        socket.on('res', msg => {
          assert(msg === 'hello');
          socket.close();
        });
      });
    });
  });

  describe('generator support', () => {
    it('should throw a clear error when a generator controller is used', async () => {
      const app = mm.app({
        baseDir: 'apps/socket.io-controller-generator',
        coverage: false,
      });
      await assert.rejects(
        () => app.ready(),
        /Support for generators was removed/
      );
    });

    it('should throw a clear error when a generator middleware is used', async () => {
      const app = mm.app({
        baseDir: 'apps/socket.io-middleware-generator',
        coverage: false,
      });
      await assert.rejects(
        () => app.ready(),
        /Support for generators was removed/
      );
    });
  });

  describe('ts for egg-socket starting now...', () => {
    it('should work with a common socketIO controller', done => {
      const app = cluster('apps/ts/socket.io-common', {
        workers: 1,
        sticky: false,
      });
      app.ready().then(() => {
        const socket = client('', { port: basePort });
        let counter = 0;
        socket.on('connect', () => {
          socket.emit('chat', '');
        });
        socket.on('res', () => {
          counter++;
        });
        socket.on('onBefore', () => {
          counter++;
        });
        socket.on('onAfter', () => {
          counter++;
          assert(counter === 3);
          socket.close();
        });
        socket.on('disconnect', () => app.close().then(done, done));
      });
    });

    it('should work with a namespaced socketIO controller', done => {
      const app = cluster('apps/ts/socket.io-common', {
        workers: 1,
        sticky: false,
      });
      app.ready().then(() => {
        const socket = client('/ts_of', { port: basePort });
        socket.on('connect', () => {
          socket.emit('chat', '');
        });
        socket.on('disconnect', () => app.close().then(done, done));
        socket.on('res', msg => {
          assert(msg === 'tsHello!');
          socket.close();
        });
      });
    });
  });
});

function clean(name) {
  const logPath = path.join(__dirname, 'fixtures/apps', name, 'logs');
  const runPath = path.join(__dirname, 'fixtures/apps', name, 'run');

  fs.rmSync(logPath, { recursive: true, force: true });
  fs.rmSync(runPath, { recursive: true, force: true });
}

function getErrorLogContent(name) {
  const logPath = path.join(
    __dirname,
    'fixtures/apps',
    name,
    'logs',
    name,
    'common-error.log'
  );
  return fs.readFileSync(logPath, 'utf8');
}

function contains(content, match) {
  return content.split('\n').filter(line => line.indexOf(match) >= 0).length;
}
