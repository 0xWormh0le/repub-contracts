FROM rust:1.54-slim-bullseye
WORKDIR /app 

#ENVs
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_PATH="usr/local/lib/node_modules"
ENV PATH=$PATH:/root/.local/share/solana/install/active_release/bin:/root/.cargo/bin
ARG solana_version

#DEPS
RUN apt update
RUN apt install -y eatmydata
RUN eatmydata -- apt install -y pkg-config build-essential libudev-dev git npm wget
RUN sh -c "$(wget -qO - https://release.solana.com/$solana_version/install)"
RUN solana --version
RUN cargo install --git https://github.com/project-serum/anchor --tag v0.14.0 anchor-cli --locked
RUN anchor -V

#BUILD AND TEST
COPY . .
RUN anchor build
RUN solana-keygen new
RUN npm -g install mocha
RUN npm install @project-serum/anchor
RUN npm -g install @solana/spl-token
RUN anchor test
RUN cargo test --package staking --lib -- utils::test
RUN tar --exclude='target/debug/deps' --exclude='target/release/deps' -cf - target|xz -v -3 -T0 > target.tar.xz
