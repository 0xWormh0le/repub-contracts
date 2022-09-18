use anchor_client::{
    solana_sdk::{
        borsh::try_from_slice_unchecked, clock::Clock, program_pack::Pack, pubkey::Pubkey,
        rent::Rent, signature::Keypair, signer::Signer, system_program, sysvar::SysvarId,
    },
    Client, ClientError,
};
use bigint::U256;
use spl_associated_token_account::{create_associated_token_account, get_associated_token_address};
use spl_token::{
    state::{Account, Mint},
    ui_amount_to_amount,
};
use spl_token_metadata::state::Metadata;
use staking::{StakingData, StakingUserData};
///! Staking commands handlers
use std::{
    ops::{Div, Mul},
    time::{SystemTime, UNIX_EPOCH},
};

pub fn initialize_staking(
    client: &Client,
    program_id: &Pubkey,
    staking_data: &Keypair,
    token_metadata: &Pubkey,
    starting_timestamp: Option<i64>,
    max_interest_rate: u64,
    starting_interest_rate: u64,
    cap: f64,
    mint_authority: &Keypair,
) -> Result<(), ClientError> {
    let program = client.program(*program_id);

    let starting_timestamp = starting_timestamp.unwrap_or(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64,
    );
    println!("Starting timestamp: {}", starting_timestamp);

    // holding wallet owner is the pda of [staking_program_id, staking_data]
    let (holding_wallet_owner_pk, holding_bump) = Pubkey::find_program_address(
        &[&program_id.to_bytes(), &staking_data.pubkey().to_bytes()],
        program_id,
    );
    println!("New holding wallet owner: {}", holding_wallet_owner_pk);

    let metadata_account = program.rpc().get_account(token_metadata)?;
    let metadata: Metadata = try_from_slice_unchecked(&metadata_account.data).unwrap();
    let mint_acc = program.rpc().get_account(&metadata.mint)?;
    let mint_data = Mint::unpack(&mint_acc.data).unwrap();
    // Create new Token Account
    let holding_wallet = get_associated_token_address(&holding_wallet_owner_pk, &metadata.mint);
    println!("Pubkey for Token Holding wallet: {}", holding_wallet);
    if let Some(account) = program
        .rpc()
        .get_account_with_commitment(&holding_wallet, program.rpc().commitment())?
        .value
    {
        let account_data = Account::unpack(&account.data).unwrap();
        if account.owner == spl_token::id()
            && account_data.owner == holding_wallet_owner_pk
            && account_data.mint == metadata.mint
        {
            println!("Holding wallet account already exists");
        } else {
            panic!("Account {} was incorrectly initialized", holding_wallet);
        }
    } else {
        println!("Initializing holding wallet");
        program
            .request()
            .instruction(create_associated_token_account(
                &program.payer(),
                &holding_wallet_owner_pk,
                &metadata.mint,
            ))
            .send()?;
    }

    // Update mint authority to pda of [staking_program_id, staking_data_key, token_metadata_id]
    let (pda_mint_authority_pk, mint_auth_bump) = Pubkey::find_program_address(
        &[
            &program_id.to_bytes(),
            &staking_data.pubkey().to_bytes(),
            &token_metadata.to_bytes(),
        ],
        program_id,
    );
    println!("New token mint authority: {}", pda_mint_authority_pk);

    // Initialize Staking Data
    program
        .request()
        .instruction(spl_token::instruction::set_authority(
            &spl_token::id(),
            &metadata.mint,
            Some(&pda_mint_authority_pk),
            spl_token::instruction::AuthorityType::MintTokens,
            &mint_authority.pubkey(),
            &[],
        )?)
        .signer(mint_authority)
        .accounts(staking::accounts::InitializeStaking {
            staking_data: staking_data.pubkey(),
            staking_owner: program.payer(),
            holding_wallet: holding_wallet,
            holding_wallet_owner: holding_wallet_owner_pk,
            staking_token_metadata: *token_metadata,
            staking_token_mint: metadata.mint,
            rent: Rent::id(),
            clock: Clock::id(),
            system_program: system_program::id(),
        })
        .args(staking::instruction::InitializeStaking {
            token: *token_metadata,
            starting_interest_rate: starting_interest_rate,
            max_interest_rate: max_interest_rate,
            starting_timestamp: starting_timestamp,
            cap: ui_amount_to_amount(cap, mint_data.decimals),
            holding_bump: holding_bump,
            mint_auth_bump: mint_auth_bump,
        })
        .signer(staking_data)
        .send()?;

    Ok(())
}

