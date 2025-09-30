import Alpaca from '@alpacahq/alpaca-trade-api';

export async function runTradingLogic(user) {
  if (!user.alpaca_key || !user.alpaca_secret) {
    console.log('User', user.id, 'has no keys, skipping');
    return;
  }

  const alpaca = new Alpaca({
    keyId: user.alpaca_key,
    secretKey: user.alpaca_secret,
    paper: true,
    
  });

  try {
    const account = await alpaca.getAccount();
    console.log('User', user.id, 'account status', account.status);
  } catch (err) {
    console.error('Alpaca error for user', user.id, err.message || err);
  }
}



const axios = require("axios");
const WebSocket = require('ws');

const sendTelegramMessage = async (message) => {
    const chatIds = [
        process.env.TELEGRAM_CHAT_ID_PRIVATE, // la tua chat privata
        
        process.env.TELEGRAM_CHAT_ID_CHANNEL  // il canale
    ];

    for (const chatId of chatIds) {
        try {
            const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
            await axios.post(url, {
                chat_id: chatId,
                text: message,
                parse_mode: "Markdown"
            });
        } catch (error) {
            console.error(`❌ Error sending to ${chatId}:`, error.response?.data || error.message);
        }
    }
};

const getTradableCryptos = async () => {
    try {
        const assets = await alpaca.getAssets({

            status: 'active',
            asset_class: 'crypto',
        });
        // Exclude 
        return assets
        .filter(asset => 
            !asset.symbol.toLowerCase().includes('shib') &&
            !asset.symbol.toLowerCase().includes('pepe') &&
            !asset.symbol.toLowerCase().includes('usdt')
        )
        .map(asset => ({ symbol: asset.symbol }));
    } catch (error) {
        console.error('Error fetching tradable cryptocurrencies:', error);
        return [];
    }
};

// Cooldown Map and Cooldown Period (1 hour in milliseconds)
const cooldowns = new Map();
const COOLDOWN_PERIOD = 60 * 60 * 1000; // 1 hour

// Function to get crypto bars for a symbol
const getCryptoBars = async ({ symbol, limit = 50}) => {
    try {
        const encodedSymbol = encodeURIComponent(symbol);
        const url = `https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=${encodedSymbol}&timeframe=5Min&limit=${limit}`;
        const options = {
            method: "GET",
            url: url,
            headers: {
                accept: "application/json",
                "APCA-API-KEY-ID": process.env.APCA_API_KEY_ID,
                "APCA-API-SECRET-KEY": process.env.APCA_API_SECRET_KEY,
            },
        };

        const response = await axios.request(options);
        const barsData = response.data.bars;
        if (barsData && barsData[symbol] && Array.isArray(barsData[symbol])) {
            return barsData[symbol];
        } else {
            console.warn(`No valid bars data found for ${symbol}`);
            return [];
        }
    } catch (e) {
        console.error(`Error retrieving bars for ${symbol}:`, e.response ? e.response.data : e.message);
        return [];
    }
};

// Improved Function to get the latest crypto bar for a symbol
const getCryptoBar = async ({ symbol }) => {
    try {
        const encodedSymbol = encodeURIComponent(symbol);
        const url = `https://data.alpaca.markets/v1beta3/crypto/us/latest/bars?symbols=${encodedSymbol}`;
        const options = {
            method: "GET",
            url: url,
            headers: {
                accept: "application/json",
                "APCA-API-KEY-ID": process.env.APCA_API_KEY_ID,
                "APCA-API-SECRET-KEY": process.env.APCA_API_SECRET_KEY,
            },
        };

        const response = await axios.request(options);
        const barsData = response.data.bars;

        if (barsData && barsData[symbol]) {
            const latestBar = barsData[symbol];
            console.log(`Latest price for ${symbol}: $${latestBar.c}`); // Log the last minute closing price
            return latestBar; // Return the latest bar
        } else {
            console.warn(`No valid bars data found for ${symbol}`);
            return null;
        }
    } catch (e) {
        console.error(`Error retrieving bars for ${symbol}:`, e.response ? e.response.data : e.message);
        return null;
    }
};

