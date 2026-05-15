# ==============================================================================
# Build Stage
# ==============================================================================
FROM rust:1-bookworm AS builder

WORKDIR /usr/src/obscura-ingestor

# Hardware optimization for the specific host building the image
ENV RUSTFLAGS="-C target-cpu=native"

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Create dummy src to cache dependencies
COPY Cargo.toml ./
RUN mkdir src && \
    echo "fn main() {println!(\"if you see this, the build broke\")}" > src/main.rs && \
    cargo build --release && \
    rm -rf src

# Copy real source code and build
COPY src ./src
# Touch main.rs to ensure cargo rebuilds it
RUN touch src/main.rs && cargo build --release

# ==============================================================================
# Runtime Stage
# ==============================================================================
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy compiled binary from builder
COPY --from=builder /usr/src/obscura-ingestor/target/release/obscura-ingestor /usr/local/bin/obscura-ingestor

# Create non-root user
RUN useradd -m obscura && chown -R obscura:obscura /app
USER obscura

CMD ["obscura-ingestor"]
