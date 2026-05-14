import polars as pl
from .base_indicator import AbstractIndicator

class ATRIndicator(AbstractIndicator):
    """
    Computes Average True Range (14-period)
    """
    def name(self) -> str:
        return "atr"
        
    def compute(self, df: pl.DataFrame) -> pl.DataFrame:
        # True Range: max(high - low, abs(high - prev_close), abs(low - prev_close))
        df = df.with_columns([
            pl.col("close").shift(1).alias("prev_close")
        ])
        
        df = df.with_columns([
            (pl.col("high") - pl.col("low")).alias("tr1"),
            (pl.col("high") - pl.col("prev_close")).abs().alias("tr2"),
            (pl.col("low") - pl.col("prev_close")).abs().alias("tr3")
        ])
        
        df = df.with_columns([
            pl.max_horizontal("tr1", "tr2", "tr3").alias("true_range")
        ])
        
        # ATR is the moving average of TR
        # Wilder used a smoothed moving average, but Simple/RMA is common. We'll use SMA for simplicity.
        df = df.with_columns([
            pl.col("true_range").rolling_mean(window_size=14).alias("atr_14")
        ])
        
        # Clean up
        return df.drop(["prev_close", "tr1", "tr2", "tr3", "true_range"])