// Function to place a market buy order
const buyMarket = async ({ symbol, amt }) => {
    try {
        const order = await alpaca.createOrder({
            symbol,
            qty: amt.toString(),
            side: "buy",
            type: "market",
            time_in_force: "ioc",
        });
        console.log(`Market buy order executed for ${amt} units of ${symbol}. Order ID: ${order.id}`);
        return order;
    } catch (e) {
        console.error(`Error placing market buy order for ${symbol}:`, e.response ? e.response.data : e.message);
        return null;
    }
};

// Function to place a market sell order
const sellMarket = async ({ symbol, amt }) => {
    try {
        const order = await alpaca.createOrder({
            symbol,
            qty: amt.toString(),
            side: "sell",
            type: "market",
            time_in_force: "gtc",
        });
        console.log(`Market sell order executed for ${amt} units of ${symbol}. Order ID: ${order.id}`);
        return order;
    } catch (e) {
        console.error(`Error placing market sell order for ${symbol}:`, e.response ? e.response.data : e.message);
        return null;
    }
};

const trailingStopPercentage = 0.0025; // 0.25% trailing stop percentage



// Function to monitor all open positions and execute trailing stop or stop loss
const monitorAllPositions = async () => {
    console.log(`Monitoring all open positions...`);
    for (const [symbol, position] of openPositions.entries()) {
        if (position) {
            const { takeProfitPrice, stopLossPrice, amountToSell } = position;
            const latestBar = await getCryptoBar({ symbol });

            if (latestBar) {
                const currentPrice = latestBar.c; // Assuming `c` represents the closing price
                console.log(`Current price for ${symbol}: $${currentPrice}`);

                if (position.trailingStopActivated) {
                    // Update highest price if current price is higher
                    if (currentPrice > position.highestPrice) {
                        position.highestPrice = currentPrice;
                        console.log(`New highest price for ${symbol}: $${position.highestPrice}`);
                    } 
                    // Check if price has dropped by trailing stop percentage from highest price
                    else if (currentPrice <= position.highestPrice * (1 - trailingStopPercentage)) {
                        console.log(`Trailing stop triggered for ${symbol} at $${currentPrice}`);
                        await sellMarket({ symbol, amt: amountToSell });
                        await sendTelegramMessage(`📈 Trailing Take Profit per ${symbol} Prezzo corrente: $${currentPrice}`);
                        // Set cooldown for 1 hour
                        cooldowns.set(symbol, Date.now() + COOLDOWN_PERIOD);
                        openPositions.delete(symbol); // Remove position after selling
                    } else {
                        console.log(`Trailing stop active for ${symbol}. Highest Price: $${position.highestPrice}`);
                    }
                } else {
                    if (currentPrice >= takeProfitPrice) {
                        console.log(`Take Profit price reached for ${symbol} at $${currentPrice}`);
                        await sendTelegramMessage(`📈 Take Profit per ${symbol} Prezzo corrente: $${currentPrice}`);
                        // Activate trailing stop
                        position.trailingStopActivated = true;
                        position.highestPrice = currentPrice;
                        console.log(`Trailing stop activated for ${symbol} at $${currentPrice}`);
                        await sendTelegramMessage(`Trailing stop activated  ${symbol} at $${currentPrice}`);
                    } else if (currentPrice <= stopLossPrice) {
                        console.log(`Stop Loss price reached for ${symbol} at $${currentPrice}`);
                        await sendTelegramMessage(`🔴 *STOP LOSS * \nSymbol: ${symbol}\nPrice: $${currentPrice}`);

                        await sellMarket({ symbol, amt: amountToSell });
                        openPositions.delete(symbol); // Remove position after selling
                    }
                }
            } else {
                console.warn(`Unable to retrieve the current price for ${symbol}. Retrying in a minute.`);
            }
        }
    }
};


function calculateEMA(prices, period) { 

    if (prices.length < period) {
        console.error(`Not enough data for EMA. Need at least ${period} prices.`);
        return null;
    }

    const k = 2 / (period + 1); // Smoothing factor
    let ema = prices[0]; // Start EMA with first close

    for (let i = 1; i < prices.length; i++) {
        ema = prices[i] * k + ema * (1 - k);
    }

    return ema;
}




// Function to calculate Relative Strength Index (RSI)
const calculateRSI = (bars, period) => { 

    if (bars.length < period + 1) {
        console.error("Not enough bars to calculate RSI.");
        return null;
    }
    let gains = 0, losses = 0;
    for (let i = bars.length - period; i < bars.length - 1; i++) {
        const change = bars[i + 1].c - bars[i].c;
        if (change > 0) gains += change;
        else losses -= change;
    }
    const averageGain = gains / period;
    const averageLoss = losses / period;
    if (averageLoss === 0) return 100;
    const rs = averageGain / averageLoss;
    return 100 - 100 / (1 + rs);
};

