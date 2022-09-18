///! Governance commands handlers
use anchor_client::{
    anchor_lang::InstructionData,
    solana_client::rpc_client::RpcClient,
    solana_sdk::{
        borsh::try_from_slice_unchecked,
        clock::Clock,
        instruction::{AccountMeta, Instruction},
        program_pack::Pack,
        pubkey::{Pubkey, MAX_SEED_LEN},
        rent::Rent,
        signature::Keypair,
        signer::Signer,
        system_program,
        sysvar::SysvarId,
        transaction::Transaction,
    },
    Client, ClientError,
};
use governance::{Governance, Proposal, TreasuryStats, PROPOSAL_PREFIX, VOTE_MARKER_PREFIX};
use spl_associated_token_account::{create_associated_token_account, get_associated_token_address};
use spl_token::{
    state::{Account, Mint},
    ui_amount_to_amount,
};
use spl_token_metadata::state::Metadata;
use staking::{StakingData, StakingUserData};

pub fn initialize_governance(
    client: &Client,
    gov_id: &Pubkey,
    staking_id: &Pubkey,
    stakind_data_key: &Pubkey,
    approval_fixed_period_in_seconds: i64,
    min_approval_percent: u8,
    min_stake_to_propose: f64,
    min_vote_participation_percent: u8,
    payment_period_sec: i64,
    sponsors: Vec<Pubkey>,
) -> Result<(), ClientError> {
    let gov_program = client.program(*gov_id);
    let staking_program = client.program(*staking_id);

    let staking_data: StakingData = staking_program.account(*stakind_data_key)?;
    let metadata_account = gov_program
        .rpc()
        .get_account(&staking_data.stake_token_metadata)?;
    let metadata_data: Metadata = try_from_slice_unchecked(&metadata_account.data).unwrap();
    let mint_acc = gov_program.rpc().get_account(&metadata_data.mint)?;
    let mint_data = Mint::unpack(&mint_acc.data).unwrap();

    let governance_key = Keypair::new();
    let (treasury_owner_pda, treasury_owner_bump) = Pubkey::find_program_address(
        &[
            governance::TREASURY_PREFIX.as_bytes(),
            gov_id.as_ref(),
            governance_key.pubkey().as_ref(),
        ],
        &gov_id,
    );

    print!("New pubkey for Governance data: ");
    println!("{}", governance_key.pubkey());
    println!("New pubkey for treasury owner: {}", treasury_owner_pda);

    // Initialize governance
    gov_program
        .request()
        .accounts(governance::accounts::InitializeGovernance {
            governance: governance_key.pubkey(),
            treasury_owner: treasury_owner_pda,
            payer: gov_program.payer(),
            system_program: system_program::id(),
            rent: Rent::id(),
            clock: Clock::id(),
        })
        .args(governance::instruction::InitializeGovernance {
            staking_data_key: *stakind_data_key,
            approval_fixed_period_in_seconds: approval_fixed_period_in_seconds,
            min_approval_percent: min_approval_percent,
            min_stake_to_propose: ui_amount_to_amount(min_stake_to_propose, mint_data.decimals),
            min_vote_participation_percent: min_vote_participation_percent,
            payment_period_sec: payment_period_sec,
            treasury_owner_bump: treasury_owner_bump,
            sponsors: sponsors,
        })
        .signer(&governance_key)
        .send()?;

    Ok(())
}

