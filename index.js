const express = require('express');
const { Connection, PublicKey } = require('@solana/web3.js');
const axios = require('axios');
const app = express();
app.use(express.json());

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=9a18ceb1-e9cb-40fa-befb-0f8d116eb7a8'); // Your Helius key
const TELEGRAM_BOT_TOKEN = '8429257799:AAGSa3_Om8m2C12ogx-PqLNH3DyqmDad_fA'; // Your token
const TELEGRAM_CHAT_ID = '584252358'; // Your chat ID
const WATCHED_WALLETS = [
  '77YuVEQ7eb8z8NNMXFFWw9kMxvQAkY7jQZcL2GPF8G6F',
  'CBYYNm3cgcjdWgUYevX83v9fpEnWyJjgbdy57FE12pVA',
  '3H4GRCwM7Vuqbss84JDENECskVMzHx8LMNbwDh9j2PWJ',
  'EHg5YkU2SZBTvuT87rUsvxArGp3HLeye1fXaSDfuMyaf',
  '4Be9CvxqHW6BYiRAxW9Q3xu1ycTMWaL5z8NX4HR3ha7t',
  '6QSc2CxSdkUQSXttkceR9yMuxMf36L75fS8624wJ9tXv',
  'cGxeYN6F7T9aELwjLPeL3hnJNscGU7EHg5CEsP4B3Hz'
];

async function sendTelegramAlert(message) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown'
    });
  } catch (err) {
    console.log('Telegram error:', err);
  }
}

app.post('/webhook', async (req, res) => {
  const events = req.body || [];
  let recentHits = [];

  for (const event of events) {
    const tokenTransfers = event.tokenTransfers || [];
    for (const transfer of tokenTransfers) {
      if (transfer.tokenStandard === 'Fungible' && WATCHED_WALLETS.includes(transfer.toUserAccount)) {
        const mint = new PublicKey(transfer.mint);
        try {
          const supplyInfo = await connection.getTokenSupply(mint);
          const totalSupply = parseFloat(supplyInfo.value.amount) / Math.pow(10, supplyInfo.value.decimals);
          const transferAmount = parseFloat(transfer.tokenAmount.asDecimal) || (parseFloat(transfer.tokenAmount.amount) / Math.pow(10, transfer.tokenAmount.decimals) || 0);

          // Pure receive check: No SOL outflow from watched wallet
          const nativeTransfers = event.nativeTransfers || [];
          const isPureReceive = !nativeTransfers.some(nt => 
            nt.fromUserAccount === transfer.toUserAccount && parseFloat(nt.tokenAmount.asDecimal) > 0
          );

          if (isPureReceive && transferAmount / totalSupply > 0.003 && transferAmount / totalSupply <= 1.0) {
            recentHits.push({ wallet: transfer.toUserAccount, mint: transfer.mint, timestamp: Date.now() });
            const cabalCount = recentHits.filter(h => h.mint === transfer.mint && (Date.now() - h.timestamp) < 300000).length;
            const alertMsg = `*🚨 PURE SUPPLY RECEIVE*\n` +
                            `*Wallet:* ${transfer.toUserAccount.slice(0,8)}...\n` +
                            `*CA:* \`${transfer.mint}\`\n` +
                            `*Amount:* ${transferAmount.toFixed(0)} tokens (${((transferAmount / totalSupply) * 100).toFixed(1)}% supply)\n` +
                            `*Cabal:* ${cabalCount > 1 ? `${cabalCount} wallets hit` : 'Solo'}\n` +
                            `*Tx:* [View on Solscan](https://solscan.io/tx/${event.signature})\n` +
                            `*Time:* ${new Date().toLocaleString()}\n\n` +
                            `Vet: Birdeye/RugCheck for meta fit.`;
            await sendTelegramAlert(alertMsg);
          }
        } catch (error) {
          console.log('Supply error:', error);
        }
      }
    }
  }
  res.status(200).send('OK');
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Signals live on port ${port}`));