// Function to calculate Average True Range (ATR)
const calculateATR = (bars, period = 14) => { 

    if (bars.length < period) {
        console.error("Not enough bars to calculate ATR.");
        return null;
    }
    let sum = 0;
    for (let i = bars.length - period; i < bars.length; i++) {
        const currentHigh = bars[i].h;
        const currentLow = bars[i].l;
        const previousClose = i > 0 ? bars[i - 1].c : bars[i].c;
        const trueRange = Math.max(
            currentHigh - currentLow,
            Math.abs(currentHigh - previousClose),
            Math.abs(currentLow - previousClose)
        );
        sum += trueRange;
    }
    return sum / period;
};

// Function to calculate Support and Resistance
const calculateSupportResistance = (bars) => { 
    if (!bars || bars.length === 0) {
        console.error("Not enough bars to calculate Support/Resistance.");
        return { support: null, resistance: null };
    }
    const highs = bars.map(bar => bar.h);
    const lows = bars.map(bar => bar.l);
    return {
        resistance: Math.max(...highs),
        support: Math.min(...lows)
    };
};




function detectHigherLows(bars) {
    if (bars.length < 21) {
        console.error("Not enough bars to detect higher lows. Need at least 21.");
        return { higherLow: false, lowestPrice: null };
    }

    const last21Bars = bars.slice(-21).reverse();
    console.log("Checking last 21 closing prices:", last21Bars.map(b => b.c));

    // Find the lowest closing price within the last 21 bars
    let minIndex = 0;
    let minClose = last21Bars[0].c;
    for (let i = 1; i < last21Bars.length; i++) {
        if (last21Bars[i].c < minClose) {
            minClose = last21Bars[i].c;
            minIndex = i;
        }
    }

    console.log(`Detected lowest closing price: ${minClose} at local index ${minIndex}`);



}

// Memory map to track state per symbol
const recoverySetups = new Map();

// Phase 1: Detect recent lowest low in last 480 bars
function detectRecentLowestLow(bars, window = 100) {
    if (bars.length < window) {
        console.log(`⛔ Not enough bars to detect swing low. Needed: ${window}, Available: ${bars.length}`);
        return { found: false };
    }

    const lastIndex = bars.length - 1;
    const currentLow = bars[lastIndex].l;
    console.log(`🔍 Checking swing low at index ${lastIndex} with low = ${currentLow}`);

    for (let i = bars.length - window; i < lastIndex; i++) {
        console.log(`↩️ Comparing to bar[${i}].low = ${bars[i].l}`);
        if (bars[i].l <= currentLow) {
            console.log(`❌ Bar[${i}] has a lower or equal low (${bars[i].l}) than current low (${currentLow})`);
            return { found: false };
        }
    }

        // 📌 New: Check if current low is at least 4% below the highest high in ALL bars
    let highestHigh = -Infinity;
    for (let i = 0; i < bars.length; i++) {
        if (bars[i].h > highestHigh) {
            highestHigh = bars[i].h;
        }
    }
    const dropPercent = ((highestHigh - currentLow) / highestHigh) * 100;
    console.log(`📉 Drop from highest high = ${dropPercent.toFixed(2)}%`);
    if (dropPercent < 4) {
        console.log(`❌ Drop is less than 4%, not confirming swing low`);
        return { found: false };
    }

    console.log(`✅ Swing low found at index ${lastIndex}, price = ${currentLow}`);
    return { found: true, index: lastIndex, price: currentLow };
}


// Phase 2: Bullish engulfing right after swing low
function detectBullishEngulfing(bars, index) {
    if (index + 1 >= bars.length) {
        console.log(`⛔ Not enough bars after swing low to check engulfing at index ${index}`);
        return false;
    }

    
    const prev = bars[index];
    const curr = bars[index + 1];

    console.log(`🔍 Checking bullish engulfing at index ${index + 1}`);
    console.log(`Prev: o=${prev.o}, c=${prev.c} | Curr: o=${curr.o}, c=${curr.c}`);

    const isEngulfing =
        prev.c < prev.o &&
        curr.c > curr.o &&
        curr.c > prev.o &&
        curr.o < prev.c;

    if (isEngulfing) {
        console.log(`✅ Bullish engulfing detected.`);
    } else {
        console.log(`❌ No bullish engulfing.`);
    }

    return isEngulfing;
}

