'use strict';

const fs = require('fs');

module.exports = app => {
  if (fs.existsSync(app.config.disconnectFile)) {
    fs.unlinkSync(app.config.disconnectFile);
  }
  return async (ctx, next) => {
    if (!ctx.session.user) {
      throw new Error('auth failed!');
    }
    ctx.emit('join', app.config.disconnectFile);

    await next();

    fs.writeFileSync(app.config.disconnectFile, 'true');
  };
};
