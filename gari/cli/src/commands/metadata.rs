use std::io::Error;

///! Token metadata CLI commands handlers
use anchor_client::{
    solana_sdk::{
        borsh::try_from_slice_unchecked, program_pack::Pack, pubkey::Pubkey, rent::Rent,
        signature::Keypair, signer::Signer, system_instruction, system_program, sysvar::SysvarId,
    },
    Client, ClientError,
};
use spl_associated_token_account::{create_associated_token_account, get_associated_token_address};
use spl_token::{state::Account, state::Mint, ui_amount_to_amount};
use spl_token_metadata::state::Metadata;

pub fn create_token(client: &Client, program_id: &Pubkey, decimals: u8) -> Result<(), ClientError> {
    let program = client.program(*program_id);
    let mint = Keypair::new();
    println!("Generated Mint pubkey: {}", mint.pubkey());

    program
        .request()
        .instruction(system_instruction::create_account(
            &program.payer(),
            &mint.pubkey(),
            program
                .rpc()
                .get_minimum_balance_for_rent_exemption(Mint::LEN)?,
            Mint::LEN as u64,
            &spl_token::id(),
        ))
        .instruction(spl_token::instruction::initialize_mint(
            &spl_token::id(),
            &mint.pubkey(),
            &program.payer(),
            None,
            decimals,
        )?)
        .signer(&mint)
        .send()?;

    Ok(())
}

pub fn initialize_metadata(
    client: &Client,
    program_id: &Pubkey,
    mint: &Pubkey,
    name: &String,
    symbol: &String,
) -> Result<(), ClientError> {
    let program = client.program(*program_id);
    let metadata_rent = program
        .rpc()
        .get_minimum_balance_for_rent_exemption(spl_token_metadata::state::MAX_METADATA_LEN)?;

    let (metadata_key, _) = Pubkey::find_program_address(
        &[
            spl_token_metadata::state::PREFIX.as_bytes(),
            spl_token_metadata::id().as_ref(),
            mint.as_ref(),
        ],
        &spl_token_metadata::id(),
    );
    println!("Metadata Pubkey: {}", metadata_key);

    // Create Metadata
    program
        .request()
        .instruction(system_instruction::transfer(
            &program.payer(),
            &metadata_key,
            metadata_rent,
        ))
        .accounts(metadata::accounts::CreateMetadata {
            metadata: metadata_key,
            payer: program.payer(),
            mint: *mint,
            mint_authority: program.payer(),
            system_program: system_program::id(),
            token_program: spl_token::id(),
            token_metadata_program: spl_token_metadata::id(),
            rent: Rent::id(),
        })
        .args(metadata::instruction::CreateMetadata {
            name: name.to_string(),
            symbol: symbol.to_string(),
        })
        .send()?;

    Ok(())
}

pub fn initialize_token_wallet(
    client: &Client,
    program_id: &Pubkey,
    token_key: &Pubkey,
    wallet_owner: &Pubkey,
) -> Result<(), ClientError> {
    let program = client.program(*program_id);
    let token_account = program.rpc().get_account(token_key)?;
    let unpack_result: Result<Metadata, Error> = try_from_slice_unchecked(&token_account.data);
    let mint = match unpack_result {
        Ok(data) => data.mint,
        Err(_) => *token_key,
    };

    let token_wallet = get_associated_token_address(&wallet_owner, &mint);
    println!("Pubkey for Token wallet: {}", token_wallet);
    if let Some(account) = program
        .rpc()
        .get_account_with_commitment(&token_wallet, program.rpc().commitment())?
        .value
    {
        let account_data = spl_token::state::Account::unpack(&account.data).unwrap();
        if account.owner == spl_token::id()
            && account_data.owner == *wallet_owner
            && account_data.mint == mint
        {
            println!("Token wallet account already exists");
        } else {
            panic!("Account {} was incorrectly initialized", token_wallet);
        }
    } else {
        println!("Initializing token wallet");
        program
            .request()
            .instruction(create_associated_token_account(
                &program.payer(),
                wallet_owner,
                &mint,
            ))
            .send()?;
        println!("Token wallet successfully created");
    }

    Ok(())
}

pub fn token_wallet_balance(
    client: &Client,
    program_id: &Pubkey,
    token_wallet: &Pubkey,
) -> Result<u64, ClientError> {
    let program = client.program(*program_id);
    let token_account = program.rpc().get_account(token_wallet)?;
    let balance = Account::unpack(&token_account.data)?.amount;
    Ok(balance)
}

pub fn mint_to(
    client: &Client,
    program_id: &Pubkey,
    token_key: &Pubkey,
    destination: &Pubkey,
    mint_authority: &Keypair,
    amount: f64,
) -> Result<(), ClientError> {
    let program = client.program(*program_id);
    let token_account = program.rpc().get_account(token_key)?;
    let unpack_result: Result<Metadata, Error> = try_from_slice_unchecked(&token_account.data);
    let mint = match unpack_result {
        Ok(data) => data.mint,
        Err(_) => *token_key,
    };

    let mint_acc = program.rpc().get_account(&mint)?;
    let mint_data = Mint::unpack(&mint_acc.data).unwrap();

    program
        .request()
        .instruction(spl_token::instruction::mint_to(
            &spl_token::id(),
            &mint,
            &destination,
            &mint_authority.pubkey(),
            &[],
            ui_amount_to_amount(amount, mint_data.decimals),
        )?)
        .signer(mint_authority)
        .send()?;

    Ok(())
}

pub fn transfer(
    client: &Client,
    program_id: &Pubkey,
    token_key: &Pubkey,
    source: &Pubkey,
    destination: &Pubkey,
    amount: f64,
) -> Result<(), ClientError> {
    let program = client.program(*program_id);
    let token_account = program.rpc().get_account(token_key)?;
    let unpack_result: Result<Metadata, Error> = try_from_slice_unchecked(&token_account.data);
    let mint = match unpack_result {
        Ok(data) => data.mint,
        Err(_) => *token_key,
    };

    let mint_acc = program.rpc().get_account(&mint)?;
    let mint_data = Mint::unpack(&mint_acc.data).unwrap();

    program
        .request()
        .instruction(spl_token::instruction::transfer(
            &spl_token::id(),
            source,
            destination,
            &program.payer(),
            &[],
            ui_amount_to_amount(amount, mint_data.decimals),
        )?)
        .send()?;

    Ok(())
}

pub fn metadata_info(
    client: &Client,
    program_id: &Pubkey,
    metadata_key: &Pubkey,
) -> Result<(), ClientError> {
    let program = client.program(*program_id);
    let metadata_account = program.rpc().get_account(metadata_key)?;
    let metadata_data: Metadata = try_from_slice_unchecked(&metadata_account.data).unwrap();
    println!("mint: {}", metadata_data.mint);
    println!("name: {}", metadata_data.data.name);
    println!("symbol: {}", metadata_data.data.symbol);
    let mint_account = program.rpc().get_account(&metadata_data.mint)?;
    let mint_data = Mint::unpack(&mint_account.data)?;
    println!("Mint data: {:?}", mint_data);
    Ok(())
}
