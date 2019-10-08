import Linebot from 'linebot'
const bot = Linebot({
    channelId: '1653318480',
    channelSecret: 'de3b387c0ad66650ebfe15f21d1a4fc8',
    channelAccessToken: 'wfB79E8JugjnoFgK3Sipu7gMe2pvyMDoMnupyyBSe60M1x8wH7qjtOhVHGRj9o+8ehG9n3JtHegFn7tNVwTx40jiw6YxnPShXQFPvQ7HQ3vd1pacGATnMZaVxZGWsGGXTUNm6BD48u5G5wzHAgLiSAdB04t89/1O/w1cDnyilFU=',
});
bot.on('message', event => {
    if (event.message.type === 'text') {
        let msg = event.message.text;
        event.reply(msg).then(data => {
            console.log(msg);
        }).catch(function(error) {
            console.log('error：'+error);
        });
    }
});
export const linebotParser = bot.parser();
export default function line() {
    return 123;
}