// Phase 3: Confirm pullback does NOT break below the *engulfing* low
function checkPullbackHolds(bars, engulfingIndex) {
    const pullbackIndex = engulfingIndex + 1;

    if (pullbackIndex >= bars.length) {
        console.log(`⏳ Waiting for pullback bar at index ${pullbackIndex} — not enough bars yet.`);
        return null;
    }

    const pullbackBar = bars[pullbackIndex];
    const engulfingBar = bars[engulfingIndex];

    if (!pullbackBar || !engulfingBar || pullbackBar.l === undefined || engulfingBar.l === undefined) {
        console.log(`❌ Invalid or missing bar(s) for pullback check.`);
        return null;
    }

    console.log(`🔍 Checking pullback: pullback low = ${pullbackBar.l}, engulfing low = ${engulfingBar.l}`);

    if (pullbackBar.l > engulfingBar.l) {
        console.log(`✅ Pullback holds above engulfing low.`);
        return true;
    } else {
        console.log(`❌ Pullback broke below engulfing low.`);
        return false;
    }
}


function calculateBollingerBands(bars, period = 10) {
    if (bars.length < period) {
        console.log(`⛔ Not enough bars to calculate Bollinger Bands. Needed: ${period}, Available: ${bars.length}`);
        return null;
    }

    const closes = bars.slice(-period).map(bar => bar.c);
    const mean = closes.reduce((sum, p) => sum + p, 0) / closes.length;
    const variance = closes.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    const upper = mean + 2 * stdDev;
    const lower = mean - 2 * stdDev;

    console.log(`📈 Bollinger Bands: Middle = ${mean.toFixed(2)}, Upper = ${upper.toFixed(2)}, Lower = ${lower.toFixed(2)}`);

    return {
        middle: mean,
        upper,
        lower,
    };
}





// Function to calculate Average Volume
const averageVolume = (bars) => {
    if (!bars || bars.length === 0) {
        console.error("Not enough bars to calculate Average Volume.");
        return null;
    }
    const sum = bars.reduce((acc, bar) => acc + bar.v, 0);
    return sum / bars.length;
};

// Track open positions by symbol
const openPositions = new Map();


const getOpenPositionQuantity = async (symbol) => {
    const options = {
        method: 'GET',
        url: 'https://paper-api.alpaca.markets/v2/positions',
        headers: {
            accept: "application/json",
            "APCA-API-KEY-ID": process.env.APCA_API_KEY_ID,
            "APCA-API-SECRET-KEY": process.env.APCA_API_SECRET_KEY,
        },
    };

    try {
        const response = await axios.request(options);
        const positions = response.data;

        // Normalize both formats for symbol comparison
        const normalizedSymbol1 = symbol.replace('/', ''); // e.g., BTC/USD -> BTCUSD
        const normalizedSymbol2 = symbol; // e.g., BTC/USD remains the same

        // Find the position matching either symbol format
        const position = positions.find(pos => pos.symbol === normalizedSymbol1 || pos.symbol === normalizedSymbol2);

        if (position) {
            return parseFloat(position.qty);
        } else {
            console.warn(`No open position found for ${symbol}`);
            return 0;
        }
    } catch (err) {
        console.error(`Error retrieving positions: ${err}`);
        return 0;
    }
};




const closingBarsMap = new Map(); // Stores full bars for each symbol

const tradeSetupMap = new Map(); // Stores trade setups for each symbol

