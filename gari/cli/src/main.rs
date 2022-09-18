//! CLI Client for interacting with the smart contracts
mod commands;
mod config;
mod validators;

use anchor_client::{
    solana_client::rpc_client::RpcClient,
    solana_sdk::{
        commitment_config::CommitmentConfig,
        pubkey::Pubkey,
        signature::{read_keypair_file, Keypair},
        signer::Signer,
    },
    Client, Cluster,
};
use clap::{
    crate_description, crate_name, crate_version, value_t, value_t_or_exit, values_t_or_exit, App,
    AppSettings, Arg, SubCommand,
};
use solana_clap_utils::input_validators::{is_valid_percentage, is_valid_pubkey, is_valid_signer};
use std::str::FromStr;
use validators::*;

fn get_clap_app<'a, 'b>(name: &'a str, desc: &'a str, version: &'a str) -> App<'a, 'b> {
    App::new(name)
        .about(desc)
        .version(version)
        .setting(AppSettings::SubcommandRequiredElseHelp)
        .arg(
            Arg::with_name("config")
                .short("c")
                .long("config")
                .value_name("PATH")
                .takes_value(true)
                .global(true)
                .help("Configuration file to use"),
        )
        .subcommand(
            SubCommand::with_name("create-token")
                .about("Create new SPL Token.")
                .arg(
                    Arg::with_name("decimals")
                        .long("decimals")
                        .short("d")
                        .validator(is_valid_decimals)
                        .value_name("u8")
                        .takes_value(true)
                        .help("The SPL Token decimals (default: 9)"),
                )
                .arg(
                    Arg::with_name("mint_authority")
                        .long("mint-authority")
                        .alias("owner")
                        .value_name("KEYPAIR")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help(
                            "Specify the mint authority address. \
                             Defaults to the client keypair address.",
                        ),
                ),
        )
        .subcommand(
            SubCommand::with_name("initialize-metadata")
                .about("Create new Metadata account with provided token name and symbol.")
                .arg(
                    Arg::with_name("mint")
                        .validator(is_valid_pubkey)
                        .value_name("PUBKEY")
                        .takes_value(true)
                        .help("The SPL Token Mint"),
                )
                .arg(
                    Arg::with_name("name")
                        .validator(is_valid_name)
                        .value_name("STRING")
                        .takes_value(true)
                        .help("New Token Name"),
                )
                .arg(
                    Arg::with_name("symbol")
                        .validator(is_valid_symbol)
                        .value_name("STRING")
                        .takes_value(true)
                        .help("New Token Symbol"),
                )
                .arg(
                    Arg::with_name("mint_authority")
                        .long("mint-authority")
                        .alias("owner")
                        .value_name("KEYPAIR")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help(
                            "Specify the mint authority address. \
                             Defaults to the client keypair address.",
                        ),
                ),
        )
        .subcommand(
            SubCommand::with_name("initialize-token-wallet")
                .about(
                    "Create new wallet to holding the SPL Tokens if it doesn't exist. \
                    With provided Metadata account of SPL Token Mint account and token wallet owner. \
                    Metadata account must be created by create-metadata command first."
                )
                .arg(
                    Arg::with_name("token_account")
                        .value_name("TOKEN_METADATA_OR_MINT_PUBKEY")
                        .validator(is_valid_pubkey)
                        .required(true)
                        .takes_value(true)
                        .help("The token metadata or token mint pubkey"),
                )
                .arg(
                    Arg::with_name("owner")
                        .value_name("TOKEN_OWNER_PUBKEY")
                        .takes_value(true)
                        .validator(is_valid_pubkey)
                        .help("The owner of token wallet"),
                ),
        )
        .subcommand(
            SubCommand::with_name("token-wallet-balance")
                .about("Show the token wallet balance.")
                .arg(
                    Arg::with_name("token_wallet")
                        .value_name("TOKEN_WALLET_PUBKEY")
                        .validator(is_valid_pubkey)
                        .required(true)
                        .takes_value(true)
                        .help("The token wallet pubkey"),
                )
        )
        .subcommand(
            SubCommand::with_name("mint-to")
                .about(
                    "Mint <amount> of SPL tokens to <address> with data \
                    from provided Metadata account or SPL Token Mint account",
                )
                .arg(
                    Arg::with_name("token_account")
                        .value_name("TOKEN_METADATA_OR_MINT_PUBKEY")
                        .validator(is_valid_pubkey)
                        .required(true)
                        .takes_value(true)
                        .help("The token to mint"),
                )
                .arg(
                    Arg::with_name("amount")
                        .value_name("TOKEN_AMOUNT")
                        .takes_value(true)
                        .validator(is_valid_ui_amount)
                        .help(
                            "Amount of tokens to mint to specified \
                             destination account.",
                        ),
                )
                .arg(
                    Arg::with_name("destination")
                        .value_name("RECIPIENT_TOKEN_ACCOUNT_ADDRESS")
                        .takes_value(true)
                        .validator(is_valid_pubkey)
                        .help("The token account address of recipient."),
                )
                .arg(
                    Arg::with_name("mint_authority")
                        .long("mint-authority")
                        .alias("owner")
                        .value_name("KEYPAIR")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help(
                            "Specify the mint authority address. \
                             Defaults to the client keypair address.",
                        ),
                ),
        )
        .subcommand(
            SubCommand::with_name("transfer")
                .about(
                    "Transfer <amount> of tokens \
                    from <SOURCE_TOKEN_ACCOUNT_ADDRESS> to <RECIPIENT_TOKEN_ACCOUNT_ADDRESS>. \
                    Required the source wallet authority (Defaults to the client keypair address)",
                )
                .arg(
                    Arg::with_name("token_account")
                        .value_name("TOKEN_METADATA_OR_MINT_PUBKEY")
                        .validator(is_valid_pubkey)
                        .required(true)
                        .takes_value(true)
                        .help("The token to transfer"),
                )
                .arg(
                    Arg::with_name("amount")
                        .value_name("TOKEN_AMOUNT")
                        .takes_value(true)
                        .validator(is_valid_ui_amount)
                        .help(
                            "Amount of tokens to transfer to specified \
                             destination account.",
                        ),
                )
                .arg(
                    Arg::with_name("source")
                        .value_name("SOURCE_TOKEN_ACCOUNT_ADDRESS")
                        .takes_value(true)
                        .validator(is_valid_pubkey)
                        .help("The source token wallet address."),
                )
                .arg(
                    Arg::with_name("destination")
                        .value_name("RECIPIENT_TOKEN_ACCOUNT_ADDRESS")
                        .takes_value(true)
                        .validator(is_valid_pubkey)
                        .help("The token wallet address of recipient."),
                )
                .arg(
                    Arg::with_name("transfer_authority")
                        .long("transfer-authority")
                        .alias("owner")
                        .value_name("KEYPAIR")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help(
                            "Specify the transfer authority address. \
                             Defaults to the client keypair address.",
                        ),
                ),
        )
        .subcommand(
            SubCommand::with_name("metadata-info")
                .about("Show MetadataAccountData for provided <address>.")
                .arg(
                    Arg::with_name("metadata_account")
                        .value_name("TOKEN_METADATA_PUBKEY")
                        .validator(is_valid_pubkey)
                        .required(true)
                        .takes_value(true)
                        .help("Metadata address to show."),
                ),
        )
        .subcommand(
            SubCommand::with_name("initialize-staking")
                .about("Creating and initialing new Account for staking data with provided TokenMetadata account. \
                        Pubkeys for StakingData and HoldingWallet are generated randomly. \
                        Current mint authority will be taken by the program."
                )
                .arg(
                    Arg::with_name("starting_interest_rate")
                        .value_name("u64")
                        .validator(is_valid_uint)
                        .required(true)
                        .takes_value(true)
                        .help("Starting daily interest rate in 1e-6 (1/100 of a basis point)."),
                )
                .arg(
                    Arg::with_name("max_interest_rate")
                        .value_name("u64")
                        .validator(is_valid_uint)
                        .required(true)
                        .takes_value(true)
                        .help("Maximum daily interest rate in 1e-6 (1/100 of a basis point)."),
                )
                .arg(
                    Arg::with_name("token_metadata")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .required(true)
                        .takes_value(true)
                        .help("The staking Token Metadata Pubkey."),
                )
                .arg(
                    Arg::with_name("staring_timestamp")
                        .long("starting_timestamp")
                        .short("t")
                        .value_name("UNIXTIMESTMAP")
                        .validator(is_valid_int)
                        .takes_value(true)
                        .help(
                            "Starting timestamp for staking. \
                            Defaults to the current timestamp."
                        ),
                )
                .arg(
                    Arg::with_name("cap")
                        .value_name("f64_AMOUNT")
                        .validator(is_valid_ui_amount)
                        .required(true)
                        .takes_value(true)
                        .help("The limitation for staking token max supply."),
                )
                .arg(
                    Arg::with_name("mint_authority")
                        .long("mint-authority")
                        .value_name("KEYPAIR")
                        .validator(is_valid_signer)
                        .takes_value(true)
                        .help(
                            "Specify the staking token mint authority keypair. \
                             Defaults to the client keypair address."
                        ),
                )
                .arg(
                    Arg::with_name("staking_data_owner")
                        .long("staking-data-owner")
                        .value_name("KEYPAIR")
                        .validator(is_valid_signer)
                        .takes_value(true)
                        .help(
                            "Specify the staking data owner keypair. \
                             Defaults to the client keypair address."
                        ),
                    ),
        )
        .subcommand(
            SubCommand::with_name("staking-info")
                .about("Show StakingDataAccount for provided <address>.")
                .arg(
                    Arg::with_name("staking_account")
                        .value_name("STAKING_DATA_PUBKEY")
                        .validator(is_valid_pubkey)
                        .required(true)
                        .takes_value(true)
                        .help("StakingData address to show."),
                ),
        )
        .subcommand(
            SubCommand::with_name("staking-user-info")
                .about("Show StakingUserDataAccount for provided <address>.")
                .arg(
                    Arg::with_name("staking_user_account")
                        .value_name("STAKING_USER_DATA_PUBKEY")
                        .validator(is_valid_pubkey)
                        .required(true)
                        .takes_value(true)
                        .help("StakingUserData address to show."),
                ),
        )
        .subcommand(
            SubCommand::with_name("set-interest-rate")
                .about(
                    "Update daily interest rate for provided StakingData Account. \
                     Accrues interest first."
                )
                .arg(
                    Arg::with_name("new_interest_rate")
                        .value_name("u64")
                        .validator(is_valid_uint)
                        .required(true)
                        .takes_value(true)
                        .help("New daily interest rate in 1e-6 (1/100 of a basis point)."),
                )
                .arg(
                    Arg::with_name("staking_data_account")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .required(true)
                        .takes_value(true)
                        .help("The StakingData Account Pubkey."),
                )
                .arg(
                    Arg::with_name("staking_data_owner")
                        .long("staking-data-owner")
                        .value_name("KEYPAIR")
                        .validator(is_valid_signer)
                        .takes_value(true)
                        .help(
                            "Specify the staking data owner keypair. \
                             Defaults to the client keypair address."
                        ),
                ),
        )
        .subcommand(
            SubCommand::with_name("initialize-user-staking")
                .about(
                    "Initialize UserStakingData Account with provided StakingDataAccount pubkey. \
                    Pubkeys for UserTokenWallet and UserStakingData are generated randomly."
                )
                .arg(
                    Arg::with_name("staking_data_account")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .required(true)
                        .takes_value(true)
                        .help("The StakingData Account Pubkey."),
                )
                .arg(
                    Arg::with_name("user_authority")
                        .long("user-authority")
                        .value_name("KEYPAIR")
                        .validator(is_valid_signer)
                        .takes_value(true)
                        .help(
                            "Specify the user token wallet owner keypair. \
                             Defaults to the client keypair address."
                        ),
                )
        )
        .subcommand(
            SubCommand::with_name("stake")
                .about(
                    "Stakes tokens for the user. \
                     Accrues interest first. \
                     StakingData Account must be created with command initialize-staking first. \
                     UserStakingData Account will must be created with command initialize-user-staking first."
                )
                .arg(
                    Arg::with_name("ui_amount")
                        .value_name("f64")
                        .validator(is_valid_ui_amount)
                        .required(true)
                        .takes_value(true)
                        .help("Amount of tokens to stake (float value)."),
                )
                .arg(
                    Arg::with_name("staking_user_data_account")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The UserStakingData Account pubkey."),
                )
                .arg(
                    Arg::with_name("user_authority")
                        .long("user-authority")
                        .value_name("KEYPAIR")
                        .validator(is_valid_signer)
                        .takes_value(true)
                        .help(
                            "Specify the user token wallet owner keypair. \
                             Defaults to the client keypair address."
                        ),
                ),
        )
        .subcommand(
            SubCommand::with_name("unstake")
                .about(
                    "Unstakes tokens of the caller and pushes them. \
                     Accrues interest first. \
                     StakingData Account must be created with command initialize-staking first. \
                     UserStakingData Account will must be created with command initialize-user-staking first."
                )
                .arg(
                    Arg::with_name("ui_amount")
                        .value_name("f64")
                        .validator(is_valid_ui_amount)
                        .required(true)
                        .takes_value(true)
                        .help("Amount of tokens to unstake (float value)."),
                )
                .arg(
                    Arg::with_name("staking_user_data_account")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The UserStakingData Account pubkey."),
                )
                .arg(
                    Arg::with_name("user_authority")
                        .long("user-authority")
                        .value_name("KEYPAIR")
                        .validator(is_valid_signer)
                        .takes_value(true)
                        .help(
                            "Specify the user token wallet owner keypair. \
                             Defaults to the client keypair address."
                        ),
                ),
        )
        .subcommand(
            SubCommand::with_name("accrue-interest")
                .about("Accrues interest to date. It is also accrued by most operations.")
                .arg(
                    Arg::with_name("staking_data_account")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The StakingData Account pubkey."),
                )
        )
        .subcommand(
            SubCommand::with_name("total-staked-for")
                .about(
                    "Viewer for the total stake of the provided staking user data address, including tokens not yet minted, \
                     but virtually accrued to date. Doesn't change state."
                )
                .arg(
                    Arg::with_name("staking_user_data_account")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The StakingUserData Account pubkey."),
                ),
        )
        .subcommand(
            SubCommand::with_name("total-staked")
                .about(
                    "Viewer for the total amount of all stakes, including interest to date even if it's still virtual."
                )
                .arg(
                    Arg::with_name("staking_data_account")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The StakingData Account pubkey."),
                ),
        )
        .subcommand(
            SubCommand::with_name("total-unminted-interest")
                .about(
                    "Viewer for the virtual interest to date that hasn't been minted yet."
                )
                .arg(
                    Arg::with_name("staking_data_account")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The StakingData Account pubkey."),
                ),
        )
        .subcommand(
            SubCommand::with_name("initialize-governance")
                .about(
                    "Initialize Governance account. You need to do this before using the gov instructions. \
                    The StakingData pubkey must be provided. \
                    Pubkey for gov account is generated randomly."
                )
                .arg(
                    Arg::with_name("staking_data_key")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The StakingData pubkey."),
                )
                .arg(
                    Arg::with_name("approval_fixed_period_in_seconds")
                        .value_name("i64_SECONDS")
                        .validator(is_valid_int)
                        .takes_value(true)
                        .help("The approval period in seconds for every proposal."),
                )
                .arg(
                    Arg::with_name("min_approval_percent")
                        .value_name("u8_PERCENT")
                        .validator(is_valid_uint)
                        .takes_value(true)
                        .help("The minimum approval percent for every proposal."),
                )
                .arg(
                    Arg::with_name("min_stake_to_propose")
                        .value_name("f64_AMOUNT")
                        .validator(is_valid_ui_amount)
                        .takes_value(true)
                        .help("The minimum stake amount to make new proposal."),
                )
                .arg(
                    Arg::with_name("min_vote_participation_percent")
                        .value_name("u8_PERCENT")
                        .validator(is_valid_uint)
                        .takes_value(true)
                        .help("The minimum vote participation percent for every proposal."),
                )
                .arg(
                    Arg::with_name("payment_period_sec")
                        .value_name("i64")
                        .validator(is_valid_int)
                        .takes_value(true)
                        .help("Payment period duration in seconds."),
                )
                .arg(
                    Arg::with_name("sponsor")
                        .long("sponsor")
                        .short("s")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .multiple(true)
                        .help(
                            "The list of sponsors. Specify every sponsor like \
                            -s <SPONSOR_1_PUBKEY> -s <SPONSOR_2_PUBKEY> ..."
                        ),
                ),
        )
        .subcommand(
            SubCommand::with_name("initialize-treasury-stats")
                .about("Initialize Governance treasury stats account for specific SPL Token.")
                .arg(
                    Arg::with_name("governance")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The Governance pubkey."),
                )
                .arg(
                    Arg::with_name("mint")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The SPL Token mint pubkey."),
                )
                .arg(
                    Arg::with_name("max_proposal_payment_percent")
                        .value_name("u8_PERCENT")
                        .validator(is_valid_percentage)
                        .takes_value(true)
                        .help("The maximum payment amount (percent of highest balance) for every proposal."),
                )
                .arg(
                    Arg::with_name("payment_amount_in_period_limit_percent")
                        .value_name("u8_PERCENT")
                        .validator(is_valid_percentage)
                        .takes_value(true)
                        .help("The hard cap for proposal payment amount in period (percent of highest balance)."),
                )
        )
        .subcommand(SubCommand::with_name("governance-info")
                .about("Information about provided governance.")
                .arg(
                    Arg::with_name("governance")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The pubkey of governance."),
                )
        )
        .subcommand(SubCommand::with_name("treasury-stats-info")
                .about("Information about provided governance treasury.")
                .arg(
                    Arg::with_name("governance")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The pubkey of governance."),
                )
                .arg(
                    Arg::with_name("treasury")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The pubkey of treasury."),
                )
        )
        .subcommand(SubCommand::with_name("add-sponsor")
                .about(
                    "Add the new sponsor Pubkey into sponsors list. \
                    Required the 60% signatures of the current sponsors list."
                )
                .arg(
                    Arg::with_name("governance")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The pubkey of governance."),
                )
                .arg(
                    Arg::with_name("sponsor")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The pubkey of new sponsor."),
                )
                .arg(
                    Arg::with_name("signers")
                        .long("signer")
                        .short("s")
                        .value_name("KEYPAIR")
                        .validator(is_valid_signer)
                        .takes_value(true)
                        .multiple(true)
                        .help(
                            "The list of signers. Specify every signer like \
                            -s <SIGNER_1_KEYPAIR> -s <SIGNER_2_KEYPAIR> ..."
                        ),
                ),
        )
        .subcommand(SubCommand::with_name("remove-sponsor")
                .about(
                    "Remove the sponsor Pubkey from sponsors list. \
                    Required the 60% signatures of the current sponsors list."
                )
                .arg(
                    Arg::with_name("governance")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The pubkey of governance."),
                )
                .arg(
                    Arg::with_name("sponsor")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The pubkey of sponsor to be removed."),
                )
                .arg(
                    Arg::with_name("signers")
                        .long("signer")
                        .short("s")
                        .value_name("KEYPAIR")
                        .validator(is_valid_signer)
                        .takes_value(true)
                        .multiple(true)
                        .help(
                            "The list of signers. Specify every signer like \
                            -s <SIGNER_1_KEYPAIR> -s <SIGNER_2_KEYPAIR> ..."
                        ),
                ),
        )
        .subcommand(
            SubCommand::with_name("treasury-balance")
                .about("Treasury balance for provided treasury pubkey.")
                .arg(
                    Arg::with_name("treasury")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The pubkey of governance treasury."),
                ),
        )
        .subcommand(
            SubCommand::with_name("fund-treasury")
                .about("Funding of the governance treasury. Treasury must be initialized first.")
                .arg(
                    Arg::with_name("amount")
                        .value_name("TOKEN_AMOUNT")
                        .takes_value(true)
                        .validator(is_valid_ui_amount)
                        .help("Amount of tokens to fund."),
                )
                .arg(
                    Arg::with_name("governance")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The pubkey of initialized Governance."),
                )
                .arg(
                    Arg::with_name("treasury")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The pubkey of governance treasury."),
                )
                .arg(
                    Arg::with_name("user_token_wallet")
                        .long("from")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help(
                            "Specify the user token wallet pubkey. \
                             Defaults to the token associated address."
                        ),
                )
                .arg(
                    Arg::with_name("user_authority")
                        .long("user-authority")
                        .value_name("KEYPAIR")
                        .validator(is_valid_signer)
                        .takes_value(true)
                        .help(
                            "Specify the user token wallet owner keypair. \
                             Defaults to the client keypair address."
                        ),
                ),
        )
        .subcommand(SubCommand::with_name("proposal-info")
                .about("Information about provided proposal.")
                .arg(
                    Arg::with_name("proposal")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The pubkey of proposal."),
                )
        )
        .subcommand(
            SubCommand::with_name("make-proposal")
                .about(
                    "Create the new proposal with provided recipient address, payment amount and description IPFS Hash. \
                    Governance pubkey and StakingUserData also must be provided. \
                    Proposal maker must has staked tokens."
                )
                .arg(
                    Arg::with_name("governance")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The pubkey of initialized Governance."),
                )
                .arg(
                    Arg::with_name("staking_user_data")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The pubkey of StakingUserData."),
                )
                .arg(
                    Arg::with_name("payment_amount")
                        .value_name("TOKEN_AMOUNT")
                        .takes_value(true)
                        .validator(is_valid_ui_amount)
                        .help("Amount of payment tokens."),
                )
                .arg(
                    Arg::with_name("recipient")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The pubkey of the recipient."),
                )
                .arg(
                    Arg::with_name("ipfs_hash")
                        .value_name("HAS_STRING")
                        .takes_value(true)
                        .validator(is_valid_hash_len)
                        .help("The IPFS hash of proposal description."),
                )
                .arg(
                    Arg::with_name("user_authority")
                        .long("user-authority")
                        .value_name("KEYPAIR")
                        .validator(is_valid_signer)
                        .takes_value(true)
                        .help(
                            "Specify the user token wallet owner keypair. \
                             Defaults to the client keypair address."
                        ),
                ),
        )
        .subcommand(
            SubCommand::with_name("approve-proposal")
                .about(
                    "Vote for existent proposal. \
                    Proposal pubkey and StakingUserData must be provided. \
                    User must has staked tokens to vote."
                )
                .arg(
                    Arg::with_name("staking_user_data")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The pubkey of StakingUserData."),
                )
                .arg(
                    Arg::with_name("vote")
                        .value_name("BOOL")
                        .validator(is_valid_bool)
                        .takes_value(true)
                        .help("true or false for pros or cons."),
                )
                .arg(
                    Arg::with_name("proposal")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The pubkey of proposal to vote."),
                )
                .arg(
                    Arg::with_name("user_authority")
                        .long("user-authority")
                        .value_name("KEYPAIR")
                        .validator(is_valid_signer)
                        .takes_value(true)
                        .help(
                            "Specify the user token wallet owner keypair. \
                             Defaults to the client keypair address."
                        ),
                ),
        )
        .subcommand(
            SubCommand::with_name("finalize-proposal")
                .about(
                    "Trying to finalize the proposal. \
                    No authority is required to invoke this instruction."
                )
                .arg(
                    Arg::with_name("proposal")
                        .value_name("PUBKEY")
                        .validator(is_valid_pubkey)
                        .takes_value(true)
                        .help("The pubkey of proposal to finalize."),
                )
        )
}

