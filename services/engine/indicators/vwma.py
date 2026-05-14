import polars as pl
from .base_indicator import AbstractIndicator

class VWMAIndicator(AbstractIndicator):
    """
    Computes VWMA (Volume Weighted Moving Average) 20-period
    """
    def name(self) -> str:
        return "vwma"
        
    def compute(self, df: pl.DataFrame) -> pl.DataFrame:
        return df.with_columns([
            (pl.col("close") * pl.col("volume")).alias("vol_price")
        ]).with_columns([
            (
                pl.col("vol_price").rolling_sum(window_size=20) / 
                pl.col("volume").rolling_sum(window_size=20)
            ).alias("vwma_20")
        ]).drop("vol_price")
