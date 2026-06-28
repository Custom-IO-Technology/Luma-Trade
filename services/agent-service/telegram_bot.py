import os
import json
import asyncio
from telegram import Update
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters,
)
from db import (
    get_tracked_coins,
    add_tracked_coin,
    remove_tracked_coin,
    save_alert,
    get_alerts,
)
from llm_client import LLMClientFactory
from scheduler import trigger_morning_report, gather_market_data
from indicators import get_latest_indicators
import requests

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
RUST_ENGINE_URL = os.getenv("RUST_ENGINE_URL", "http://engine:8000")

async def get_gemini_analysis_for_symbol(symbol: str) -> str:
    """
    Utility to run Gemini text analysis for a coin using current Rust Engine technical calculations.
    """
    try:
        # Fetch data
        hist_url = f"{RUST_ENGINE_URL}/api/history/{symbol}?interval=60"
        hist_res = requests.get(hist_url, timeout=5)
        
        score_url = f"{RUST_ENGINE_URL}/api/widgets/score/{symbol}?interval=60"
        score_res = requests.get(score_url, timeout=5)
        
        candles = []
        indicators = {}
        score_data = {}
        
        if hist_res.status_code == 200:
            candles = hist_res.json().get("data", [])
            if candles:
                indicators = get_latest_indicators(candles)
                
        if score_res.status_code == 200:
            score_data = score_res.json()
            
        indicator_payload = {
            "price": candles[-1]["close"] if candles else 0,
            "confidence_score": score_data.get("score", 0),
            "status": score_data.get("status", "WATCHING"),
            "decision": score_data.get("decision", "AWAITING SIGNAL"),
            "indicators": indicators
        }
        
        client = LLMClientFactory.get_client()
        
        prompt = f"""
        Perform a professional technical analysis of {symbol}.
        Here is the current market indicators payload:
        {json.dumps(indicator_payload, indent=2)}
        
        Provide the analysis structured as:
        1. **Current Trend**: Moving averages (EMA55, EMA200) alignment and price action description.
        2. **Support & Resistance**: Key price levels to watch.
        3. **Best Entry (Input)**: Ideal entry price or trigger condition.
        4. **Best Exit (Output)**: Targets and stop-loss rules.
        5. **Best Strategy**: Recommended execution plan (Breakout, Retest, Swing) with a justification.
        """
        
        result = await client.chat(prompt, "You are a professional expert trading analyst bot.")
        return result
    except Exception as e:
        return f"⚠️ Analysis failed: {e}"

# --- Slash Command Handlers ---
async def start_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    msg = (
        "🌑 *LUMINA TRADE AGENT ONLINE* 🌑\n\n"
        "Welcome! I am your conversational agent. You can talk to me in natural language, or use the commands below:\n\n"
        "📊 *Market Commands*\n"
        "• `/status` - Show tracked coins, live prices, and current scores\n"
        "• `/add <coin>` - Add a coin to watchlist (max 10, e.g. `/add SOL`)\n"
        "• `/remove <coin>` - Remove a coin from watchlist\n"
        "• `/analyze <coin>` - Request Gemini deep analysis on a coin\n"
        "• `/morning_report` - Trigger unified morning report instantly\n\n"
        "⚡ *Alert Commands*\n"
        "• `/alerts` - View active indicator alerts\n"
        "• `/help` - Show this menu"
    )
    await update.message.reply_text(msg, parse_mode="Markdown")

async def status_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    coins = get_tracked_coins()
    if not coins:
        await update.message.reply_text("Watchlist is currently empty. Add a coin using `/add <symbol>`.")
        return
        
    await update.message.reply_text("⏳ Gathering market status...")
    
    report = "📈 *Lumina Tracked Coins Status* 📈\n\n"
    for coin in coins:
        try:
            score_url = f"{RUST_ENGINE_URL}/api/widgets/score/{coin}?interval=5"
            res = requests.get(score_url, timeout=3)
            if res.status_code == 200:
                data = res.json()
                score = data.get("score", 0)
                status = data.get("status", "WATCHING")
                decision = data.get("decision", "CALCULATING")
                report += f"• *{coin}*: Score: *{score}%* | State: `{status}` | Decision: _{decision}_\n"
            else:
                report += f"• *{coin}*: Ingesting / offline\n"
        except Exception:
            report += f"• *{coin}*: Error fetching score\n"
            
    await update.message.reply_text(report, parse_mode="Markdown")

async def add_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("Usage: `/add <coin>` (e.g. `/add SOLUSDT`)", parse_mode="Markdown")
        return
    symbol = context.args[0].upper().strip()
    if not symbol.endswith("USDT"):
        symbol += "USDT"
        
    try:
        success = add_tracked_coin(symbol)
        if success:
            await update.message.reply_text(f"✅ Added *{symbol}* to database tracking.", parse_mode="Markdown")
        else:
            await update.message.reply_text(f"*{symbol}* is already in the watchlist.", parse_mode="Markdown")
    except ValueError as e:
        await update.message.reply_text(f"❌ Error: {e}")

