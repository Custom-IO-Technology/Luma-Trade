import polars as pl
from .base_indicator import AbstractIndicator

class StochRSIIndicator(AbstractIndicator):
    """
    Computes Stochastic RSI (14-period)
    """
    def name(self) -> str:
        return "stoch_rsi"
        
    def compute(self, df: pl.DataFrame) -> pl.DataFrame:
        # First calculate standard RSI (14)
        df = df.with_columns([
            (pl.col("close") - pl.col("close").shift(1)).alias("change")
        ])
        
        df = df.with_columns([
            pl.when(pl.col("change") > 0).then(pl.col("change")).otherwise(0).alias("gain"),
            pl.when(pl.col("change") < 0).then(pl.col("change").abs()).otherwise(0).alias("loss")
        ])
        
        # Simple moving average for RSI computation
        df = df.with_columns([
            pl.col("gain").rolling_mean(window_size=14).alias("avg_gain"),
            pl.col("loss").rolling_mean(window_size=14).alias("avg_loss")
        ])
        
        df = df.with_columns([
            (pl.col("avg_gain") / pl.col("avg_loss")).alias("rs")
        ])
        
        df = df.with_columns([
            pl.when(pl.col("avg_loss") == 0).then(100)
            .otherwise(100 - (100 / (1 + pl.col("rs")))).alias("rsi_14")
        ])
        
        # Then calculate Stochastic RSI from the RSI values
        df = df.with_columns([
            pl.col("rsi_14").rolling_min(window_size=14).alias("rsi_min_14"),
            pl.col("rsi_14").rolling_max(window_size=14).alias("rsi_max_14")
        ])
        
        # Fast K (Stochastic RSI)
        df = df.with_columns([
            ((pl.col("rsi_14") - pl.col("rsi_min_14")) / 
             (pl.col("rsi_max_14") - pl.col("rsi_min_14")) * 100).alias("stoch_rsi_k")
        ])
        
        # Fast D (3-period SMA of Fast K)
        df = df.with_columns([
            pl.col("stoch_rsi_k").rolling_mean(window_size=3).alias("stoch_rsi_d")
        ])
        
        # Clean up temporary columns
        return df.drop(["change", "gain", "loss", "avg_gain", "avg_loss", "rs", "rsi_min_14", "rsi_max_14"])
