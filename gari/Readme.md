# Overview

The Gari project consists of several program modules:
* **GARI SPL token** with meta-data so that the SPL token details will be displayed in wallets like Phantom and Solana Blockchain Explorers
* **Staking functionality** so that GARI holders can stake their tokens and earn interest. Newly minted GARI tokens are paid to stakers. These rewards are paid until the number of GARI tokens reaches the cap amount.
* **Governance System** to make proposals, vote on them and pay funding recipients. The governance system controls a treasury of tokens. The treasury can hold and fund proposal with any SPL token (e.g. GARI & USDC),


## Token Weighted Governance (DAO Proposals)

![image](https://user-images.githubusercontent.com/7595/141236440-f2bfb9b7-a53e-4193-99da-89f85d675930.png)

-   To avoid spam proposals, there is a minStakeToPropose token amount required to make a proposal
-   To    avoid    harmful     proposals   the    proposal must be   sponsored  by  one of the proposalSponsorAccounts[] 
-   To elevate proposals with strong community support approve(proposalIpfsHash) can be recorded before the proposal is sponsored  
-   To    avoid    a    minority    flipping    a    proposal with low       participation  there        must be minVoteParticipationPercent of tokens that partipiate in voting for the proposal
  
Note, there may be a lot of proposals and so the proposal listing should sort proposals by the number of total votes.

## Proposals Structure

Proposals consist of:
* A description of the proposal stored as a hash of an IPFS file
* A funding recipient address who will receive tokens if the proposal passes
* A token type for paying proposals if they are approved
* An amount of tokens to pay the funding recipient if the proposal passes

## Governance Sequence

![image](https://user-images.githubusercontent.com/7595/141236556-bee26548-6b2e-4209-99fd-d0c8c99c3a8b.png)

1. The Token Holder stakes tokens
2. The token holder can makeProposal() and pass in the proposalIpfsHash of the proposal document.
3. To make the proposal they must have minStakeToPropose     
4. Any DAO.proposalSponsorAccounts[] can vote normally. At lease one sponsor must vote for the proposal to pass.
5. The proposal is if all of these conditions are satisfied before approvalFixedPeriodInSeconds

**Approval Rules**
* Any token Holder can vote before or after sponsorship by calling approve(ipfsHash, bool) where the boolean value true/false represents yes/no for the ipfsHash proposal id
* To be approved proposals must have at least minApprovalPercent (e.g. 51%)
  * and a vote from at least minVoteParticipationPercent (e.g. 20%) of the staked token holders
  * at the time of approvalFixedPeriodInSeconds (e.g 14 days) which is calculated from

## Staking

* Users are required to stake a minimum number of tokens to vote 
* Token hodlers who stake tokens receive newly minted tokens as a staking reward at the interest rate set when the tokens are deployed. Once the token supply cap is reached minting will stop.

# Environment Setup

The environment is necessary to build and run tests of the project.

1. Install Rust from https://rustup.rs/
2. Install Solana v1.7.10 or later from https://docs.solana.com/cli/install-solana-cli-tools#use-solanas-install-tool
3. Install Anchor Framework v0.14.0
```
$ npm install -g mocha
$ sudo apt-get update && sudo apt-get upgrade && sudo apt-get install -y pkg-config build-essential libudev-dev
$ cargo install --git https://github.com/project-serum/anchor --tag v0.14.0 anchor-cli --locked
$ npm install -g @project-serum/anchor
```

Make sure your NODE_PATH is set properly so that globally installed modules can be resolved.

If you encounter an error while executing the `cargo install` command, try install anchor-cli locally from a cloned repo.
```
$ git clone https://github.com/project-serum/anchor
$ cd anchor
$ git checkout tags/v0.14.0
$ cd cli
$ cargo install --path . --locked
```

## Build and test source code

### Build programs
```
$ anchor build
```

### Test programs

1. Install additional environment for tests.
```
$ npm install -g @solana/spl-token
```

2. Generate payer id if it doesn't exists yet
```
solana-keygen new
```

3. Run the functional tests. This command will build, deploy and test the smart constacts on local network.
```
$ anchor test
```

3. There are additional unit tests for calculate accrued interest
```
$ cargo test --package staking --lib -- utils::test
```

## Using the CLI Client

### Set up Solana network config

The first step is to select a Solana cluster: https://docs.solana.com/cli/choose-a-cluster
```
$ solana config set --url https://api.devnet.solana.com
```

### Generating payer keypair

If you don't have payer key in `~/.config/solana/id.json` than run command
```
$ solana-keygen new
```

### Deploying program

1. To deploy all programs to chosen network
```
$ anchor deploy --provider.cluster <cluster>
```

Where the `<cluster>` is: devnet, testnet, mainnet or localnet.

Be sure to save the output received `program id`.

To deploy exact program to chosen network
```
$ anchor deploy -p <program_name> --provider.cluster <cluster>
```

available program names: metadata, staking, governance.

2. Setting up config file

There are config file example `config.template.json`.
```
{
    "fee_payer_path": "<SYSTEM_PATH to id.json file>",
    "network": "<NETWORK_MONIKER>",
    "program_ids": {
        "metadata_id": "<PROGRAM_ID>",
        "staking_id": "<PROGRAM_ID>",
        "governance_id": "<PROGRAM_ID>"
    }
}
```

`fee_payer_path` - you should specify the full path to the keypair file.
`network` - you should specify the Solana network: localnet, testnet, devnet, mainnet.
`program_ids` - you should specify the program id for each constract with value from `anchor deploy` command.

3. Specify path to config file in calling the CLI commands

```
$ ./target/release/cli-client -c <PATH_TO_CONFIG_FILE>
```

For example
```
$ ./target/release/cli-client -c config.devnet.json
```

If you do not specify the parameter `-c`, then the default parameters will be set.
```
{
    "fee_payer_path": "$HOME/.config/solana/id.json",
    "network": "devnet",
    "program_ids": {
        "metadata_id": "5gwJwtY6K8ScN8fd5Mp5dtVaaNPpfT8DWkvGi9cHzXBd",
        "staking_id": "GAhAErsedUEA6j268TS3fjxjXMoE1cVLK5eUqkQ9zRC1",
        "governance_id": "HECZUtVYnYDox3iwhcruL7HLJzBaUhrxVHZjERgHmFLD"
    }
}
```

### Updating program (redeploy)

The `anchor deploy` command generating new program_id in each call so for updating programs should use command `anchor upgrade`.

```
$ anchor build
$ anchor upgrade <so_file_path> -p <program_id> --provider.cluster <cluster>
```

Where `<so_file_path>` is the path for .so file of exact contact in `target/deploy` directory. And `<program id>` is the identifier of contract need to be upgraded.

## CLI Client commands

For each command, there is also a document. You can see it by using --help additional parameter.

1. Build the CLI Client
```
$ cargo build -p cli_client --release
$ ./target/release/cli-client --help
```

### Create token

Create new SPL Token Mint account with provided decimals (default is 9) and mint_authority (default is fee_payer).

```
$ ./target/release/cli-client create-token
```

SPL Token Mint account address is generated randomly.

### Create metadata

Create new Token Metadata with provided `Mint`, name `NAME` and symbol `SYMBOL`

```
$ ./target/release/cli-client initialize-metadata <MINT_ADDRESS> <NAME> <SYMBOL>
```

You should save the pubkeys from the output and use it future.

Output
```
RPC Client URL: https://api.devnet.solana.com
Payer pubkey: E2bdNV9XdFndMsEwYxRZuBQdJfdBt5yziLH4WX1yY4Lv
Creating new token metadata with name: <NAME> and symbol: <SYMBOL>
Metadata Pubkey: <TOKEN_METADATA_PUBKEY>
Metadata account successfully created
```

### Create token wallet

Creating the new token wallet to hold the SPL Tokens.

```
$ ./target/release/cli-client initialize-token-wallet <TOKEN_METADATA_OR_MINT_PUBKEY> <TOKEN_WALLET_OWNER>
```

Output
```
RPC Client URL: https://api.devnet.solana.com
Pubkey for Token wallet: <TOKEN_WALLET_PUBKEY>
Initializing token wallet
Token wallet successfully created
```

### Mint to

Mint the amount of tokens to recipient token wallet.

```
$ ./target/release/cli-client mint-to <TOKEN_METADATA_OR_MINT_PUBKEY> <AMOUNT> <RECIPIENT_TOKEN_WALLET_ADDRESS>
```

Where <RECIPIENT_TOKEN_WALLET_ADDRESS> must be the Token wallet (SPL Token Account). Should be created by command `initialize-token-wallet`.

### Transfer

Transfer the amount of tokens from source token wallet to recipient token wallet. The authority for source token wallet must be provided.

```
$ ./target/release/cli-client mint-to <TOKEN_METADATA_OR_MINT_PUBKEY> <AMOUNT> <SOURCE_TOKEN_WALLET_ADDRESS> <RECIPIENT_TOKEN_WALLET_ADDRESS>
```

### Token wallet balance

```
./target/release/cli-client token-wallet-balance <TOKEN_WALLET_ADDRESS>
```

### Show metadata info

Example of getting the common information about token.

```
$ ./target/release/cli-client metadata-info <TOKEN_METADATA_PUBKEY>
```

## Commands related to staking tokens

### Create staking data

Initialize new staking pool with provided token, interest rate. Mint authority for <TOKEN_METADATA_PUBKEY> will be changed after initiliaing.

```sh
$ ./target/release/cli-client initialize-staking <START_INTEREST_RATE> <MAX_INTEREST_RATE> <TOKEN_METADATA_PUBKEY> <SUPPLY_CAP_AMOUNT>
```

`<TOKEN_METADATA_PUBKEY>` must be created beforehand with [Initialize-metadata command](#create-metadata).

Output
```
Initializing new StakingData Account: <STAKING_DATA_PUBKEY>
With starting timestamp: <STARINT_TIMESTAMP>
New holding wallet owner: <PUBKEY>
Pubkey for Token Holding wallet: <PUBKEY>
Initializing holding wallet
New token mint authority: <PUBKEY>
StakingData account successfully created
```

### Create staking user

Create new user account in the provided staking pool. User account must be created before starting of first stake.

```sh
$ ./target/release/cli-client initialize-user-staking <STAKING_DATA_PUBKEY>
```

`<STAKING_DATA_PUBKEY>` must be generated with [Create Staking Data instruction](#create-staking-data).

Output
```
Creating new UserStakingData account
User authority: <PUBKEY>
Pubkey for UserStakingData account: <STAKING_USER_DATA_PUBKEY>
Pubkey for user token wallet: <PUBKEY>
Initializing user token wallet
Initialing user staking data
Initializing successfully completed
```

### Stake tokens

Stake tokens from user account to the stake pool. Accrue interest first.

```sh
$ ./target/release/cli-client stake <FLOAT_AMOUNT> <STAKING_DATA_PUBKEY>
```

### Unstake tokens

Unstake tokens from the pool, takes same arguments as [Stake tokens](#stake-tokens). Accrue interest first.

```sh
$ ./target/release/cli-client unstake <FLOAT_AMOUNT> <STAKING_DATA_PUBKEY>
```

### Accrue interest

Compare current timestamp and the timestamp of the last time the interest was paid, if enough time has been passed, accrue staked tokens of the users in the staking pool.

```sh
$ ./target/release/cli-client accrue-interest <STAKING_DATA_PUBKEY>
```

### Show staking data info

```sh
$ ./target/release/cli-client staking-info <STAKING_DATA_PUBKEY>
```

### Show staking user data info

```sh
$ ./target/release/cli-client staking-user-info <STAKING_USER_DATA_PUBKEY>
```

### Show unminted interest

Show how much interest in tokens hasn't been taken yet.

```sh
$ ./target/release/cli-client total-unminted-interest <STAKING_DATA_PUBKEY>
```

### Show total staked tokens

Show how much tokens are in the provided staking pool.

```sh
$ ./target/release/cli-client total-staked <STAKING_DATA_PUBKEY>
```

### Show total staked tokens for user

Show how much tokens user has dedicated in it's corresponding staking pool.

```sh
$ ./target/release/cli-client total-staked-for <STAKING_USER_DATA_PUBKEY>
```

### Set interest rate

Set the interest rate for the provided staking pool.

```sh
$ ./target/release/cli-client set-interest-rate <NEW_INTEREST_RATE> <STAKING_DATA_PUBKEY>
```

## Commands for CLI Governance

### Initialize Governance

First of all you must initialize the new governance Account in Solana network with provided gov parameters.

```sh
$ ./target/release/cli-client initialize-governance <STAKING_DATA_PUBKEY> \
<APPROVAL_PERIOD_SECONDS> <MIN_APPROVAL_PERCENT> <MIN_STAKE_AMOUNT> <MIN_VOTE_PARTICIPATION_PERCENT> \
<PAYMENT_PERIOD_DURATION_SEC> \
-s <SPONSOR_1_STAKING_USER_DATA_PUBKEY> \
-s <SPONSOR_2_STAKING_USER_DATA_PUBKEY> \
-s <SPONSOR_3_STAKING_USER_DATA_PUBKEY> \
```

The maximum sponsor you can provide is 16. The minimum is 3.

Example output:
```
Initialize new Governance
New pubkey for Governance data: <GOVERNANCE_PUBKEY>
New pubkey for treasury owner: <PUBKEY>
Pubkey for treasury: <PUBKEY>
Initializing treasury wallet
Successfully initialized
```

### Initialize governance Treasury

Before funding treasury must be initialized with provided Mint.

```sh
$ ./target/release/cli-client initialize-treasury-stats <GOVERNANCE_PUBKEY> <SPL_TOKEN_MINT_PUBKEY> \
<MAX_PAYMENT_AMOUNT_PERCENT> <MAX_PAYMENT_AMOUNT_IN_PERIOD_PERCENT>
```

Example output:
```
Initialing treasury for Gov <GOVERNANCE_PUBKEY>
Mint: <SPL_TOKEN_MINT_PUBKEY>
Treasury owner: <TREASURE_OWNER_PUBKEY>
Pubkey for treasury: <TREASURE_PUBKEY>
Initializing treasury wallet
Successfully initialized
```

### Fund Governance treasury

```sh
$ ./target/release/cli-client fund-treasury <AMOUNT> <GOVERNANCE_PUBKEY>
```

### Making new proposal

```sh
./target/release/cli-client make-proposal <GOVERNANCE_PUBKEY> <STAKING_USER_DATA_PUBKEY> <PAYMENT_AMOUNT> <RECIPIENT_PUBKEY> <IPFS_HASH>
```

where `<STAKING_USER_DATA_PUBKEY>` is the account for user who making the proposal. User must have staked tokens.

Output
```
Creating new proposal with
Governance: <GOVERNANCE_PUBKEY>
Payment amount: <PAYMENT_AMOUNT>
Recipient: <RECIPIENT_PUBKEY>
Unique pubkey for proposal: <PROPOSAL_PUBKEY>
Successfully completed
```

### Vote for the existed proposal

```sh
./target/release/cli-client approve-proposal <STAKING_USER_DATA_PUBKEY> <VOTE> <PROPOSAL_PUBKEY>
```

where `<VOTE>` is boolean: `true` for approve and `false` for reject.

### Finalize the proposal

Trying to finalize the proposal. If approval fixed period has passed there is the making decision.

```sh
./target/release/cli-client finalize-proposal <PROPOSAL_PUBKEY>
```
