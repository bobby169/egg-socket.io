'use strict';

module.exports = app => {
  app.get('/home', async ctx => {
    ctx.session.user = { name: 'foo' };
    ctx.body = 'hello';
  });
  app.io.route('chat', app.io.controller.chat);
};
