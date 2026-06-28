use polars::prelude::*;
use crate::models::KlineMessage;
use std::collections::HashMap;

pub fn aggregate_candles(
    candles: Vec<KlineMessage>,
    target_timeframe: &str,
) -> Result<DataFrame, PolarsError> {
    if candles.is_empty() {
        return Ok(DataFrame::default());
    }

    let timeframe_map: HashMap<&str, &str> = [
        ("1", "1m"),
        ("5", "5m"),
        ("15", "15m"),
        ("30", "30m"),
        ("60", "1h"),
        ("240", "4h"),
        ("1440", "1d"),
    ].iter().cloned().collect();

    let duration = timeframe_map.get(target_timeframe).unwrap_or(&"30m");

    // Convert Vec<KlineMessage> to columns
    let symbols: Vec<String> = candles.iter().map(|c| c.symbol.clone()).collect();
    let opens: Vec<f64> = candles.iter().map(|c| c.open).collect();
    let highs: Vec<f64> = candles.iter().map(|c| c.high).collect();
    let lows: Vec<f64> = candles.iter().map(|c| c.low).collect();
    let closes: Vec<f64> = candles.iter().map(|c| c.close).collect();
    let volumes: Vec<f64> = candles.iter().map(|c| c.volume).collect();
    let timestamps: Vec<i64> = candles.iter().map(|c| c.timestamp as i64).collect();

    let mut df = df!(
        "symbol" => symbols,
        "open" => opens,
        "high" => highs,
        "low" => lows,
        "close" => closes,
        "volume" => volumes,
        "timestamp" => timestamps
    )?;

    // Convert timestamp (ms) to datetime
    df = df.lazy()
        .with_column(
            (col("timestamp") * lit(1_000_000i64)).cast(DataType::Datetime(TimeUnit::Nanoseconds, None)).alias("time_dt")
        )
        .sort("time_dt", SortOptions::default())
        .collect()?;

    if *duration == "30m" || *duration == "5m" {
        let mut df_sel = df.select(["time_dt", "open", "high", "low", "close", "volume"])?;
        df_sel.rename("time_dt", "time")?;
        return Ok(df_sel);
    }

    let duration_polars = Duration::parse(duration);
    let offset_polars = Duration::parse("0s");

    // Aggregate via group_by_dynamic
    let df_agg = df.lazy()
        .group_by_dynamic(
            col("time_dt"),
            [],
            DynamicGroupOptions {
                index_column: "time_dt".into(),
                every: duration_polars,
                period: duration_polars,
                offset: offset_polars,
                label: Label::Left,
                include_boundaries: false,
                closed_window: ClosedWindow::Left,
                start_by: Default::default(),
                check_sorted: true,
            },
        )
        .agg([
            col("open").first().alias("open"),
            col("high").max().alias("high"),
            col("low").min().alias("low"),
            col("close").last().alias("close"),
            col("volume").sum().alias("volume"),
        ])
        .collect()?;

    let mut df_final = df_agg;
    df_final.rename("time_dt", "time")?;
    Ok(df_final)
}