const initPostBuyStrategy = async (symbol, entryPrice) => {
    // Check if the symbol is in cooldown
    const now = Date.now();
    const cooldownEndTime = cooldowns.get(symbol);
    if (cooldownEndTime && now < cooldownEndTime) {
        console.log(`Symbol ${symbol} is in cooldown until ${new Date(cooldownEndTime).toLocaleTimeString()}. Skipping new trade.`);
        return;
    }

    if (openPositions.get(symbol)) {
        console.log(`There is already an open position for ${symbol}. Ignoring new trade.`);
        return;
    }

    const maxBars = 100; // The number of bars needed for indicators

    // Retrieve or initialize the bars array for the symbol
    let bars = closingBarsMap.get(symbol) || [];
    const state = recoverySetups.get(symbol) || { phase: 1 };

    // Fetch the latest bar
    const latestBar = await getCryptoBar({ symbol });

    if (latestBar && latestBar.c) { // Ensure latestBar is valid and has closing price
        bars.push(latestBar); // Store full bar, not just close price
    } else {
        console.warn(`No valid bar data found for ${symbol}. Skipping update.`);
        return;
    }

    if (bars.length > maxBars) {
        bars.shift();
        if (state && state.swingLowIndex !== undefined && state.swingLowIndex > 0) {
            state.swingLowIndex -= 1;
        }
        if (state.engulfingIndex !== undefined && state.engulfingIndex > 0) {
            state.engulfingIndex -= 1;
        }
        
    }
    

    // Save updated bars back to the map
    closingBarsMap.set(symbol, bars);


    // Ensure we have enough data before calculating indicators
    if (bars.length < maxBars) {
        console.log(`Waiting for more data... (${bars.length}/${maxBars})`);
        return;
    }




  

    // Convert bars to an array of closing prices for EMA
    const closingPrices = bars.map(bar => bar.c);

    // Calculate indicators
    const shortEMA = calculateEMA(closingPrices, 3);
    const longEMA = calculateEMA(closingPrices, 8);
    const rsi = calculateRSI(bars, 20);
    const atr = calculateATR(bars, 14);
    const { resistance, support } = calculateSupportResistance(bars);
    
    console.log(`
        Short EMA: ${shortEMA}, Long EMA: ${longEMA}
        RSI: ${rsi}, ATR: ${atr}
        Resistance: ${resistance}, Support: ${support}
        
    `);

    if (state.phase === 1) {


        const { found, index, price } = detectRecentLowestLow(bars, 100);
        if (found) {
            console.log(`[${symbol}] 🟡 Phase 1: Swing low detected at ${price} (index ${index})`);
            recoverySetups.set(symbol, {
                phase: 2,
                swingLowPrice: price,
                swingLowIndex: index
            });
        }
        return;
    }



    if (state.phase === 2) {
        const lastIndex = bars.length - 1;
        const currentLow = bars[lastIndex].c;
        // Try to find bullish engulfing in the next 2 bars after swing low
            let engulfingFound = false;
            let engulfingIndex = null;
    
        // If a new lower low is found after the swing low, reset to phase 1
if (lastIndex > state.swingLowIndex && currentLow < state.swingLowPrice) {
    console.log(`[${symbol}] 🔁 New lower low found (${currentLow} < ${state.swingLowPrice}) — updating swing low and retrying Phase 2`);
    recoverySetups.set(symbol, {
        phase: 2,
        swingLowPrice: currentLow,
        swingLowIndex: lastIndex
    });
    return;
}

    
        for (let i = 1; i <= 2; i++) {
            const checkIndex = state.swingLowIndex + i;
        
            if (checkIndex >= bars.length) {
                console.log(`[${symbol}] ⏳ Waiting for bar at index ${checkIndex} to form`);
                break;
            }
        
            if (detectBullishEngulfing(bars, state.swingLowIndex)) {
                engulfingFound = true;
                engulfingIndex = checkIndex;
                break;
            }
        }
        
        if (engulfingFound) {
            console.log(`[${symbol}] 🟡 Phase 2: Bullish engulfing detected after swing low`);
            recoverySetups.set(symbol, {
                ...state,
                phase: 3,
                engulfingIndex
            });
        } else {
            console.log(`[${symbol}] ❌ No bullish engulfing within 2 bars — resetting to Phase 1`);
            recoverySetups.delete(symbol);
        return;
          }
    }
    
    
    


    if (state.phase === 3) {
        // Check again if structure invalidated (new lower low)
        const lastIndex = bars.length - 1;
        const currentLow = bars[lastIndex].c;
        if (lastIndex > state.swingLowIndex && bars[lastIndex].l < state.swingLowPrice) {
            console.log(`[${symbol}] 🔁 New lower low found in Phase 3 — resetting to Phase 2`);
            recoverySetups.set(symbol, {
                phase: 2,
                swingLowPrice: currentLow,
                swingLowIndex: lastIndex
            });
            return;
        }
        // 2️⃣ Optional: check if current bar is a new bullish engulfing
    if (detectBullishEngulfing(bars, lastIndex - 1)) {
        console.log(`[${symbol}] 🔄 New bullish engulfing detected in Phase 3 — updating engulfing index`);
        recoverySetups.set(symbol, {
            ...state,
            engulfingIndex: lastIndex
        });
        return; // stop here and let the updated engulfing be evaluated next cycle
    }
        const pullbackHolds = checkPullbackHolds(bars, state.engulfingIndex);
        if (!pullbackHolds) {
            const lastIndex = bars.length - 1;
            const currentLow = bars[lastIndex].c;
            console.log(`[${symbol}] 🔴 Pullback failed — price broke swing low`);
            recoverySetups.set(symbol, {
                phase: 2,
                swingLowPrice: currentLow,
                swingLowIndex: lastIndex
            });
            return;
        }
    
        const bb = calculateBollingerBands(bars);
        const lastClose = bars[bars.length - 1].c;
        if (bb && lastClose < bb.lower) {
            console.log(`[${symbol}] ⚠️ Skipping trade — price under lower Bollinger Band`);
            recoverySetups.delete(symbol);
            return;
        }

        console.log(`[${symbol}] ✅ Recovery setup confirmed — entering trade at ${entryPrice}`);
         executeTrade(symbol, entryPrice); // your trade execution logic
        recoverySetups.delete(symbol); // clean up
    }
};




