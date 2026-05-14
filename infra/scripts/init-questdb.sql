-- =============================================================================
-- Obscura Trading Engine — QuestDB Schema Initialization
-- Run via: curl -G http://localhost:9000/exec --data-urlencode "query@init-questdb.sql"
-- Or paste into QuestDB Web Console at http://localhost:9000
-- =============================================================================

-- Primary klines table for OHLCV candle data
-- SYMBOL type hashes strings like 'BTCUSDT' into integers for RAM efficiency
CREATE TABLE IF NOT EXISTS klines (
    symbol SYMBOL,
    open DOUBLE,
    high DOUBLE,
    low DOUBLE,
    close DOUBLE,
    volume DOUBLE,
    timestamp TIMESTAMP
) TIMESTAMP(timestamp) PARTITION BY MONTH;

-- Optional: Trades table for future order tracking (Phase 2)
-- CREATE TABLE IF NOT EXISTS trades (
--     symbol SYMBOL,
--     direction SYMBOL,       -- 'LONG' or 'SHORT'
--     score INT,
--     decision SYMBOL,        -- 'ENTER FULL SIZE', 'ENTER SCALED SIZE'
--     entry_price DOUBLE,
--     timestamp TIMESTAMP
-- ) TIMESTAMP(timestamp) PARTITION BY MONTH;
