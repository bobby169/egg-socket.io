import { Context } from 'egg';

export default () => {
    return async (ctx: Context, next: Function) => {
        await next();
        ctx.socket.emit('onAfter', 'After happens!');
    };
};