// Execute trade function with full validation
async function executeTrade(symbol, entryPrice) {
    console.log(`Trade conditions confirmed for ${symbol}. Executing buy strategy at price ${entryPrice}.`);
    
    const profitTargetPercentage = 0.02; // 2.3% profit target
    const stopLossPercentage = 0.02;     // 4% stop loss

    const takeProfitPrice = parseFloat((entryPrice * (1 + profitTargetPercentage)).toFixed(9));
    const stopLossPrice = parseFloat((entryPrice * (1 - stopLossPercentage)).toFixed(9));

    const usdToInvest = 1000; // Amount in USD to invest
    const amountToBuy = parseFloat((usdToInvest / entryPrice).toFixed(6));

    console.log(`Starting trade for ${symbol}: Entry Price: $${entryPrice}`);
    console.log(`Quantity to Buy: ${amountToBuy}`);
    console.log(`Take Profit at: $${takeProfitPrice}, Stop Loss at: $${stopLossPrice}`);

    const buyOrder = await buyMarket({ symbol, amt: amountToBuy });

    if (buyOrder) {
        console.log(`Buy order executed for ${symbol}. Order ID: ${buyOrder.id}`);

        // Wait for a moment to ensure the position is updated
        await new Promise(resolve => setTimeout(resolve, 20000));
        await sendTelegramMessage(`🚀 *SEGNALE TRADE * 🚀 \nSymbol: ${symbol}\nEntry Price: $${entryPrice}\nTake Profit: $${takeProfitPrice}\nStop Loss: $${stopLossPrice}`);

        // Mark the position as open
        openPositions.set(symbol, true);

        // Retrieve the total quantity of the open position
        const totalQuantityToSell = await getOpenPositionQuantity(symbol);

        if (totalQuantityToSell > 0) {
            console.log(`Quantity actually bought for ${symbol}: ${totalQuantityToSell}`);

            // Store position details
            openPositions.set(symbol, {
                takeProfitPrice,
                stopLossPrice,
                amountToSell: totalQuantityToSell,
                trailingStopActivated: false,
                highestPrice: null,
            });
        } else {
            console.error(`Unable to retrieve the position for ${symbol} after purchase. Position may not exist or there was an issue updating.`);
        }
    } else {
        console.error(`Failed to execute buy order for ${symbol}.`);
    }
};


// ScalpAlgo class with SMA crossover logic
class ScalpAlgo {
    constructor(api, symbol) {
        this.api = api;
        this.symbol = symbol;
        this.bars = [];
        this.state = null;
        this.order = null;
        this.position = null;

        this.initBars();
    }

    async initBars() {
        try {
            const bars = await getCryptoBars({ symbol: this.symbol });
            if (bars.length > 0) {
                this.bars = bars;
            }
            await this.initState();
        } catch (error) {
            console.error('Error retrieving initial bars:', error);
        }
    }

