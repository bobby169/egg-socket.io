export default {
  io: {
    namespace: {
      '/': {
        connectionMiddleware: [ 'middleware' ],
        packetMiddleware: [ 'packetware' ],
      },
      'ts_of': {},
    },
  },
  keys: '123',
};