pub fn set_interest_rate(
    client: &Client,
    program_id: &Pubkey,
    new_interest_rate: u64,
    staking_data_key: &Pubkey,
    staking_data_owner: &Keypair,
) -> Result<(), ClientError> {
    let program = client.program(*program_id);

    let staking_data: StakingData = program.account(*staking_data_key)?;
    let metadata_account = program
        .rpc()
        .get_account(&staking_data.stake_token_metadata)?;
    let metadata: Metadata = try_from_slice_unchecked(&metadata_account.data).unwrap();

    // Mint authority is pda of [staking_program_id, staking_data_key, token_metadata_id]
    let token_mint_authority = Pubkey::create_program_address(
        &[
            &program_id.to_bytes(),
            &staking_data_key.to_bytes(),
            &staking_data.stake_token_metadata.to_bytes(),
            &[staking_data.mint_auth_bump],
        ],
        program_id,
    )
    .expect("PDA Creating Error");

    // Set up new interest rate
    program
        .request()
        .accounts(staking::accounts::SetInterestRate {
            staking_data: *staking_data_key,
            staking_owner: staking_data_owner.pubkey(),
            holding_wallet: staking_data.holding_wallet,
            staking_token_metadata: staking_data.stake_token_metadata,
            mint: metadata.mint,
            mint_authority: token_mint_authority,
            token_program: spl_token::id(),
            clock: Clock::id(),
        })
        .args(staking::instruction::SetInterestRate {
            new_interest_rate: new_interest_rate,
        })
        .signer(staking_data_owner)
        .send()?;

    Ok(())
}

pub fn initialize_user_staking(
    client: &Client,
    program_id: &Pubkey,
    staking_data_key: &Pubkey,
) -> Result<(), ClientError> {
    let program = client.program(*program_id);

    let staking_data: StakingData = program.account(*staking_data_key)?;
    let metadata_account = program
        .rpc()
        .get_account(&staking_data.stake_token_metadata)?;
    let metadata: Metadata = try_from_slice_unchecked(&metadata_account.data).unwrap();

    let staking_user_data = Keypair::new();
    print!("Pubkey for UserStakingData account: ");
    println!("{}", staking_user_data.pubkey());

    // Find or initialize user SPL Token Account
    let user_token_wallet = get_associated_token_address(&program.payer(), &metadata.mint);
    println!("Pubkey for user token wallet: {}", user_token_wallet);
    if let Some(account) = program
        .rpc()
        .get_account_with_commitment(&user_token_wallet, program.rpc().commitment())?
        .value
    {
        let account_data = Account::unpack(&account.data).unwrap();
        if account.owner == spl_token::id()
            && account_data.owner == program.payer()
            && account_data.mint == metadata.mint
        {
            println!("User token wallet already exists");
        } else {
            panic!("Account {} was incorrectly initialized", user_token_wallet);
        }
    } else {
        println!("Initializing user token wallet");
        program
            .request()
            .instruction(create_associated_token_account(
                &program.payer(),
                &program.payer(),
                &metadata.mint,
            ))
            .send()?;
    }

    println!("Initialing user staking data");
    // Initialize user staking data account
    program
        .request()
        .accounts(staking::accounts::InitializeStakingUser {
            staking_user_data: staking_user_data.pubkey(),
            user_token_wallet: user_token_wallet,
            user_token_wallet_owner: program.payer(),
            staking_data: *staking_data_key,
            staking_token_metadata: staking_data.stake_token_metadata,
            system_program: system_program::id(),
            rent: Rent::id(),
        })
        .args(staking::instruction::InitializeStakingUser)
        .signer(&staking_user_data)
        .send()?;

    Ok(())
}