    async initState() {
        try {
            const orders = await alpaca.getOrders({
                status: 'open',
                symbols: [this.symbol],
            });
            const position = await alpaca.getPosition(this.symbol).catch(() => null);

            this.order = orders.length > 0 ? orders[0] : null;
            this.position = position;

            this.state = this.position ? (this.order ? 'SELL_SUBMITTED' : 'TO_SELL') : (this.order ? 'BUY_SUBMITTED' : 'TO_BUY');
        } catch (error) {
            console.error('Error initializing state:', error);
        }
    }

    async onBar(bar) {
        this.bars.push(bar);

        if (this.bars.length < 21) return;

        const sma20 = this.calculateSMA(20);
        const latestPrice = this.bars[this.bars.length - 1].c;

        if (this.state === 'TO_BUY' && this.bars[this.bars.length - 2].c < sma20 && latestPrice > sma20) {
            console.log(`Buy signal detected for ${this.symbol}.`);
            await this.submitBuy();
        }
    }

    calculateSMA(period) {
        if (this.bars.length < period) return null;
        const sum = this.bars.slice(-period).reduce((acc, bar) => acc + bar.c, 0);
        return sum / period;
    }

    async submitBuy() {
        try {
            const bars = await getCryptoBars({ symbol: this.symbol });
            const latestBar = bars[bars.length - 1];
            const entryPrice = latestBar.c;
            const usdToInvest = 10;
            const amountToBuy = parseFloat((usdToInvest / entryPrice).toFixed(6));

            const buyOrder = await buyMarket({ symbol: this.symbol, amt: amountToBuy });
            this.order = buyOrder;
            this.transition('BUY_SUBMITTED');
            await initPostBuyStrategy(this.symbol, entryPrice);
        } catch (error) {
            console.error('Error submitting buy order:', error);
            this.transition('TO_BUY');
        }
    }

    transition(newState) {
        console.info(`Transitioning from ${this.state} to ${newState}`);
        this.state = newState;
    }
}

const fetchCryptoBarsAndApplyStrategy = async (tradableCryptos) => {
    for (const crypto of tradableCryptos) {
        const { symbol } = crypto;

        // Fetch the latest bar
        const bar = await getCryptoBar({ symbol });
        console.log(`Latest bar fetched for ${symbol}:`, bar);

        if (!bar || typeof bar !== 'object') {
            console.warn(`Invalid or missing bar data for ${symbol}`);
            continue;
        }

        const entryPrice = bar.c;

        if (entryPrice !== undefined) {
            await initPostBuyStrategy(symbol, entryPrice);
        } else {
            console.warn(`Incomplete data for ${symbol}:`, bar);
        }
    }
};


// Initialize and run trading algorithms
(async () => {
    const tradableCryptos = await getTradableCryptos();
    if (tradableCryptos.length === 0) {
        console.error('No tradable cryptocurrencies found. Exiting bot.');
        process.exit(1);
    }

    const fleet = {};
    tradableCryptos.forEach(crypto => {
        fleet[crypto.symbol] = new ScalpAlgo(alpaca, crypto.symbol);
    });

    const ws = new WebSocket('wss://stream.data.alpaca.markets/v2/sip');
    ws.on('open', () => {
        console.log('Connected to Alpaca WebSocket');
        ws.send(JSON.stringify({
            action: 'auth',
            key: process.env.APCA_API_KEY_ID,
            secret: process.env.APCA_API_SECRET_KEY,
        }));
    
        // Subscribe to bars for all tradable cryptos
        tradableCryptos.forEach(crypto => {
            ws.send(JSON.stringify({
                action: 'subscribe',
                bars: [crypto.symbol], // Use the exact format returned by getAssets()
            }));
        });
    });

    ws.on('message', data => {
        try {
            const parsedData = JSON.parse(data);
            if (parsedData.data && parsedData.data.bar && fleet[parsedData.data.bar.S]) {
                fleet[parsedData.data.bar.S].onBar(parsedData.data.bar);
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    setInterval(() => {
        console.clear();
        console.log("Console cleared to reduce clutter.");
    }, 60 * 60 * 1000); // 60 minutes in milliseconds
    
    // Run monitorAllPositions every minute to check for take profit or stop loss
    setInterval(monitorAllPositions, 15000);

    // Initialize the trading strategy for each tradable crypto
    setInterval(() => fetchCryptoBarsAndApplyStrategy(tradableCryptos), 300000);
})();