pub fn initialize_treasury_stats(
    client: &Client,
    gov_id: &Pubkey,
    governance_key: &Pubkey,
    treasury_mint: &Pubkey,
    max_proposal_payment_percent: u8,
    payment_amount_in_period_limit_percent: u8,
) -> Result<(), ClientError> {
    let gov_program = client.program(*gov_id);

    let governance_data: Governance = gov_program.account(*governance_key)?;
    let treasury_owner_pda = Pubkey::create_program_address(
        &[
            governance::TREASURY_PREFIX.as_bytes(),
            gov_id.as_ref(),
            governance_key.as_ref(),
            &[governance_data.treasury_owner_bump],
        ],
        &gov_id,
    )
    .expect("Creating PDA Error");
    println!("Treasury owner: {}", treasury_owner_pda);

    // Create token account for treasury
    let treasury = get_associated_token_address(&treasury_owner_pda, &treasury_mint);
    println!("Pubkey for treasury: {}", treasury);

    if let Some(account) = gov_program
        .rpc()
        .get_account_with_commitment(&treasury, gov_program.rpc().commitment())?
        .value
    {
        let account_data = Account::unpack(&account.data).unwrap();
        if account.owner == spl_token::id()
            && account_data.owner == treasury_owner_pda
            && account_data.mint == *treasury_mint
        {
            println!("Holding wallet account already exists");
        } else {
            panic!("Account {} was incorrectly initialized", treasury);
        }
    } else {
        println!("Initializing treasury wallet");
        gov_program
            .request()
            .instruction(create_associated_token_account(
                &gov_program.payer(),
                &treasury_owner_pda,
                &treasury_mint,
            ))
            .send()?;
    }

    // Initialize Stats
    let (treasury_stats_pda, treasury_stats_bump) = Pubkey::find_program_address(
        &[
            governance::TREASURY_STATS_PREFIX.as_bytes(),
            gov_id.as_ref(),
            governance_key.as_ref(),
            treasury.as_ref(),
        ],
        &gov_id,
    );

    gov_program
        .request()
        .accounts(governance::accounts::InitializeTreasuryStats {
            governance: *governance_key,
            treasury: treasury,
            treasury_owner: treasury_owner_pda,
            treasury_stats: treasury_stats_pda,
            payer: gov_program.payer(),
            system_program: system_program::id(),
            rent: Rent::id(),
        })
        .args(governance::instruction::InitializeTreasuryStats {
            max_proposal_payment_percent: max_proposal_payment_percent,
            payment_amount_in_period_limit_percent: payment_amount_in_period_limit_percent,
            _treasury_stats_bump: treasury_stats_bump,
        })
        .send()?;

    Ok(())
}

pub fn governance_info(
    client: &Client,
    program_id: &Pubkey,
    governance: &Pubkey,
) -> Result<(), ClientError> {
    let program = client.program(*program_id);
    let governance_data: Governance = program.account(*governance)?;
    println!("staking_data: {}", governance_data.staking_data);
    println!(
        "approval_fixed_period_in_seconds: {}",
        governance_data.approval_fixed_period_in_seconds
    );
    println!(
        "min_approval_percent: {}",
        governance_data.min_approval_percent
    );
    println!(
        "min_stake_to_propose: {}",
        governance_data.min_stake_to_propose
    );
    println!(
        "min_vote_participation_percent: {}",
        governance_data.min_vote_participation_percent
    );
    println!(
        "payment_period_start: {}",
        governance_data.payment_period_start
    );
    println!("payment_period_sec: {}", governance_data.payment_period_sec);
    println!("sponsors: {:?}", governance_data.sponsors);
    println!(
        "Treasure owner bump: {}",
        governance_data.treasury_owner_bump
    );

    Ok(())
}

pub fn treasury_stats_info(
    client: &Client,
    program_id: &Pubkey,
    governance_key: &Pubkey,
    treasury_key: &Pubkey,
) -> Result<(), ClientError> {
    let program = client.program(*program_id);

    let (treasury_stats_pda, _) = Pubkey::find_program_address(
        &[
            governance::TREASURY_STATS_PREFIX.as_bytes(),
            program_id.as_ref(),
            governance_key.as_ref(),
            treasury_key.as_ref(),
        ],
        &program_id,
    );
    let treasury_stats_data: TreasuryStats = program.account(treasury_stats_pda)?;

    println!("treasury: {}", treasury_stats_data.treasury);
    println!(
        "max_proposal_payment_percent: {}",
        treasury_stats_data.max_proposal_payment_percent
    );
    println!(
        "payment_amount_in_period_limit_percent: {}",
        treasury_stats_data.payment_amount_in_period_limit_percent
    );
    println!(
        "payment_amount_in_period: {}",
        treasury_stats_data.payment_amount_in_period
    );
    println!("highest_balance: {}", treasury_stats_data.highest_balance);

    Ok(())
}