pub fn stake(
    client: &Client,
    program_id: &Pubkey,
    ui_amount: f64,
    staking_user_data_key: &Pubkey,
    user_token_wallet_owner: &Keypair,
) -> Result<(), ClientError> {
    let program = client.program(*program_id);

    // Get the user data
    let staking_user_data: StakingUserData = program.account(*staking_user_data_key)?;
    let staking_data: StakingData = program.account(staking_user_data.staking_data)?;
    let metadata_account = program
        .rpc()
        .get_account(&staking_data.stake_token_metadata)?;
    let token_metadata: Metadata = try_from_slice_unchecked(&metadata_account.data).unwrap();
    let mint_acc = program.rpc().get_account(&token_metadata.mint)?;
    let mint_data = Mint::unpack(&mint_acc.data).unwrap();

    // Mint authority is pda of [staking_program_id, staking_data_key, token_metadata_id]
    let token_mint_authority = Pubkey::create_program_address(
        &[
            &program_id.to_bytes(),
            &staking_user_data.staking_data.to_bytes(),
            &staking_data.stake_token_metadata.to_bytes(),
            &[staking_data.mint_auth_bump],
        ],
        program_id,
    )
    .expect("PDA Creating Error");

    // Stake
    program
        .request()
        .accounts(staking::accounts::Stake {
            staking_user_data: *staking_user_data_key,
            user_token_wallet: staking_user_data.user_token_wallet,
            user_token_wallet_owner: user_token_wallet_owner.pubkey(),
            staking_data: staking_user_data.staking_data,
            holding_wallet: staking_data.holding_wallet,
            staking_token_metadata: staking_data.stake_token_metadata,
            mint: token_metadata.mint,
            mint_authority: token_mint_authority,
            token_program: spl_token::id(),
            clock: Clock::id(),
        })
        .args(staking::instruction::Stake {
            amount: ui_amount_to_amount(ui_amount, mint_data.decimals),
        })
        .signer(user_token_wallet_owner)
        .send()?;

    Ok(())
}

pub fn unstake(
    client: &Client,
    program_id: &Pubkey,
    ui_amount: f64,
    staking_user_data_key: &Pubkey,
    user_token_wallet_owner: &Keypair,
) -> Result<(), ClientError> {
    let program = client.program(*program_id);

    // Get the user data
    let staking_user_data: StakingUserData = program.account(*staking_user_data_key)?;
    let staking_data: StakingData = program.account(staking_user_data.staking_data)?;
    let metadata_account = program
        .rpc()
        .get_account(&staking_data.stake_token_metadata)?;
    let token_metadata: Metadata = try_from_slice_unchecked(&metadata_account.data).unwrap();
    let mint_acc = program.rpc().get_account(&token_metadata.mint)?;
    let mint_data = Mint::unpack(&mint_acc.data).unwrap();

    // holding wallet owner is pda [staking_program_id, staking_data_id]
    let holding_wallet_owner_pk = Pubkey::create_program_address(
        &[
            &program_id.to_bytes(),
            &staking_user_data.staking_data.to_bytes(),
            &[staking_data.holding_bump],
        ],
        program_id,
    )
    .expect("PDA Creating Error");

    // Mint authority is pda of [staking_program_id, staking_data_key, token_metadata_id]
    let token_mint_authority = Pubkey::create_program_address(
        &[
            &program_id.to_bytes(),
            &staking_user_data.staking_data.to_bytes(),
            &staking_data.stake_token_metadata.to_bytes(),
            &[staking_data.mint_auth_bump],
        ],
        program_id,
    )
    .expect("PDA Creating Error");

    // Unstake
    program
        .request()
        .accounts(staking::accounts::Unstake {
            staking_user_data: *staking_user_data_key,
            user_token_wallet: staking_user_data.user_token_wallet,
            user_token_wallet_owner: user_token_wallet_owner.pubkey(),
            staking_data: staking_user_data.staking_data,
            holding_wallet: staking_data.holding_wallet,
            holding_wallet_owner: holding_wallet_owner_pk,
            staking_token_metadata: staking_data.stake_token_metadata,
            mint: token_metadata.mint,
            mint_authority: token_mint_authority,
            token_program: spl_token::id(),
            clock: Clock::id(),
        })
        .args(staking::instruction::Unstake {
            amount: ui_amount_to_amount(ui_amount, mint_data.decimals),
        })
        .signer(user_token_wallet_owner)
        .send()?;

    Ok(())
}

pub fn accrue_interest(
    client: &Client,
    program_id: &Pubkey,
    staking_data_key: &Pubkey,
) -> Result<(), ClientError> {
    let program = client.program(*program_id);

    // Get the user data
    let staking_data: StakingData = program.account(*staking_data_key)?;
    let metadata_account = program
        .rpc()
        .get_account(&staking_data.stake_token_metadata)?;
    let token_metadata: Metadata = try_from_slice_unchecked(&metadata_account.data).unwrap();

    // Mint authority is pda of [staking_program_id, staking_data_key, token_metadata_id]
    let token_mint_authority = Pubkey::create_program_address(
        &[
            &program_id.to_bytes(),
            &staking_data_key.to_bytes(),
            &staking_data.stake_token_metadata.to_bytes(),
            &[staking_data.mint_auth_bump],
        ],
        program_id,
    )
    .expect("PDA Creating Error");

    // Accrue interest
    program
        .request()
        .accounts(staking::accounts::AccrueInterest {
            staking_data: *staking_data_key,
            holding_wallet: staking_data.holding_wallet,
            staking_token_metadata: staking_data.stake_token_metadata,
            mint: token_metadata.mint,
            mint_authority: token_mint_authority,
            token_program: spl_token::id(),
            clock: Clock::id(),
        })
        .args(staking::instruction::AccrueInterest)
        .send()?;

    Ok(())
}

