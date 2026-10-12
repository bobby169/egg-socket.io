'use strict';

module.exports = () => {
  return async function () {
    this.socket.emit('chat', 'message send back to client');
  };
};
