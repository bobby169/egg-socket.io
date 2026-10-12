'use strict';

const { Namespace } = require('socket.io');
const assert = require('node:assert');
const is = require('is-type-of');
const debug = require('debug')('egg-socket.io:lib:socket.io:namespace.js');

const RouterConfigSymbol = Symbol.for('EGG-SOCKET.IO#ROUTERCONFIG');

Namespace.prototype.route = function(event, handler) {
  assert(is.isString(event), 'event must be string!');

  if (!this[RouterConfigSymbol]) {
    this[RouterConfigSymbol] = new Map();
  }

  if (!this[RouterConfigSymbol].has(event)) {
    debug('[egg-socket.io] set router config: ', event);
    this[RouterConfigSymbol].set(event, handler);
  }
};
