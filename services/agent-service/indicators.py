import numpy as np

def calculate_ema(prices, period):
    if len(prices) < period:
        return [np.nan] * len(prices)
    
    ema = []
    multiplier = 2 / (period + 1)
    
    # Simple SMA for the first value
    sma = sum(prices[:period]) / period
    ema.append(sma)
    
    # Calculate EMA for subsequent values
    for i in range(period, len(prices)):
        val = (prices[i] - ema[-1]) * multiplier + ema[-1]
        ema.append(val)
        
    return [np.nan] * (period - 1) + ema

def calculate_rsi(prices, period=14):
    if len(prices) < period + 1:
        return [np.nan] * len(prices)
        
    deltas = np.diff(prices)
    seed = deltas[:period]
    up = seed[seed >= 0].sum() / period
    down = -seed[seed < 0].sum() / period
    
    rsi = []
    if down == 0:
        rsi.append(100)
    else:
        rs = up / down
        rsi.append(100 - (100 / (1 + rs)))
        
    for i in range(period, len(prices) - 1):
        delta = deltas[i]
        if delta > 0:
            up_val = delta
            down_val = 0.0
        else:
            up_val = 0.0
            down_val = -delta
            
        up = (up * (period - 1) + up_val) / period
        down = (down * (period - 1) + down_val) / period
        
        if down == 0:
            rsi.append(100)
        else:
            rs = up / down
            rsi.append(100 - (100 / (1 + rs)))
            
    return [np.nan] * period + rsi

def calculate_macd(prices, fast_period=12, slow_period=26, signal_period=9):
    if len(prices) < slow_period + signal_period:
        return {
            "macd": [np.nan] * len(prices),
            "signal": [np.nan] * len(prices),
            "hist": [np.nan] * len(prices)
        }
        
    ema_fast = np.array(calculate_ema(prices, fast_period))
    ema_slow = np.array(calculate_ema(prices, slow_period))
    
    macd_line = ema_fast - ema_slow
    
    # Drop nan values for signal calculation
    macd_valid = macd_line[slow_period - 1:]
    signal_valid = calculate_ema(macd_valid.tolist(), signal_period)
    
    signal_line = [np.nan] * (slow_period - 1) + signal_valid
    
    hist = []
    for m, s in zip(macd_line, signal_line):
        if np.isnan(m) or np.isnan(s):
            hist.append(np.nan)
        else:
            hist.append(m - s)
            
    return {
        "macd": macd_line.tolist(),
        "signal": signal_line,
        "hist": hist
    }

def calculate_bollinger_bands(prices, period=20, num_std=2):
    if len(prices) < period:
        return {
            "middle": [np.nan] * len(prices),
            "upper": [np.nan] * len(prices),
            "lower": [np.nan] * len(prices)
        }
        
    middle = []
    upper = []
    lower = []
    
    for i in range(len(prices)):
        if i < period - 1:
            middle.append(np.nan)
            upper.append(np.nan)
            lower.append(np.nan)
        else:
            window = prices[i - period + 1 : i + 1]
            ma = sum(window) / period
            std = np.std(window)
            middle.append(ma)
            upper.append(ma + num_std * std)
            lower.append(ma - num_std * std)
            
    return {
        "middle": middle,
        "upper": upper,
        "lower": lower
    }

def get_latest_indicators(candles):
    """
    Given a list of chart candle dicts (keys: close, high, low, open, volume),
    returns a dictionary of the latest technical indicator values.
    """
    if not candles or len(candles) < 30:
        return {}
        
    close_prices = [float(c["close"]) for c in candles]
    latest_close = close_prices[-1]
    
    ema55 = calculate_ema(close_prices, 55)[-1]
    ema200 = calculate_ema(close_prices, 200)[-1]
    
    rsi_list = calculate_rsi(close_prices, 14)
    rsi = rsi_list[-1] if rsi_list else np.nan
    
    macd_data = calculate_macd(close_prices, 12, 26, 9)
    macd = macd_data["macd"][-1]
    macd_signal = macd_data["signal"][-1]
    macd_hist = macd_data["hist"][-1]
    
    bb_data = calculate_bollinger_bands(close_prices, 20, 2)
    bb_upper = bb_data["upper"][-1]
    bb_lower = bb_data["lower"][-1]
    bb_middle = bb_data["middle"][-1]
    
    return {
        "price": latest_close,
        "ema55": float(ema55) if not np.isnan(ema55) else None,
        "ema200": float(ema200) if not np.isnan(ema200) else None,
        "rsi": float(rsi) if not np.isnan(rsi) else None,
        "macd": float(macd) if not np.isnan(macd) else None,
        "macd_signal": float(macd_signal) if not np.isnan(macd_signal) else None,
        "macd_hist": float(macd_hist) if not np.isnan(macd_hist) else None,
        "bb_upper": float(bb_upper) if not np.isnan(bb_upper) else None,
        "bb_lower": float(bb_lower) if not np.isnan(bb_lower) else None,
        "bb_middle": float(bb_middle) if not np.isnan(bb_middle) else None,
    }