fn main() {
    let app_matches =
        get_clap_app(crate_name!(), crate_description!(), crate_version!()).get_matches();

    let config = if let Some(config_path) = app_matches.value_of("config") {
        config::CLIConfig::load(config_path).expect("Config loading error")
    } else {
        config::CLIConfig::default()
    };

    let cluster = Cluster::from_str(&config.network).expect("Cluster error");
    let payer = read_keypair_file(&config.fee_payer_path).expect("Reading payer keypair error");
    println!("RPC Client URL: {}", cluster.url());

    // Convert program ids into Pubkey
    let metadata_id = Pubkey::from_str(config.program_ids.metadata_id.as_ref())
        .expect("Metadata PK convert error");
    let staking_id =
        Pubkey::from_str(config.program_ids.staking_id.as_ref()).expect("Staking PK convert error");
    let governance_id = Pubkey::from_str(config.program_ids.governance_id.as_ref())
        .expect("Governance PK convert error");

    let (sub_command, sub_matches) = app_matches.subcommand();
    match (sub_command, sub_matches) {
        // TokenMetadata commands
        ("create-token", Some(arg_matches)) => {
            let decimals = value_t!(arg_matches, "decimals", u8).unwrap_or(9);
            let mint_authority = read_keypair_file(
                arg_matches
                    .value_of("mint_authority")
                    .unwrap_or(&config.fee_payer_path),
            )
            .expect("Cannot read mint authority keypair");

            println!("Creating new token with");
            println!("Decimals: {}", decimals);
            println!("Mint authority: {}", mint_authority.pubkey());

            let client =
                Client::new_with_options(cluster, mint_authority, CommitmentConfig::processed());
            commands::metadata::create_token(&client, &metadata_id, decimals)
                .expect("Creating token error");
            println!("Creating successfully completed");
        }

        ("initialize-metadata", Some(arg_matches)) => {
            let name = value_t_or_exit!(arg_matches, "name", String);
            let symbol = value_t_or_exit!(arg_matches, "symbol", String);
            let mint_key = value_t_or_exit!(arg_matches, "mint", Pubkey);

            let mint_authority = read_keypair_file(
                arg_matches
                    .value_of("mint_authority")
                    .unwrap_or(&config.fee_payer_path),
            )
            .expect("Cannot read mint authority keypair");

            print!("Creating new token metadata with ");
            println!("name: {} and symbol: {}", name, symbol);
            println!("For Mint: {}", mint_key);

            let client =
                Client::new_with_options(cluster, mint_authority, CommitmentConfig::processed());
            commands::metadata::initialize_metadata(
                &client,
                &metadata_id,
                &mint_key,
                &name,
                &symbol,
            )
            .expect("Initialize metadata error");
            println!("Metadata account successfully created");
        }

        ("initialize-token-wallet", Some(arg_matches)) => {
            let token_key = value_t_or_exit!(arg_matches, "token_account", Pubkey);
            let owner = value_t_or_exit!(arg_matches, "owner", Pubkey);
            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            commands::metadata::initialize_token_wallet(&client, &metadata_id, &token_key, &owner)
                .expect("Initialize token wallet error");
        }

        ("token-wallet-balance", Some(arg_matches)) => {
            let token_wallet = value_t_or_exit!(arg_matches, "token_wallet", Pubkey);
            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            let balance =
                commands::metadata::token_wallet_balance(&client, &metadata_id, &token_wallet)
                    .expect("Getting balance error");
            println!("Balance: {}", balance);
        }

        ("mint-to", Some(arg_matches)) => {
            let token_key = value_t_or_exit!(arg_matches, "token_account", Pubkey);
            let amount = value_t_or_exit!(arg_matches, "amount", f64);
            let destination = value_t_or_exit!(arg_matches, "destination", Pubkey);

            let mint_authority = read_keypair_file(
                arg_matches
                    .value_of("mint_authority")
                    .unwrap_or(&config.fee_payer_path),
            )
            .expect("Cannot read mint authority keypair");

            println!("Mint {} tokens ({}) to {}", amount, token_key, destination);

            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            commands::metadata::mint_to(
                &client,
                &metadata_id,
                &token_key,
                &destination,
                &mint_authority,
                amount,
            )
            .expect("Mint to error");

            println!("Tokens successfully minted");
        }

        ("transfer", Some(arg_matches)) => {
            let token_key = value_t_or_exit!(arg_matches, "token_account", Pubkey);
            let amount = value_t_or_exit!(arg_matches, "amount", f64);
            let source = value_t_or_exit!(arg_matches, "source", Pubkey);
            let destination = value_t_or_exit!(arg_matches, "destination", Pubkey);

            let payer = read_keypair_file(
                arg_matches
                    .value_of("transfer_authority")
                    .unwrap_or(&config.fee_payer_path),
            )
            .expect("Cannot read owner keypair");

            println!(
                "Transfer {} tokens ({}) to {}",
                amount, token_key, destination
            );

            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            commands::metadata::transfer(
                &client,
                &metadata_id,
                &token_key,
                &source,
                &destination,
                amount,
            )
            .expect("Transfer error");

            println!("Tokens successfully transferred");
        }

        ("metadata-info", Some(arg_matches)) => {
            let metadata_key = value_t_or_exit!(arg_matches, "metadata_account", Pubkey);
            println!("Information of MetadataAccount: {}", metadata_key);
            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            commands::metadata::metadata_info(&client, &metadata_id, &metadata_key)
                .expect("Getting info error");
        }

        // Staking commands
        ("initialize-staking", Some(arg_matches)) => {
            let starting_interest_rate =
                value_t_or_exit!(arg_matches, "starting_interest_rate", u64);
            let max_interest_rate = value_t_or_exit!(arg_matches, "max_interest_rate", u64);
            let token_metadata = value_t_or_exit!(arg_matches, "token_metadata", Pubkey);
            let cap = value_t_or_exit!(arg_matches, "cap", f64);
            let starting_timestamp = match value_t!(arg_matches, "starting_timestamp", i64) {
                Ok(val) => Some(val),
                Err(_) => None,
            };

            let payer = read_keypair_file(
                arg_matches
                    .value_of("staking_data_owner")
                    .unwrap_or(&config.fee_payer_path),
            )
            .expect("Cannot read owner keypair");

            let mint_authority = read_keypair_file(
                arg_matches
                    .value_of("mint_authority")
                    .unwrap_or(&config.fee_payer_path),
            )
            .expect("Cannot read mint authority keypair");

            let staking_data = Keypair::new();
            print!("Initializing new StakingData Account: ");
            println!("{}", staking_data.pubkey());

            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            commands::staking::initialize_staking(
                &client,
                &staking_id,
                &staking_data,
                &token_metadata,
                starting_timestamp,
                max_interest_rate,
                starting_interest_rate,
                cap,
                &mint_authority,
            )
            .expect("Initialize staking error");
            println!("StakingData account successfully created");
        }

        ("staking-info", Some(arg_matches)) => {
            let staking_key = value_t_or_exit!(arg_matches, "staking_account", Pubkey);
            println!("Information of StakingData account: {}", staking_key);
            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            commands::staking::staking_info(&client, &staking_id, &staking_key)
                .expect("Getting info error");
        }

        ("staking-user-info", Some(arg_matches)) => {
            let staking_user_key = value_t_or_exit!(arg_matches, "staking_user_account", Pubkey);
            print!("Information of StakingUserData account: ");
            println!("{}", staking_user_key);
            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            commands::staking::staking_user_info(&client, &staking_id, &staking_user_key)
                .expect("Getting info error");
        }

        ("set-interest-rate", Some(arg_matches)) => {
            let new_interest_rate = value_t_or_exit!(arg_matches, "new_interest_rate", u64);
            let staking_data_key = value_t_or_exit!(arg_matches, "staking_data_account", Pubkey);

            let staking_data_owner = read_keypair_file(
                arg_matches
                    .value_of("staking_data_owner")
                    .unwrap_or(&config.fee_payer_path),
            )
            .expect("Cannot read owner keypair");

            println!("Updating staking data: {}", staking_data_key);
            println!("New interest rate: {}", new_interest_rate);

            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            commands::staking::set_interest_rate(
                &client,
                &staking_id,
                new_interest_rate,
                &staking_data_key,
                &staking_data_owner,
            )
            .expect("Set interest error");

            println!("Updating successfully completed");
        }

        ("initialize-user-staking", Some(arg_matches)) => {
            let staking_data_key = value_t_or_exit!(arg_matches, "staking_data_account", Pubkey);
            let payer = read_keypair_file(
                arg_matches
                    .value_of("user_authority")
                    .unwrap_or(&config.fee_payer_path),
            )
            .expect("Cannot read user authority keypair");

            println!("Creating new UserStakingData account");
            print!("User authority: ");
            println!("{}", payer.pubkey());

            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            commands::staking::initialize_user_staking(&client, &staking_id, &staking_data_key)
                .expect("Initializing error");

            println!("Initializing successfully completed");
        }

        ("stake", Some(arg_matches)) => {
            let ui_amount = value_t_or_exit!(arg_matches, "ui_amount", f64);
            let staking_user_data_key =
                value_t_or_exit!(arg_matches, "staking_user_data_account", Pubkey);
            let user_token_wallet_owner = read_keypair_file(
                arg_matches
                    .value_of("user_authority")
                    .unwrap_or(&config.fee_payer_path),
            )
            .expect("Cannot read user authority keypair");

            println!("Staking {} tokens", ui_amount);
            println!("User authority: {}", user_token_wallet_owner.pubkey());
            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            commands::staking::stake(
                &client,
                &staking_id,
                ui_amount,
                &staking_user_data_key,
                &user_token_wallet_owner,
            )
            .expect("Stake error");

            println!("Staking successfully completed");
        }

        ("unstake", Some(arg_matches)) => {
            let ui_amount = value_t_or_exit!(arg_matches, "ui_amount", f64);
            let staking_user_data_key =
                value_t_or_exit!(arg_matches, "staking_user_data_account", Pubkey);
            let user_token_wallet_owner = read_keypair_file(
                arg_matches
                    .value_of("user_authority")
                    .unwrap_or(&config.fee_payer_path),
            )
            .expect("Cannot read user authority keypair");

            println!("Unstake {} tokens", ui_amount);
            println!("User authority: {}", user_token_wallet_owner.pubkey());
            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            commands::staking::unstake(
                &client,
                &staking_id,
                ui_amount,
                &staking_user_data_key,
                &user_token_wallet_owner,
            )
            .expect("Unstake error");

            println!("Unstake successfully completed");
        }

        ("accrue-interest", Some(arg_matches)) => {
            let staking_data_key = value_t_or_exit!(arg_matches, "staking_data_account", Pubkey);

            println!("Accrue interest for staking: {}", staking_data_key);
            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            commands::staking::accrue_interest(&client, &staking_id, &staking_data_key)
                .expect("Accrue interest error");

            println!("Successfully completed");
        }

        ("total-staked-for", Some(arg_matches)) => {
            let staking_user_data =
                value_t_or_exit!(arg_matches, "staking_user_data_account", Pubkey);
            println!("Total staked for: {}", staking_user_data);
            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            let total_staked =
                commands::staking::total_staked_for(&client, &staking_id, &staking_user_data)
                    .expect("Getting data error");
            println!("{}", total_staked);
        }

        ("total-staked", Some(arg_matches)) => {
            let staking_data = value_t_or_exit!(arg_matches, "staking_data_account", Pubkey);
            println!("Total staked for StakingData Account: {}", staking_data);
            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            let total_staked = commands::staking::total_staked(&client, &staking_id, &staking_data)
                .expect("Getting data error");
            println!("{}", total_staked);
        }

        ("total-unminted-interest", Some(arg_matches)) => {
            let staking_data = value_t_or_exit!(arg_matches, "staking_data_account", Pubkey);
            print!("Total unminted interest for StakingData Account: ");
            println!("{}", staking_data);
            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            let total_unminted_interest =
                commands::staking::total_unminted_interest(&client, &staking_id, &staking_data)
                    .expect("Getting data error");
            println!("{}", total_unminted_interest);
        }

        // Governance commands
        ("initialize-governance", Some(arg_matches)) => {
            let staking_data_key = value_t_or_exit!(arg_matches, "staking_data_key", Pubkey);
            let approval_fixed_period_in_seconds =
                value_t_or_exit!(arg_matches, "approval_fixed_period_in_seconds", i64);
            let min_approval_percent = value_t_or_exit!(arg_matches, "min_approval_percent", u8);
            let min_stake_to_propose = value_t_or_exit!(arg_matches, "min_stake_to_propose", f64);
            let min_vote_participation_percent =
                value_t_or_exit!(arg_matches, "min_vote_participation_percent", u8);
            let payment_period_sec = value_t_or_exit!(arg_matches, "payment_period_sec", i64);
            let sponsors = values_t_or_exit!(arg_matches, "sponsor", Pubkey);

            println!("Initialize new Governance");
            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            commands::governance::initialize_governance(
                &client,
                &governance_id,
                &staking_id,
                &staking_data_key,
                approval_fixed_period_in_seconds,
                min_approval_percent,
                min_stake_to_propose,
                min_vote_participation_percent,
                payment_period_sec,
                sponsors,
            )
            .expect("Initialize error");
            println!("Successfully initialized");
        }

        ("initialize-treasury-stats", Some(arg_matches)) => {
            let governance_key = value_t_or_exit!(arg_matches, "governance", Pubkey);
            let mint_key = value_t_or_exit!(arg_matches, "mint", Pubkey);
            let max_proposal_payment_percent =
                value_t_or_exit!(arg_matches, "max_proposal_payment_percent", u8);
            let payment_amount_in_period_limit_percent =
                value_t_or_exit!(arg_matches, "payment_amount_in_period_limit_percent", u8);

            println!("Initialing treasury for Gov {}", governance_key);
            println!("Mint: {}", mint_key);
            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            commands::governance::initialize_treasury_stats(
                &client,
                &governance_id,
                &governance_key,
                &mint_key,
                max_proposal_payment_percent,
                payment_amount_in_period_limit_percent,
            )
            .expect("Initializing error");
            println!("Successfully initialized");
        }

        ("governance-info", Some(arg_matches)) => {
            let governance_key = value_t_or_exit!(arg_matches, "governance", Pubkey);
            println!("Information about governance: {}", governance_key);
            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            commands::governance::governance_info(&client, &governance_id, &governance_key)
                .expect("Getting data error");
        }

        ("treasury-stats-info", Some(arg_matches)) => {
            let governance_key = value_t_or_exit!(arg_matches, "governance", Pubkey);
            let treasury_key = value_t_or_exit!(arg_matches, "treasury", Pubkey);

            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            commands::governance::treasury_stats_info(
                &client,
                &governance_id,
                &governance_key,
                &treasury_key,
            )
            .expect("Getting data error");
        }

        ("add-sponsor", Some(arg_matches)) => {
            let governance_key = value_t_or_exit!(arg_matches, "governance", Pubkey);
            let sponsor_key = value_t_or_exit!(arg_matches, "sponsor", Pubkey);
            let signers = values_t_or_exit!(arg_matches, "signers", String);
            let signers: Vec<Keypair> = signers
                .iter()
                .map(|p| read_keypair_file(p).expect("Cannot read the signer keypair"))
                .collect();

            println!("Adding the {} into gov {}", sponsor_key, governance_key);
            println!("Signers:");
            for signer in &signers {
                println!("{}", signer.pubkey());
            }

            let rpc = RpcClient::new(cluster.url().to_string());
            commands::governance::add_sponsor(
                &rpc,
                &payer,
                &governance_id,
                &governance_key,
                &sponsor_key,
                &signers,
            )
            .expect("Adding sponsor error");
            println!("Successfully completed");
        }

        ("remove-sponsor", Some(arg_matches)) => {
            let governance_key = value_t_or_exit!(arg_matches, "governance", Pubkey);
            let sponsor_key = value_t_or_exit!(arg_matches, "sponsor", Pubkey);
            let signers = values_t_or_exit!(arg_matches, "signers", String);
            let signers: Vec<Keypair> = signers
                .iter()
                .map(|p| read_keypair_file(p).expect("Cannot read the signer keypair"))
                .collect();

            println!("Removing the {} from gov {}", sponsor_key, governance_key);
            println!("Signers:");
            for signer in &signers {
                println!("{}", signer.pubkey());
            }

            let rpc = RpcClient::new(cluster.url().to_string());
            commands::governance::remove_sponsor(
                &rpc,
                &payer,
                &governance_id,
                &governance_key,
                &sponsor_key,
                &signers,
            )
            .expect("Removing sponsor error");
            println!("Successfully completed");
        }

        ("treasury-balance", Some(arg_matches)) => {
            let treasury_key = value_t_or_exit!(arg_matches, "treasury", Pubkey);
            println!("For Governance: {}", treasury_key);
            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            let balance =
                commands::governance::treasury_balance(&client, &governance_id, &treasury_key)
                    .expect("Getting data error");
            println!("Balance: {}", balance);
        }

        ("fund-treasury", Some(arg_matches)) => {
            let amount = value_t_or_exit!(arg_matches, "amount", f64);
            let governance_key = value_t_or_exit!(arg_matches, "governance", Pubkey);
            let treasury_key = value_t_or_exit!(arg_matches, "treasury", Pubkey);
            let user_token_wallet = match value_t!(arg_matches, "user_token_wallet", Pubkey) {
                Ok(key) => Some(key),
                Err(_) => None,
            };
            let user_token_wallet_owner = read_keypair_file(
                arg_matches
                    .value_of("user_authority")
                    .unwrap_or(&config.fee_payer_path),
            )
            .expect("Cannot read user authority keypair");

            print!("Funding the treasury of Governance: ");
            println!("{}", governance_key);
            println!("User authority: {}", user_token_wallet_owner.pubkey());
            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            commands::governance::fund_treasury(
                &client,
                &governance_id,
                amount,
                &governance_key,
                &treasury_key,
                &user_token_wallet,
                &user_token_wallet_owner,
            )
            .expect("Funding error");
            println!("Successfully completed");
        }

        ("make-proposal", Some(arg_matches)) => {
            let governance_key = value_t_or_exit!(arg_matches, "governance", Pubkey);
            let staking_user_data = value_t_or_exit!(arg_matches, "staking_user_data", Pubkey);
            let payment_amount = value_t_or_exit!(arg_matches, "payment_amount", f64);
            let recipient_key = value_t_or_exit!(arg_matches, "recipient", Pubkey);
            let ipfs_hash = value_t_or_exit!(arg_matches, "ipfs_hash", String);
            let user_token_wallet_owner = read_keypair_file(
                arg_matches
                    .value_of("user_authority")
                    .unwrap_or(&config.fee_payer_path),
            )
            .expect("Cannot read user authority keypair");

            println!("Creating new proposal with");
            println!("Governance: {}", governance_key);
            println!("Payment amount: {}", payment_amount);
            println!("Recipient: {}", recipient_key);
            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            commands::governance::make_proposal(
                &client,
                &governance_id,
                &staking_id,
                &governance_key,
                &staking_user_data,
                &user_token_wallet_owner,
                payment_amount,
                &recipient_key,
                &ipfs_hash,
            )
            .expect("Making proposal error");
            println!("Successfully completed");
        }

        ("approve-proposal", Some(arg_matches)) => {
            let staking_user_data_key = value_t_or_exit!(arg_matches, "staking_user_data", Pubkey);
            let proposal_key = value_t_or_exit!(arg_matches, "proposal", Pubkey);
            let vote = value_t_or_exit!(arg_matches, "vote", bool);
            let user_token_wallet_owner = read_keypair_file(
                arg_matches
                    .value_of("user_authority")
                    .unwrap_or(&config.fee_payer_path),
            )
            .expect("Cannot read user authority keypair");

            println!("Voting for proposal: {}", proposal_key);
            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            commands::governance::approve_proposal(
                &client,
                &governance_id,
                &staking_id,
                &staking_user_data_key,
                &user_token_wallet_owner,
                &proposal_key,
                vote,
            )
            .expect("Approve error");
            println!("Successfully completed");
        }

        ("finalize-proposal", Some(arg_matches)) => {
            let proposal_key = value_t_or_exit!(arg_matches, "proposal", Pubkey);

            println!("Trying to finalize the proposal: {}", proposal_key);
            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            commands::governance::finalize_proposal(&client, &governance_id, &proposal_key)
                .expect("Finalizing error");
            println!("Successfully completed");
            println!("Proposal info after finalizing:");
            commands::governance::proposal_info(&client, &governance_id, &proposal_key)
                .expect("Getting data error");
        }

        ("proposal-info", Some(arg_matches)) => {
            let proposal_key = value_t_or_exit!(arg_matches, "proposal", Pubkey);
            println!("Information about proposal: {}", proposal_key);
            let client = Client::new_with_options(cluster, payer, CommitmentConfig::processed());
            commands::governance::proposal_info(&client, &governance_id, &proposal_key)
                .expect("Getting data error");
        }

        _ => {
            println!("{}", app_matches.usage());
        }
    }
}
