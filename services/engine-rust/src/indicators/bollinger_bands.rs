use polars::prelude::*;
use crate::core::traits::Indicator;

pub struct BollingerBandsIndicator {
    pub period: usize,
    pub std_dev: f64,
}

impl BollingerBandsIndicator {
    pub fn new(period: usize, std_dev: f64) -> Self {
        Self { period, std_dev }
    }
}

impl Indicator for BollingerBandsIndicator {
    fn name(&self) -> &'static str {
        "BollingerBands"
    }

    fn compute(&self, df: DataFrame) -> Result<DataFrame, PolarsError> {
        let out = df.lazy()
            .with_columns([
                col("close").rolling_mean(RollingOptions {
                    window_size: Duration::parse(&format!("{}i", self.period)),
                    min_periods: self.period,
                    weights: None,
                    center: false,
                    by: None,
                    closed_window: None,
                    fn_params: None,
                    warn_if_unsorted: true,
                }).alias("bb_mid"),
                col("close").rolling_std(RollingOptions {
                    window_size: Duration::parse(&format!("{}i", self.period)),
                    min_periods: self.period,
                    weights: None,
                    center: false,
                    by: None,
                    closed_window: None,
                    fn_params: None,
                    warn_if_unsorted: true,
                }).alias("bb_std")
            ])
            .with_columns([
                (col("bb_mid") + (col("bb_std") * lit(self.std_dev))).alias("bb_upper"),
                (col("bb_mid") - (col("bb_std") * lit(self.std_dev))).alias("bb_lower")
            ])
            .select([col("*").exclude(["bb_std"])])
            .collect()?;

        Ok(out)
    }
}
