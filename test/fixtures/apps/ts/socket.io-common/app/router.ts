import { Application } from 'egg';

export default (app: Application) => {
  app.io.route('chat', app.io.controller.chat.ping);
  app.io.of('ts_of').route('chat', app.io.controller.chat.namespacedPing);
};