async def remove_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("Usage: `/remove <coin>` (e.g. `/remove SOLUSDT`)", parse_mode="Markdown")
        return
    symbol = context.args[0].upper().strip()
    if not symbol.endswith("USDT"):
        symbol += "USDT"
        
    success = remove_tracked_coin(symbol)
    if success:
        await update.message.reply_text(f"❌ Removed *{symbol}* from tracking.", parse_mode="Markdown")
    else:
        await update.message.reply_text(f"*{symbol}* not found in watchlist.")

async def analyze_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("Usage: `/analyze <coin>` (e.g. `/analyze BTCUSDT`)", parse_mode="Markdown")
        return
    symbol = context.args[0].upper().strip()
    if not symbol.endswith("USDT"):
        symbol += "USDT"
        
    await update.message.reply_text(f"🧠 Querying Gemini Market Analyzer for *{symbol}*...", parse_mode="Markdown")
    analysis = await get_gemini_analysis_for_symbol(symbol)
    await update.message.reply_text(analysis, parse_mode="Markdown")

async def morning_report_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("⏳ Generating unified morning report...")
    await trigger_morning_report()

async def alerts_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    alerts = get_alerts(only_active=True)
    if not alerts:
        await update.message.reply_text("No active indicator alerts set.")
        return
        
    msg = "⚡ *Active Alert Triggers* ⚡\n\n"
    for a in alerts:
        msg += f"• *{a['symbol']}*: {a['indicator'].upper()} {a['operator']} {a['value']:,.2f}\n"
    await update.message.reply_text(msg, parse_mode="Markdown")

# --- Conversational Dispatcher via Local LLM ---
async def handle_conversation(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_text = update.message.text
    
    # We use a system instruction to ask the local LLM to parse intent or reply conversationally
    system_instruction = (
        "You are Lumina Trade's conversational routing agent. "
        "Analyze the user prompt. "
        "If the user wants to analyze/scan/check a coin, reply ONLY with a JSON object format: "
        '{"task": "analyze", "symbol": "BTCUSDT"} '
        "(resolve bare coins to USDT, e.g. 'sol' -> 'SOLUSDT'). "
        "If the user wants to add/create a trigger alert, reply ONLY with a JSON: "
        '{"task": "add_alert", "symbol": "BTCUSDT", "indicator": "price", "operator": ">", "value": 65000} '
        "(indicators supported: price, rsi, macd, ema55, ema200; operators supported: >, <, cross_up, cross_down). "
        "If the user is saying hello or asking general questions, reply conversationally as a helpful trading bot."
    )
    
    # Instantiate local LLM client via factory (or a simulated client fallback)
    try:
        client = LLMClientFactory.get_client() # Will be OllamaLLMClient if configured, or Gemini as fallback
        response = await client.chat(user_text, system_instruction)
        
        # Check if response is a JSON command
        cleaned = response.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
        
        try:
            cmd = json.loads(cleaned)
            task = cmd.get("task")
            
            if task == "analyze":
                symbol = cmd.get("symbol", "BTCUSDT").upper()
                await update.message.reply_text(f"🤖 [Local Agent Command Detected]\nPassing analysis task for *{symbol}* to Gemini Market Analyzer Agent...", parse_mode="Markdown")
                analysis = await get_gemini_analysis_for_symbol(symbol)
                await update.message.reply_text(analysis, parse_mode="Markdown")
                return
                
            elif task == "add_alert":
                symbol = cmd.get("symbol", "BTCUSDT").upper()
                indicator = cmd.get("indicator", "price").lower()
                operator = cmd.get("operator", ">")
                value = float(cmd.get("value", 0.0))
                
                save_alert(symbol, indicator, operator, value)
                await update.message.reply_text(f"🤖 [Local Agent Command Detected]\n✅ Saved active trigger alert: *{symbol}* {indicator.upper()} {operator} {value:,.2f}", parse_mode="Markdown")
                return
                
        except (json.JSONDecodeError, ValueError, TypeError):
            # Not a JSON task command, handle as normal chat
            pass
            
        # Reply with conversational output
        await update.message.reply_text(response)
        
    except Exception as e:
        await update.message.reply_text(f"Conversational Agent Error: {e}")

# --- Bot Application Builder ---
async def start_bot_async():
    if not TELEGRAM_BOT_TOKEN:
        print("[Telegram Bot Warning] Bot token is missing. Bot will not run.")
        return
        
    app = ApplicationBuilder().token(TELEGRAM_BOT_TOKEN).build()
    
    # Command handlers
    app.add_handler(CommandHandler("start", start_cmd))
    app.add_handler(CommandHandler("help", start_cmd))
    app.add_handler(CommandHandler("status", status_cmd))
    app.add_handler(CommandHandler("add", add_cmd))
    app.add_handler(CommandHandler("remove", remove_cmd))
    app.add_handler(CommandHandler("analyze", analyze_cmd))
    app.add_handler(CommandHandler("morning_report", morning_report_cmd))
    app.add_handler(CommandHandler("alerts", alerts_cmd))
    
    # Conversation text message handler (Local LLM Router)
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_conversation))
    
    await app.initialize()
    await app.start()
    await app.updater.start_polling()
    print("[Telegram Bot] Bot is running and polling commands...")