pub fn add_sponsor(
    rpc: &RpcClient,
    payer: &Keypair,
    governance_id: &Pubkey,
    governance_key: &Pubkey,
    sponsor_key: &Pubkey,
    signers: &Vec<Keypair>,
) -> Result<(), ClientError> {
    let mut accounts = vec![AccountMeta {
        pubkey: *governance_key,
        is_signer: false,
        is_writable: true,
    }];
    let mut signing_keypairs = vec![];
    for signer in signers {
        signing_keypairs.push(signer);
        accounts.push(AccountMeta {
            pubkey: signer.pubkey(),
            is_signer: true,
            is_writable: false,
        });
    }

    let recent_blockhash = rpc.get_recent_blockhash().unwrap().0;
    let transaction = Transaction::new_signed_with_payer(
        &[Instruction {
            program_id: *governance_id,
            data: governance::instruction::AddSponsor {
                sponsor: *sponsor_key,
            }
            .data(),
            accounts: accounts,
        }],
        Some(&payer.pubkey()),
        &signing_keypairs,
        recent_blockhash,
    );
    rpc.send_and_confirm_transaction(&transaction)?;

    Ok(())
}

pub fn remove_sponsor(
    rpc: &RpcClient,
    payer: &Keypair,
    governance_id: &Pubkey,
    governance_key: &Pubkey,
    sponsor_key: &Pubkey,
    signers: &Vec<Keypair>,
) -> Result<(), ClientError> {
    let mut accounts = vec![AccountMeta {
        pubkey: *governance_key,
        is_signer: false,
        is_writable: true,
    }];
    let mut signing_keypairs = vec![];
    for signer in signers {
        signing_keypairs.push(signer);
        accounts.push(AccountMeta {
            pubkey: signer.pubkey(),
            is_signer: true,
            is_writable: false,
        });
    }

    let recent_blockhash = rpc.get_recent_blockhash().unwrap().0;
    let transaction = Transaction::new_signed_with_payer(
        &[Instruction {
            program_id: *governance_id,
            data: governance::instruction::RemoveSponsor {
                sponsor: *sponsor_key,
            }
            .data(),
            accounts: accounts,
        }],
        Some(&payer.pubkey()),
        &signing_keypairs,
        recent_blockhash,
    );
    rpc.send_and_confirm_transaction(&transaction)?;

    Ok(())
}

pub fn treasury_balance(
    client: &Client,
    program_id: &Pubkey,
    treasury_key: &Pubkey,
) -> Result<u64, ClientError> {
    let program = client.program(*program_id);
    // Unpack data
    let treasury_acc = program.rpc().get_account(&treasury_key)?;
    let treasury_data = Account::unpack(&treasury_acc.data)?;
    Ok(treasury_data.amount)
}

pub fn fund_treasury(
    client: &Client,
    program_id: &Pubkey,
    amount: f64,
    governance_key: &Pubkey,
    treasury_key: &Pubkey,
    user_token_wallet: &Option<Pubkey>,
    user_token_wallet_owner: &Keypair,
) -> Result<(), ClientError> {
    let program = client.program(*program_id);

    // Unpack data
    let governance_data: Governance = program.account(governance_key.clone())?;
    let treasury_acc = program.rpc().get_account(treasury_key)?;
    let treasury_data = Account::unpack(&treasury_acc.data)?;
    let mint_acc = program.rpc().get_account(&treasury_data.mint)?;
    let mint_data = Mint::unpack(&mint_acc.data)?;

    let treasury_owner_pda = Pubkey::create_program_address(
        &[
            governance::TREASURY_PREFIX.as_bytes(),
            program_id.as_ref(),
            governance_key.as_ref(),
            &[governance_data.treasury_owner_bump],
        ],
        &program_id,
    )
    .expect("Creating PDA Error");

    let (treasury_stats_pda, _) = Pubkey::find_program_address(
        &[
            governance::TREASURY_STATS_PREFIX.as_bytes(),
            program_id.as_ref(),
            governance_key.as_ref(),
            treasury_key.as_ref(),
        ],
        &program_id,
    );

    // Get or find user token wallet
    let user_token_wallet = match user_token_wallet {
        Some(wallet) => {
            println!("Provided user wallet pubkey: {}", wallet);
            *wallet
        }
        None => {
            let user_associated_token_address = get_associated_token_address(
                &user_token_wallet_owner.pubkey(),
                &treasury_data.mint,
            );
            println!("Pubkey for user wallet: {}", user_associated_token_address);
            if let Some(account) = program
                .rpc()
                .get_account_with_commitment(
                    &user_associated_token_address,
                    program.rpc().commitment(),
                )?
                .value
            {
                let account_data = Account::unpack(&account.data).unwrap();
                if account.owner == spl_token::id()
                    && account_data.owner == user_token_wallet_owner.pubkey()
                    && account_data.mint == treasury_data.mint
                {
                    println!("Holding wallet account already exists");
                } else {
                    panic!(
                        "Account {} was incorrectly initialized",
                        user_associated_token_address
                    );
                }
            } else {
                println!("Initializing new user token wallet");
                program
                    .request()
                    .instruction(create_associated_token_account(
                        &user_token_wallet_owner.pubkey(),
                        &user_token_wallet_owner.pubkey(),
                        &treasury_data.mint,
                    ))
                    .send()?;
            }
            user_associated_token_address
        }
    };

    // Fund
    program
        .request()
        .accounts(governance::accounts::FundTreasury {
            governance: *governance_key,
            user_token_wallet: user_token_wallet,
            user_token_wallet_owner: user_token_wallet_owner.pubkey(),
            treasury: *treasury_key,
            treasury_owner: treasury_owner_pda,
            treasury_mint: treasury_data.mint,
            treasury_stats: treasury_stats_pda,
            token_program: spl_token::id(),
        })
        .args(governance::instruction::FundTreasury {
            amount: spl_token::ui_amount_to_amount(amount, mint_data.decimals),
        })
        .signer(user_token_wallet_owner)
        .send()?;

    Ok(())
}

