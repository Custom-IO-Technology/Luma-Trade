use polars::prelude::*;
use crate::core::traits::Indicator;

pub struct VwmaIndicator {
    pub period: usize,
}

impl VwmaIndicator {
    pub fn new(period: usize) -> Self {
        Self { period }
    }
}

impl Indicator for VwmaIndicator {
    fn name(&self) -> &'static str {
        "VWMA"
    }

    fn compute(&self, df: DataFrame) -> Result<DataFrame, PolarsError> {
        let out = df.lazy()
            .with_column((col("close") * col("volume")).alias("vol_price"))
            .with_column(
                (
                    col("vol_price").rolling_sum(RollingOptions {
                        window_size: Duration::parse(&format!("{}i", self.period)),
                        min_periods: self.period,
                        weights: None,
                        center: false,
                        by: None,
                        closed_window: None,
                        fn_params: None,
                        warn_if_unsorted: true,
                    }) / 
                    col("volume").rolling_sum(RollingOptions {
                        window_size: Duration::parse(&format!("{}i", self.period)),
                        min_periods: self.period,
                        weights: None,
                        center: false,
                        by: None,
                        closed_window: None,
                        fn_params: None,
                        warn_if_unsorted: true,
                    })
                ).alias(&format!("vwma_{}", self.period))
            )
            .select([col("*").exclude(["vol_price"])])
            .collect()?;

        Ok(out)
    }
}