pub fn staking_info(
    client: &Client,
    program_id: &Pubkey,
    staking_key: &Pubkey,
) -> Result<(), ClientError> {
    let program = client.program(*program_id);
    let staking_data: StakingData = program.account(*staking_key)?;
    println!("owner: {}", staking_data.owner);
    println!(
        "stake_token_metadata: {}",
        staking_data.stake_token_metadata
    );
    println!("holding_wallet: {}", staking_data.holding_wallet);
    println!("total_staked: {}", staking_data.total_staked);
    println!("total_shares: {}", staking_data.total_shares);
    println!("interest_rate_daily: {}", staking_data.interest_rate_daily);
    println!(
        "max_interest_rate_daily: {}",
        staking_data.max_interest_rate_daily
    );
    println!(
        "last_interest_accrued_timestamp: {}",
        staking_data.last_interest_accrued_timestamp
    );
    println!("cap: {}", staking_data.cap);
    Ok(())
}

pub fn total_staked_for(
    client: &Client,
    program_id: &Pubkey,
    staking_user_key: &Pubkey,
) -> Result<u64, ClientError> {
    let program = client.program(*program_id);
    let staking_user_data: StakingUserData = program.account(*staking_user_key)?;
    let staking_data: StakingData = program.account(staking_user_data.staking_data)?;

    if staking_data.total_shares == 0 {
        return Ok(0);
    }

    let (unminted_interest, _) = staking::utils::calculate_accrued_interest(
        staking_data.last_interest_accrued_timestamp,
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64,
        staking_data.total_staked,
        staking_data.interest_rate_daily,
    );
    let total_staked_with_interest = staking_data
        .total_staked
        .checked_add(unminted_interest)
        .unwrap();
    let total_staked_with_interest: U256 = total_staked_with_interest.into();
    let ownership_share: U256 = staking_user_data.ownership_share.into();
    let total_shares: U256 = staking_data.total_shares.into();

    let total_staked_for = total_staked_with_interest
        .mul(ownership_share)
        .div(total_shares)
        .as_u64();

    Ok(total_staked_for)
}

pub fn total_staked(
    client: &Client,
    program_id: &Pubkey,
    staking_key: &Pubkey,
) -> Result<u64, ClientError> {
    let program = client.program(*program_id);
    let staking_data: StakingData = program.account(*staking_key)?;

    let (unminted_interest, _) = staking::utils::calculate_accrued_interest(
        staking_data.last_interest_accrued_timestamp,
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64,
        staking_data.total_staked,
        staking_data.interest_rate_daily,
    );
    let total_staked_with_interest = staking_data
        .total_staked
        .checked_add(unminted_interest)
        .unwrap();

    Ok(total_staked_with_interest)
}

pub fn total_unminted_interest(
    client: &Client,
    program_id: &Pubkey,
    staking_key: &Pubkey,
) -> Result<u64, ClientError> {
    let program = client.program(*program_id);
    let staking_data: StakingData = program.account(*staking_key)?;

    let (unminted_interest, _) = staking::utils::calculate_accrued_interest(
        staking_data.last_interest_accrued_timestamp,
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64,
        staking_data.total_staked,
        staking_data.interest_rate_daily,
    );

    Ok(unminted_interest)
}

pub fn staking_user_info(
    client: &Client,
    program_id: &Pubkey,
    staking_user_key: &Pubkey,
) -> Result<(), ClientError> {
    let program = client.program(*program_id);
    let staking_user_data: StakingUserData = program.account(*staking_user_key)?;
    println!("user_token_wallet: {}", staking_user_data.user_token_wallet);
    println!("staking_data: {}", staking_user_data.staking_data);
    println!("ownership_share: {}", staking_user_data.ownership_share);
    println!("locked amount: {}", staking_user_data.locked_amount);
    println!("locked until: {}", staking_user_data.locked_until);

    Ok(())
}