pub fn make_proposal(
    client: &Client,
    gov_id: &Pubkey,
    staking_id: &Pubkey,
    governance_key: &Pubkey,
    staking_user_data_key: &Pubkey,
    user_token_wallet_owner: &Keypair,
    payment_amount: f64,
    recipient: &Pubkey,
    ipfs_hash: &String,
) -> Result<(), ClientError> {
    let gov_program = client.program(*gov_id);
    let staking_program = client.program(*staking_id);

    let governance_data: Governance = gov_program.account(governance_key.clone())?;
    let staking_user_data: StakingUserData = staking_program.account(*staking_user_data_key)?;

    let treasury_owner_pda = Pubkey::create_program_address(
        &[
            governance::TREASURY_PREFIX.as_bytes(),
            gov_id.as_ref(),
            governance_key.as_ref(),
            &[governance_data.treasury_owner_bump],
        ],
        &gov_id,
    )
    .expect("Creating PDA Error");

    let recipient_acc = gov_program.rpc().get_account(recipient)?;
    let mint_key = Account::unpack(&recipient_acc.data)?.mint;
    let mint_acc = gov_program.rpc().get_account(&mint_key)?;
    let mint_data = Mint::unpack(&mint_acc.data).unwrap();
    let treasury = get_associated_token_address(&treasury_owner_pda, &mint_key);
    println!("Treasury: {}", treasury);

    // Check treasury is created
    gov_program
        .rpc()
        .get_account_with_commitment(&treasury, gov_program.rpc().commitment())?
        .value
        .expect("There is none treasury for this SPL Token");

    // Get the treasury stats
    let (treasury_stats_pda, _) = Pubkey::find_program_address(
        &[
            governance::TREASURY_STATS_PREFIX.as_bytes(),
            gov_id.as_ref(),
            governance_key.as_ref(),
            treasury.as_ref(),
        ],
        &gov_id,
    );

    // pda of ['proposal', governance_program_id, governance, ipfs_hash[0..32]]
    let (proposal_key, bump) = Pubkey::find_program_address(
        &[
            PROPOSAL_PREFIX.as_bytes(),
            gov_id.as_ref(),
            governance_key.as_ref(),
            ipfs_hash[..MAX_SEED_LEN].as_bytes(),
        ],
        &gov_id,
    );
    println!("Unique pubkey for proposal: {}", proposal_key);

    // Create proposal
    gov_program
        .request()
        .accounts(governance::accounts::MakeProposal {
            governance: *governance_key,
            treasury: treasury,
            treasury_stats: treasury_stats_pda,
            staking_user_data: *staking_user_data_key,
            user_token_wallet: staking_user_data.user_token_wallet,
            user_token_wallet_owner: user_token_wallet_owner.pubkey(),
            proposal: proposal_key,
            recipient: *recipient,
            payer: gov_program.payer(),
            system_program: system_program::id(),
            rent: Rent::id(),
            clock: Clock::id(),
        })
        .args(governance::instruction::MakeProposal {
            payment_amount: ui_amount_to_amount(payment_amount, mint_data.decimals),
            _proposal_bump: bump,
            ipfs_hash: ipfs_hash.clone(),
        })
        .signer(user_token_wallet_owner)
        .send()?;

    Ok(())
}

