import { Controller } from 'egg';

declare module 'egg' {
  interface CustomController {
    chat: ChatController
  }
}

export default class ChatController extends Controller {
  async ping() {
    const fromService = await this.ctx.service.chatservice.chatting();
    this.ctx.socket.emit('res', fromService);
  }
  async namespacedPing() {
    await this.ctx.socket.emit('res', 'tsHello!');
  }
}
