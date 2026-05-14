import polars as pl
from .base_indicator import AbstractIndicator

class BollingerBandsIndicator(AbstractIndicator):
    """
    Computes Bollinger Bands (20, 2)
    """
    def name(self) -> str:
        return "bollinger_bands"
        
    def compute(self, df: pl.DataFrame) -> pl.DataFrame:
        df = df.with_columns([
            pl.col("close").rolling_mean(window_size=20).alias("bb_mid"),
            pl.col("close").rolling_std(window_size=20).alias("bb_std")
        ])
        
        return df.with_columns([
            (pl.col("bb_mid") + (pl.col("bb_std") * 2)).alias("bb_upper"),
            (pl.col("bb_mid") - (pl.col("bb_std") * 2)).alias("bb_lower")
        ]).drop("bb_std")