pub fn approve_proposal(
    client: &Client,
    gov_id: &Pubkey,
    staking_id: &Pubkey,
    staking_user_data_key: &Pubkey,
    user_token_wallet_owner: &Keypair,
    proposal_key: &Pubkey,
    vote: bool,
) -> Result<(), ClientError> {
    let gov_program = client.program(*gov_id);
    let staking_program = client.program(*staking_id);

    let staking_user_data: StakingUserData = staking_program.account(*staking_user_data_key)?;
    let proposal_data: Proposal = gov_program.account(*proposal_key)?;

    // pda of ['vote', governance, proposal, staking_user_data]
    let (vote_marker_pda, bump) = Pubkey::find_program_address(
        &[
            VOTE_MARKER_PREFIX.as_bytes(),
            proposal_data.governance.as_ref(),
            proposal_key.as_ref(),
            staking_user_data_key.as_ref(),
        ],
        &gov_id,
    );

    // Approve
    gov_program
        .request()
        .accounts(governance::accounts::ApproveProposal {
            governance: proposal_data.governance,
            staking_user_data: *staking_user_data_key,
            user_token_wallet: staking_user_data.user_token_wallet,
            user_token_wallet_owner: user_token_wallet_owner.pubkey(),
            staking_data: staking_user_data.staking_data,
            proposal: *proposal_key,
            vote_marker: vote_marker_pda,
            payer: gov_program.payer(),
            staking_program: *staking_id,
            system_program: system_program::id(),
            clock: Clock::id(),
        })
        .args(governance::instruction::ApproveProposal {
            vote: vote,
            marker_bump: bump,
        })
        .signer(user_token_wallet_owner)
        .send()?;

    Ok(())
}

pub fn finalize_proposal(
    client: &Client,
    gov_id: &Pubkey,
    proposal_key: &Pubkey,
) -> Result<(), ClientError> {
    let gov_program = client.program(*gov_id);

    let proposal_data: Proposal = gov_program.account(*proposal_key)?;
    let governance_data: Governance = gov_program.account(proposal_data.governance)?;

    let treasury_owner_pda = Pubkey::create_program_address(
        &[
            governance::TREASURY_PREFIX.as_bytes(),
            gov_id.as_ref(),
            proposal_data.governance.as_ref(),
            &[governance_data.treasury_owner_bump],
        ],
        &gov_id,
    )
    .expect("Creating PDA Error");

    let recipient_acc = gov_program.rpc().get_account(&proposal_data.recipient)?;
    let mint_key = Account::unpack(&recipient_acc.data)?.mint;
    let treasury = get_associated_token_address(&treasury_owner_pda, &mint_key);
    println!("Treasury: {}", treasury);

    // Check treasury is created
    gov_program
        .rpc()
        .get_account_with_commitment(&treasury, gov_program.rpc().commitment())?
        .value
        .expect("There is none treasury for this SPL Token");

    let treasury_account = gov_program.rpc().get_account(&treasury)?;
    let treasury_account_data = Account::unpack(&treasury_account.data)?;

    gov_program
        .request()
        .accounts(governance::accounts::FinalizeProposal {
            governance: proposal_data.governance,
            staking_data: governance_data.staking_data,
            proposal: *proposal_key,
            treasury: treasury,
            treasury_owner: treasury_owner_pda,
            treasury_mint: treasury_account_data.mint,
            recipient: proposal_data.recipient,
            token_program: spl_token::id(),
            clock: Clock::id(),
        })
        .args(governance::instruction::FinalizeProposal)
        .send()?;

    Ok(())
}

pub fn proposal_info(
    client: &Client,
    program_id: &Pubkey,
    proposal: &Pubkey,
) -> Result<(), ClientError> {
    let program = client.program(*program_id);
    let proposal_data: Proposal = program.account(*proposal)?;
    println!("governance: {}", proposal_data.governance);
    println!("starting_timestamp: {}", proposal_data.starting_timestamp);
    println!("is_closed: {}", proposal_data.is_closed);
    println!("recipient: {}", proposal_data.recipient);
    println!("payment_amount: {}", proposal_data.payment_amount);
    println!("ipfs_hash: {}", proposal_data.ipfs_hash);
    println!("pros_weight: {}", proposal_data.pros_weight);
    println!("cons_weight: {}", proposal_data.cons_weight);
    println!("is_sponsored: {}", proposal_data.is_sponsored);

    Ok(())
}
