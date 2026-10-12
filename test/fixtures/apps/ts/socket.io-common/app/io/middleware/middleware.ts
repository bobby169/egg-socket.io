import { Context } from 'egg';

export default () => {
    return async (ctx: Context) => {
        ctx.socket.emit('onBefore', 'Before happens!');
    };
};
