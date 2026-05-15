FROM rust:1-bookworm AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests
COPY Cargo.toml ./

# Hardware optimization for the specific host building the image
ENV RUSTFLAGS="-C target-cpu=native"

# Create a dummy main.rs to build dependencies (cached layer)
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Copy source
COPY src ./src

# Build the actual binary with native optimizations
RUN touch src/main.rs && cargo build --release

# Final minimal image
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    libssl3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/obscura-engine /usr/local/bin/obscura-engine

EXPOSE 8080

CMD ["obscura-engine"]
