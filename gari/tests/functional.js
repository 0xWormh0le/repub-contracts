const anchor = require('@project-serum/anchor');
const { TOKEN_PROGRAM_ID, Token, MintLayout } = require("@solana/spl-token");
const assert = require("assert");

const SECONDS_PER_DAY = 24 * 60 * 60;

const TREASURY_PREFIX = 'treasury';
const TREASURY_STATS_PREFIX = 'treasury_stats';
const PROPOSAL_PREFIX = 'proposal';
const VOTE_MARKER_PREFIX = 'vote';

function ui_amount_to_amount(ui_amount, decimals) {
  return Number(ui_amount * Math.pow(10, decimals))
}

function sleep(milliseconds) {
  var start = new Date().getTime();
  while (true) {
    if ((new Date().getTime() - start) > milliseconds) {
      break;
    }
  }
}

describe('functional tests', () => {
  const provider = anchor.Provider.local();
  anchor.setProvider(provider);

  const currentTimestamp = Math.floor(Date.now() / 1000);
  const metadataProgram = anchor.workspace.Metadata;
  const stakingProgram = anchor.workspace.Staking;
  const payer = metadataProgram.provider.wallet.payer;

  const mintAuthority = payer;
  let pdaMintAuthority = null;
  let metadataAccount = null;
  let mint = null;

  const stakingOwner = payer;
  let stakingAccount = null;
  let holdingWalletOwnerPK = null;
  let holdingWalletPK = null;

  const user1Authority = anchor.web3.Keypair.generate();
  let user1StakingData = null;
  let user1TokenWalletPK = null;

  const user2Authority = anchor.web3.Keypair.generate();
  let user2StakingData = null;
  let user2TokenWalletPK = null;

  const user3Authority = anchor.web3.Keypair.generate();
  let user3StakingData = null;
  let user3TokenWalletPK = null;

  const user4Authority = anchor.web3.Keypair.generate();
  let user4StakingData = null;
  let user4TokenWalletPK = null;

  // Token tests
  describe('Token tests', () => {
    it('Create metadata test', async () => {
      metadataAccount = anchor.web3.Keypair.generate();

      mint = await Token.createMint(
        provider.connection,
        payer,
        mintAuthority.publicKey,
        null,
        0,
        TOKEN_PROGRAM_ID
      );

      // ************
      // There is no way to test Metaplex Metadata accounts in test localnetwork.
      // ************
    });
  });

  // Staking tests
  const user1TokenBalance = 10.0;
  const user2TokenBalance = 25.0;
  const user3TokenBalance = 10.0;
  const user4TokenBalance = 10.1;

  describe('Staking tests', () => {
    it('Fundind users for stake', async () => {
      user1TokenWalletPK = await mint.createAccount(user1Authority.publicKey);
      user2TokenWalletPK = await mint.createAccount(user2Authority.publicKey);
      user3TokenWalletPK = await mint.createAccount(user3Authority.publicKey);
      user4TokenWalletPK = await mint.createAccount(user4Authority.publicKey);

      await mint.mintTo(
        user1TokenWalletPK,
        mintAuthority,
        [],
        ui_amount_to_amount(user1TokenBalance, 9)
      );
      let userInfo = await mint.getAccountInfo(user1TokenWalletPK);
      assert.equal(userInfo.amount, ui_amount_to_amount(user1TokenBalance, 9));

      await mint.mintTo(
        user2TokenWalletPK,
        mintAuthority,
        [],
        ui_amount_to_amount(user2TokenBalance, 9)
      );
      userInfo = await mint.getAccountInfo(user2TokenWalletPK);
      assert.equal(userInfo.amount, ui_amount_to_amount(user2TokenBalance, 9));

      await mint.mintTo(
        user3TokenWalletPK,
        mintAuthority,
        [],
        ui_amount_to_amount(user3TokenBalance, 9)
      );
      userInfo = await mint.getAccountInfo(user3TokenWalletPK);
      assert.equal(userInfo.amount, ui_amount_to_amount(user3TokenBalance, 9));

      await mint.mintTo(
        user4TokenWalletPK,
        mintAuthority,
        [],
        ui_amount_to_amount(user4TokenBalance, 9)
      );
      userInfo = await mint.getAccountInfo(user4TokenWalletPK);
      assert.equal(userInfo.amount, ui_amount_to_amount(user4TokenBalance, 9));
    });

    let cap = 0;

    it('Initialize staking account test', async () => {
      stakingAccount = anchor.web3.Keypair.generate();

      let pda = await anchor.web3.PublicKey.findProgramAddress(
        [stakingProgram.programId.toBuffer(), stakingAccount.publicKey.toBuffer()],
        stakingProgram.programId
      );
      holdingWalletOwnerPK = pda[0];
      let holdingBump = pda[1];
      holdingWalletPK = await mint.createAccount(holdingWalletOwnerPK);

      // Update mint authority to staking program
      pda = await anchor.web3.PublicKey.findProgramAddress(
        [
          stakingProgram.programId.toBuffer(),
          stakingAccount.publicKey.toBuffer(),
          metadataAccount.publicKey.toBuffer()
        ],
        stakingProgram.programId
      );
      pdaMintAuthority = pda[0];
      let mintAuthBump = pda[1];

      await mint.setAuthority(
        mint.publicKey,
        pdaMintAuthority,
        'MintTokens',
        mintAuthority,
        [],
      );

      // Set supply cap
      let mintInfo = await mint.getMintInfo();
      cap = mintInfo.supply.toNumber() - 1_000_000_000;

      // BadCase: Supply cap is less than current supply
      await assert.rejects(
        async () => {
          let startingTimestamp = currentTimestamp;
          let maxInterestRate = 365;
          let startingInterestRate = 188;
          await stakingProgram.rpc.initializeStaking(
            metadataAccount.publicKey,
            new anchor.BN(startingTimestamp),
            new anchor.BN(maxInterestRate),
            new anchor.BN(startingInterestRate),
            new anchor.BN(cap),
            holdingBump,
            mintAuthBump,
            {
              accounts: {
                stakingData: stakingAccount.publicKey,
                stakingOwner: stakingOwner.publicKey,
                holdingWallet: holdingWalletPK,
                holdingWalletOwner: holdingWalletOwnerPK,
                stakingTokenMetadata: metadataAccount.publicKey,
                stakingTokenMint: mint.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
              },
              signers: [stakingAccount, stakingOwner]
            }
          );
        },
        (err) => {
          assert.equal(err.code, 305);
          assert.equal(err.msg, "Invalid token supply cap");
          return true;
        }
      );

      // Set supply cap
      cap = mintInfo.supply.toNumber() + 1_000_000_000;

      // BadCase: starting timestamp in the past
      await assert.rejects(
        async () => {
          let startingTimestamp = currentTimestamp - 2 * SECONDS_PER_DAY;
          let maxInterestRate = 365;
          let startingInterestRate = 188;
          await stakingProgram.rpc.initializeStaking(
            metadataAccount.publicKey,
            new anchor.BN(startingTimestamp),
            new anchor.BN(maxInterestRate),
            new anchor.BN(startingInterestRate),
            new anchor.BN(cap),
            holdingBump,
            mintAuthBump,
            {
              accounts: {
                stakingData: stakingAccount.publicKey,
                stakingOwner: stakingOwner.publicKey,
                holdingWallet: holdingWalletPK,
                holdingWalletOwner: holdingWalletOwnerPK,
                stakingTokenMetadata: metadataAccount.publicKey,
                stakingTokenMint: mint.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
              },
              signers: [stakingAccount, stakingOwner]
            }
          );
        },
        (err) => {
          assert.equal(err.code, 300);
          assert.equal(err.msg, "Invalid starting timestamp");
          return true;
        }
      );

      let startingTimestamp = currentTimestamp;
      let maxInterestRate = 365;
      let startingInterestRate = 188;
      await stakingProgram.rpc.initializeStaking(
        metadataAccount.publicKey,
        new anchor.BN(startingTimestamp),
        new anchor.BN(maxInterestRate),
        new anchor.BN(startingInterestRate),
        new anchor.BN(cap),
        holdingBump,
        mintAuthBump,
        {
          accounts: {
            stakingData: stakingAccount.publicKey,
            stakingOwner: stakingOwner.publicKey,
            holdingWallet: holdingWalletPK,
            holdingWalletOwner: holdingWalletOwnerPK,
            stakingTokenMetadata: metadataAccount.publicKey,
            stakingTokenMint: mint.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          },
          signers: [stakingAccount, stakingOwner]
        }
      );

      // Check StakingData
      let checkMintInfo = await mint.getMintInfo();
      assert.ok(checkMintInfo.mintAuthority.equals(pdaMintAuthority));
      const checkStakingData = await stakingProgram.account.stakingData.fetch(stakingAccount.publicKey);
      assert.ok(checkStakingData.owner.equals(stakingOwner.publicKey));
      assert.ok(checkStakingData.stakeTokenMetadata.equals(metadataAccount.publicKey));
      assert.ok(checkStakingData.holdingWallet.equals(holdingWalletPK));
      assert.equal(checkStakingData.totalStaked, 0);
      assert.equal(checkStakingData.totalShares, 0);
      assert.equal(checkStakingData.interestRateDaily, 188);
      assert.equal(checkStakingData.maxInterestRateDaily, 365);
      assert.equal(checkStakingData.lastInterestAccruedTimestamp, startingTimestamp);
      assert.equal(checkStakingData.holdingBump, holdingBump);
      assert.equal(checkStakingData.mintAuthBump, mintAuthBump);
      assert.equal(checkStakingData.cap, cap);
    });

    it('Initialize user staking data', async () => {
      user1StakingData = anchor.web3.Keypair.generate();
      user2StakingData = anchor.web3.Keypair.generate();
      user3StakingData = anchor.web3.Keypair.generate();
      user4StakingData = anchor.web3.Keypair.generate();

      await stakingProgram.rpc.initializeStakingUser(
        {
          accounts: {
            stakingUserData: user1StakingData.publicKey,
            userTokenWallet: user1TokenWalletPK,
            userTokenWalletOwner: user1Authority.publicKey,
            stakingData: stakingAccount.publicKey,
            stakingTokenMetadata: metadataAccount.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          },
          // Funding fake authority so can pay the transaction
          instructions: [
            anchor.web3.SystemProgram.transfer({
              fromPubkey: payer.publicKey,
              toPubkey: user1Authority.publicKey,
              lamports: ui_amount_to_amount(5.0, 9),
            }),
          ],
          signers: [user1Authority, user1StakingData]
        }
      );

      const checkUser1Data = await stakingProgram.account.stakingUserData.fetch(user1StakingData.publicKey);
      assert.ok(checkUser1Data.userTokenWallet.equals(user1TokenWalletPK));
      assert.ok(checkUser1Data.stakingData.equals(stakingAccount.publicKey));
      assert.equal(checkUser1Data.ownershipShare, 0);
      assert.equal(checkUser1Data.lockedAmount, 0);
      assert.equal(checkUser1Data.lockedUntil, 0);

      await stakingProgram.rpc.initializeStakingUser(
        {
          accounts: {
            stakingUserData: user2StakingData.publicKey,
            userTokenWallet: user2TokenWalletPK,
            userTokenWalletOwner: user2Authority.publicKey,
            stakingData: stakingAccount.publicKey,
            stakingTokenMetadata: metadataAccount.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          },
          // Funding fake authority so can pay the transaction
          instructions: [
            anchor.web3.SystemProgram.transfer({
              fromPubkey: payer.publicKey,
              toPubkey: user2Authority.publicKey,
              lamports: ui_amount_to_amount(1.0, 9),
            }),
          ],
          signers: [user2Authority, user2StakingData]
        }
      );

      const checkUser2Data = await stakingProgram.account.stakingUserData.fetch(user2StakingData.publicKey);
      assert.ok(checkUser2Data.userTokenWallet.equals(user2TokenWalletPK));
      assert.ok(checkUser2Data.stakingData.equals(stakingAccount.publicKey));
      assert.equal(checkUser2Data.ownershipShare, 0);
      assert.equal(checkUser2Data.lockedAmount, 0);
      assert.equal(checkUser2Data.lockedUntil, 0);

      await stakingProgram.rpc.initializeStakingUser(
        {
          accounts: {
            stakingUserData: user3StakingData.publicKey,
            userTokenWallet: user3TokenWalletPK,
            userTokenWalletOwner: user3Authority.publicKey,
            stakingData: stakingAccount.publicKey,
            stakingTokenMetadata: metadataAccount.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          },
          // Funding fake authority so can pay the transaction
          instructions: [
            anchor.web3.SystemProgram.transfer({
              fromPubkey: payer.publicKey,
              toPubkey: user3Authority.publicKey,
              lamports: ui_amount_to_amount(1.0, 9),
            }),
          ],
          signers: [user3Authority, user3StakingData]
        }
      );

      const checkUser3Data = await stakingProgram.account.stakingUserData.fetch(user3StakingData.publicKey);
      assert.ok(checkUser3Data.userTokenWallet.equals(user3TokenWalletPK));
      assert.ok(checkUser3Data.stakingData.equals(stakingAccount.publicKey));
      assert.equal(checkUser3Data.ownershipShare, 0);
      assert.equal(checkUser3Data.lockedAmount, 0);
      assert.equal(checkUser3Data.lockedUntil, 0);

      await stakingProgram.rpc.initializeStakingUser(
        {
          accounts: {
            stakingUserData: user4StakingData.publicKey,
            userTokenWallet: user4TokenWalletPK,
            userTokenWalletOwner: user4Authority.publicKey,
            stakingData: stakingAccount.publicKey,
            stakingTokenMetadata: metadataAccount.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          },
          // Funding fake authority so can pay the transaction
          instructions: [
            anchor.web3.SystemProgram.transfer({
              fromPubkey: payer.publicKey,
              toPubkey: user4Authority.publicKey,
              lamports: ui_amount_to_amount(1.0, 9),
            }),
          ],
          signers: [user4Authority, user4StakingData]
        }
      );

      const checkUser4Data = await stakingProgram.account.stakingUserData.fetch(user4StakingData.publicKey);
      assert.ok(checkUser4Data.userTokenWallet.equals(user4TokenWalletPK));
      assert.ok(checkUser4Data.stakingData.equals(stakingAccount.publicKey));
      assert.equal(checkUser4Data.ownershipShare, 0);
      assert.equal(checkUser4Data.lockedAmount, 0);
      assert.equal(checkUser4Data.lockedUntil, 0);
    });

    it('Set interest rate test', async () => {
      // BadCase: new rate higher than allowed maximum
      await assert.rejects(
        async () => {
          const newInterestRate = 512;
          await stakingProgram.rpc.setInterestRate(
            new anchor.BN(newInterestRate),
            {
              accounts: {
                stakingData: stakingAccount.publicKey,
                stakingOwner: stakingOwner.publicKey,
                holdingWallet: holdingWalletPK,
                stakingTokenMetadata: metadataAccount.publicKey,
                mint: mint.publicKey,
                mintAuthority: pdaMintAuthority,
                tokenProgram: TOKEN_PROGRAM_ID,
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
              },
              signers: [stakingOwner]
            }
          );
        },
        (err) => {
          assert.equal(err.code, 301);
          assert.equal(err.msg, "Invalid interest rate");
          return true;
        }
      );

      const newInterestRate = 250;
      await stakingProgram.rpc.setInterestRate(
        new anchor.BN(newInterestRate),
        {
          accounts: {
            stakingData: stakingAccount.publicKey,
            stakingOwner: stakingOwner.publicKey,
            holdingWallet: holdingWalletPK,
            stakingTokenMetadata: metadataAccount.publicKey,
            mint: mint.publicKey,
            mintAuthority: pdaMintAuthority,
            tokenProgram: TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [stakingOwner]
        }
      );

      // Check StakingData
      const checkStakingData = await stakingProgram.account.stakingData.fetch(stakingAccount.publicKey);
      assert.ok(checkStakingData.owner.equals(stakingOwner.publicKey));
      assert.ok(checkStakingData.stakeTokenMetadata.equals(metadataAccount.publicKey));
      assert.ok(checkStakingData.holdingWallet.equals(holdingWalletPK));
      assert.equal(checkStakingData.totalStaked, 0);
      assert.equal(checkStakingData.totalShares, 0);
      assert.equal(checkStakingData.interestRateDaily, 250);
      assert.equal(checkStakingData.maxInterestRateDaily, 365);
      assert.equal(checkStakingData.lastInterestAccruedTimestamp, currentTimestamp);

      await stakingProgram.rpc.setInterestRate(
        new anchor.BN(188),
        {
          accounts: {
            stakingData: stakingAccount.publicKey,
            stakingOwner: stakingOwner.publicKey,
            holdingWallet: holdingWalletPK,
            stakingTokenMetadata: metadataAccount.publicKey,
            mint: mint.publicKey,
            mintAuthority: pdaMintAuthority,
            tokenProgram: TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [stakingOwner]
        }
      );
    });

    let user1StakeAmount = 5.0;
    let user2StakeAmount = 9.5;

    it('Stake test', async () => {
      // User1 stake tokens
      await stakingProgram.rpc.stake(
        new anchor.BN(ui_amount_to_amount(user1StakeAmount, 9)),
        {
          accounts: {
            stakingUserData: user1StakingData.publicKey,
            userTokenWallet: user1TokenWalletPK,
            userTokenWalletOwner: user1Authority.publicKey,
            stakingData: stakingAccount.publicKey,
            holdingWallet: holdingWalletPK,
            stakingTokenMetadata: metadataAccount.publicKey,
            mint: mint.publicKey,
            mintAuthority: pdaMintAuthority,
            tokenProgram: TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [user1Authority]
        }
      );

      // Check balances
      let userTokenInfo = await mint.getAccountInfo(user1TokenWalletPK);
      assert.equal(userTokenInfo.amount, ui_amount_to_amount(user1TokenBalance - user1StakeAmount, 9));
      let holdingWalletInfo = await mint.getAccountInfo(holdingWalletPK);
      assert.equal(holdingWalletInfo.amount, ui_amount_to_amount(user1StakeAmount, 9));
      // Check shares
      let checkStakingData = await stakingProgram.account.stakingData.fetch(stakingAccount.publicKey);
      assert.equal(checkStakingData.totalStaked, 5_000_000_000);
      assert.equal(checkStakingData.totalShares, 5_000_000_000);
      let checkStakingUserData = await stakingProgram.account.stakingUserData.fetch(user1StakingData.publicKey);
      assert.deepStrictEqual(checkStakingUserData.ownershipShare, checkStakingData.totalShares);

      // User2 stake tokens
      await stakingProgram.rpc.stake(
        new anchor.BN(ui_amount_to_amount(user2StakeAmount, 9)),
        {
          accounts: {
            stakingUserData: user2StakingData.publicKey,
            userTokenWallet: user2TokenWalletPK,
            userTokenWalletOwner: user2Authority.publicKey,
            stakingData: stakingAccount.publicKey,
            holdingWallet: holdingWalletPK,
            stakingTokenMetadata: metadataAccount.publicKey,
            mint: mint.publicKey,
            mintAuthority: pdaMintAuthority,
            tokenProgram: TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [user2Authority]
        }
      );

      // Check balances
      userTokenInfo = await mint.getAccountInfo(user2TokenWalletPK);
      assert.equal(userTokenInfo.amount, ui_amount_to_amount(user2TokenBalance - user2StakeAmount, 9));
      holdingWalletInfo = await mint.getAccountInfo(holdingWalletPK);
      assert.equal(holdingWalletInfo.amount, ui_amount_to_amount(user1StakeAmount + user2StakeAmount, 9));
      // Check shares
      checkStakingData = await stakingProgram.account.stakingData.fetch(stakingAccount.publicKey);
      assert.equal(checkStakingData.totalStaked, 14_500_000_000);
      assert.equal(checkStakingData.totalShares, 14_500_000_000);
      checkStakingUserData = await stakingProgram.account.stakingUserData.fetch(user2StakingData.publicKey);
      assert.equal(checkStakingUserData.ownershipShare.toNumber(), 9_500_000_000);
    });

    it('Unstake test', async () => {
      // User1 unstake tokens
      let user1UnstakeAmount = 5.0;
      await stakingProgram.rpc.unstake(
        new anchor.BN(ui_amount_to_amount(user1UnstakeAmount, 9)),
        {
          accounts: {
            stakingUserData: user1StakingData.publicKey,
            userTokenWallet: user1TokenWalletPK,
            userTokenWalletOwner: user1Authority.publicKey,
            stakingData: stakingAccount.publicKey,
            holdingWallet: holdingWalletPK,
            holdingWalletOwner: holdingWalletOwnerPK,
            stakingTokenMetadata: metadataAccount.publicKey,
            mint: mint.publicKey,
            mintAuthority: pdaMintAuthority,
            tokenProgram: TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [user1Authority]
        }
      );

      // Check balances
      let userTokenInfo = await mint.getAccountInfo(user1TokenWalletPK);
      assert.equal(userTokenInfo.amount, ui_amount_to_amount(user1TokenBalance, 9));
      let holdingWalletInfo = await mint.getAccountInfo(holdingWalletPK);
      assert.equal(holdingWalletInfo.amount, ui_amount_to_amount(user2StakeAmount, 9));
      // Check shares
      let checkStakingData = await stakingProgram.account.stakingData.fetch(stakingAccount.publicKey);
      assert.equal(checkStakingData.totalStaked, 9_500_000_000);
      assert.equal(checkStakingData.totalShares, 9_500_000_000);
      let checkStakingUserData = await stakingProgram.account.stakingUserData.fetch(user1StakingData.publicKey);
      assert.equal(checkStakingUserData.ownershipShare.toNumber(), 0);

      // User2 unstake tokens
      let user2UnstakeAmount = 5.0;
      await stakingProgram.rpc.unstake(
        new anchor.BN(ui_amount_to_amount(user2UnstakeAmount, 9)),
        {
          accounts: {
            stakingUserData: user2StakingData.publicKey,
            userTokenWallet: user2TokenWalletPK,
            userTokenWalletOwner: user2Authority.publicKey,
            stakingData: stakingAccount.publicKey,
            holdingWallet: holdingWalletPK,
            holdingWalletOwner: holdingWalletOwnerPK,
            stakingTokenMetadata: metadataAccount.publicKey,
            mint: mint.publicKey,
            mintAuthority: pdaMintAuthority,
            tokenProgram: TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [user2Authority]
        }
      );

      // Check balances
      userTokenInfo = await mint.getAccountInfo(user2TokenWalletPK);
      assert.equal(userTokenInfo.amount.toNumber(), 20_500_000_000);
      holdingWalletInfo = await mint.getAccountInfo(holdingWalletPK);
      assert.equal(holdingWalletInfo.amount.toNumber(), 4_500_000_000);
      // Check shares
      checkStakingData = await stakingProgram.account.stakingData.fetch(stakingAccount.publicKey);
      assert.equal(checkStakingData.totalStaked, 4_500_000_000);
      assert.equal(checkStakingData.totalShares, 4_500_000_000);
      checkStakingUserData = await stakingProgram.account.stakingUserData.fetch(user2StakingData.publicKey);
      assert.equal(checkStakingUserData.ownershipShare.toNumber(), 4_500_000_000);
    });

    it('Accrue interest instruction call test', async () => {
      await stakingProgram.rpc.accrueInterest(
        {
          accounts: {
            stakingData: stakingAccount.publicKey,
            holdingWallet: holdingWalletPK,
            stakingTokenMetadata: metadataAccount.publicKey,
            mint: mint.publicKey,
            mintAuthority: pdaMintAuthority,
            tokenProgram: TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          }
        }
      );
    });
  });

  // Governance tests
  const govUser1Auth = anchor.web3.Keypair.generate();
  const govUser2Auth = anchor.web3.Keypair.generate();

  let govUser1TokenWallet = null;
  let govUser2TokenWallet = null;

  let govUser1TokenBalance = 50.0;
  let govUser2TokenBalance = 50.0;
  let treasuryMint = null;

  let treasuryMint2 = null;
  let govUser1TokenWallet2 = null;
  let govUser2TokenWallet2 = null;

  describe('Governance tests', () => {
    it('Prepairing users to funding treasury', async () => {
      treasuryMetadata = anchor.web3.Keypair.generate();

      // Create gov token
      treasuryMint = await Token.createMint(
        provider.connection,
        payer,
        mintAuthority.publicKey,
        null,
        0,
        TOKEN_PROGRAM_ID
      );

      // Create another token for gov
      treasuryMint2 = await Token.createMint(
        provider.connection,
        payer,
        mintAuthority.publicKey,
        null,
        0,
        TOKEN_PROGRAM_ID
      );

      govUser1TokenWallet = await treasuryMint.createAccount(govUser1Auth.publicKey);
      await treasuryMint.mintTo(
        govUser1TokenWallet,
        mintAuthority,
        [],
        ui_amount_to_amount(govUser1TokenBalance, 9)
      );

      govUser2TokenWallet = await treasuryMint.createAccount(govUser2Auth.publicKey);
      await treasuryMint.mintTo(
        govUser2TokenWallet,
        mintAuthority,
        [],
        ui_amount_to_amount(govUser2TokenBalance, 9)
      );

      govUser1TokenWallet2 = await treasuryMint2.createAccount(govUser1Auth.publicKey);
      await treasuryMint2.mintTo(
        govUser1TokenWallet2,
        mintAuthority,
        [],
        ui_amount_to_amount(govUser1TokenBalance, 9)
      );

      govUser2TokenWallet2 = await treasuryMint2.createAccount(govUser2Auth.publicKey);
      await treasuryMint2.mintTo(
        govUser2TokenWallet2,
        mintAuthority,
        [],
        ui_amount_to_amount(govUser2TokenBalance, 9)
      );
    });

    const govProgram = anchor.workspace.Governance;
    let governanceAccount = null;
    let treasuryOwnerPK = null;
    let sponsors = null;

    const approvalFixedPeriodInSeconds = 15;
    const minApprovalPercent = 51;
    const minStakeToPropose = 1_000_000_000;
    const minVoteParticipationPercent = 50;

    const maxProposalPaymentPercent = 50;
    const paymentInPeriodLimitPercent = 50;
    const paymentPeriodSec = 15;

    it('Initialize governance', async () => {
      governanceAccount = anchor.web3.Keypair.generate();

      let pda = await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from(TREASURY_PREFIX),
          govProgram.programId.toBuffer(),
          governanceAccount.publicKey.toBuffer()
        ],
        govProgram.programId
      );
      treasuryOwnerPK = pda[0];
      let treasuryOwnerBump = pda[1];

      // BadCase: not enough sponsors
      sponsors = [
        user1Authority.publicKey,
        user2Authority.publicKey,
      ];
      await assert.rejects(
        async () => {
          await govProgram.rpc.initializeGovernance(
            stakingAccount.publicKey,
            new anchor.BN(approvalFixedPeriodInSeconds),
            minApprovalPercent,
            new anchor.BN(minStakeToPropose),
            minVoteParticipationPercent,
            new anchor.BN(paymentPeriodSec),
            treasuryOwnerBump,
            sponsors,
            {
              accounts: {
                governance: governanceAccount.publicKey,
                payer: payer.publicKey,
                treasuryOwner: treasuryOwnerPK,
                systemProgram: anchor.web3.SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
              },
              signers: [governanceAccount]
            }
          );
        },
        (err) => {
          assert.equal(err.code, 308);
          assert.equal(err.msg, "Not enough sponsors");
          return true;
        }
      );

      // BadCase: too much sponsors (17)
      sponsors = [
        user1Authority.publicKey, user2Authority.publicKey, user1Authority.publicKey,
        user2Authority.publicKey, user1Authority.publicKey, user2Authority.publicKey,
        user1Authority.publicKey, user2Authority.publicKey, user1Authority.publicKey,
        user2Authority.publicKey, user1Authority.publicKey, user2Authority.publicKey,
        user1Authority.publicKey, user2Authority.publicKey, user1Authority.publicKey,
        user2Authority.publicKey, user2Authority.publicKey,
      ];
      await assert.rejects(
        async () => {
          await govProgram.rpc.initializeGovernance(
            stakingAccount.publicKey,
            new anchor.BN(approvalFixedPeriodInSeconds),
            minApprovalPercent,
            new anchor.BN(minStakeToPropose),
            minVoteParticipationPercent,
            new anchor.BN(paymentPeriodSec),
            treasuryOwnerBump,
            sponsors,
            {
              accounts: {
                governance: governanceAccount.publicKey,
                payer: payer.publicKey,
                treasuryOwner: treasuryOwnerPK,
                systemProgram: anchor.web3.SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
              },
              signers: [governanceAccount]
            }
          );
        },
        (err) => {
          assert.equal(err.code, 309);
          assert.equal(err.msg, "Sponsors limit exceeded");
          return true;
        }
      );

      sponsors = [
        user1Authority.publicKey,
        user2Authority.publicKey,
        user3Authority.publicKey,
      ];
      await govProgram.rpc.initializeGovernance(
        stakingAccount.publicKey,
        new anchor.BN(approvalFixedPeriodInSeconds),
        minApprovalPercent,
        new anchor.BN(minStakeToPropose),
        minVoteParticipationPercent,
        new anchor.BN(paymentPeriodSec),
        treasuryOwnerBump,
        sponsors,
        {
          accounts: {
            governance: governanceAccount.publicKey,
            payer: payer.publicKey,
            treasuryOwner: treasuryOwnerPK,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [governanceAccount]
        }
      );

      // check data
      let checkGovData = await govProgram.account.governance.fetch(governanceAccount.publicKey);
      assert.ok(checkGovData.stakingData.equals(stakingAccount.publicKey));
      assert.equal(checkGovData.approvalFixedPeriodInSeconds, approvalFixedPeriodInSeconds);
      assert.equal(checkGovData.minApprovalPercent, minApprovalPercent);
      assert.equal(checkGovData.treasuryOwnerBump, treasuryOwnerBump);
      assert.equal(checkGovData.minStakeToPropose, minStakeToPropose);
      assert.equal(checkGovData.minVoteParticipationPercent, minVoteParticipationPercent);
      assert.deepStrictEqual(checkGovData.sponsors, sponsors);
      assert.equal(checkGovData.paymentPeriodSec, paymentPeriodSec);
    });

    it('Changing sponsors list test', async () => {
      let newSponsor1 = anchor.web3.Keypair.generate();
      let newSponsor2 = anchor.web3.Keypair.generate();

      // BadCase: not enough signers
      await assert.rejects(
        async () => {
          await govProgram.rpc.addSponsor(
            newSponsor1.publicKey,
            {
              accounts: {
                governance: governanceAccount.publicKey,
              },
              remainingAccounts: [
                {
                  pubkey: user1Authority.publicKey,
                  isSigner: true,
                  isWritable: false,
                },
              ],
              signers: [user1Authority],
            }
          );
        },
        (err) => {
          assert.equal(err.code, 311);
          assert.equal(err.msg, "Not enough signers to change sponsors list");
          return true;
        }
      );

      // BadCase: duplicates in signers list
      await assert.rejects(
        async () => {
          await govProgram.rpc.addSponsor(
            newSponsor1.publicKey,
            {
              accounts: {
                governance: governanceAccount.publicKey,
              },
              remainingAccounts: [
                {
                  pubkey: user1Authority.publicKey,
                  isSigner: true,
                  isWritable: false,
                },
                {
                  pubkey: user1Authority.publicKey,
                  isSigner: true,
                  isWritable: false,
                },
              ],
              signers: [user1Authority, user1Authority],
            }
          );
        },
        (err) => {
          assert.equal(err.code, 311);
          assert.equal(err.msg, "Not enough signers to change sponsors list");
          return true;
        }
      );

      await govProgram.rpc.addSponsor(
        newSponsor1.publicKey,
        {
          accounts: {
            governance: governanceAccount.publicKey,
          },
          remainingAccounts: [
            {
              pubkey: user1Authority.publicKey,
              isSigner: true,
              isWritable: false,
            },
            {
              pubkey: user2Authority.publicKey,
              isSigner: true,
              isWritable: false,
            },
          ],
          signers: [user1Authority, user2Authority],
        }
      );

      sponsors = [user1Authority.publicKey, user2Authority.publicKey, user3Authority.publicKey, newSponsor1.publicKey];
      checkGovData = await govProgram.account.governance.fetch(governanceAccount.publicKey);
      assert.equal(checkGovData.sponsors.length, 4);
      assert.deepStrictEqual(checkGovData.sponsors, sponsors);

      // BadCase: sponsor already in list
      await assert.rejects(
        async () => {
          await govProgram.rpc.addSponsor(
            newSponsor1.publicKey,
            {
              accounts: {
                governance: governanceAccount.publicKey,
              },
              remainingAccounts: [
                {
                  pubkey: user1Authority.publicKey,
                  isSigner: true,
                  isWritable: false,
                },
                {
                  pubkey: user2Authority.publicKey,
                  isSigner: true,
                  isWritable: false,
                },
                {
                  pubkey: newSponsor1.publicKey,
                  isSigner: true,
                  isWritable: false,
                },
              ],
              signers: [user1Authority, user2Authority, newSponsor1],
            }
          );
        },
        (err) => {
          assert.equal(err.code, 312);
          assert.equal(err.msg, "Sponsor is already in list");
          return true;
        }
      );

      await govProgram.rpc.addSponsor(
        newSponsor2.publicKey,
        {
          accounts: {
            governance: governanceAccount.publicKey,
          },
          remainingAccounts: [
            {
              pubkey: user1Authority.publicKey,
              isSigner: true,
              isWritable: false,
            },
            {
              pubkey: user2Authority.publicKey,
              isSigner: true,
              isWritable: false,
            },
            {
              pubkey: newSponsor1.publicKey,
              isSigner: true,
              isWritable: false,
            },
          ],
          signers: [user1Authority, user2Authority, newSponsor1],
        }
      );

      sponsors = [user1Authority.publicKey, user2Authority.publicKey, user3Authority.publicKey, newSponsor1.publicKey, newSponsor2.publicKey];
      checkGovData = await govProgram.account.governance.fetch(governanceAccount.publicKey);
      assert.equal(checkGovData.sponsors.length, 5);
      assert.deepStrictEqual(checkGovData.sponsors, sponsors);

      // BadCase: There is such sponsor in list
      await assert.rejects(
        async () => {
          let fakeSponsor = anchor.web3.Keypair.generate();
          await govProgram.rpc.removeSponsor(
            fakeSponsor.publicKey,
            {
              accounts: {
                governance: governanceAccount.publicKey,
              },
              remainingAccounts: [
                {
                  pubkey: user1Authority.publicKey,
                  isSigner: true,
                  isWritable: false,
                },
                {
                  pubkey: user2Authority.publicKey,
                  isSigner: true,
                  isWritable: false,
                },
                {
                  pubkey: newSponsor1.publicKey,
                  isSigner: true,
                  isWritable: false,
                },
              ],
              signers: [user1Authority, user2Authority, newSponsor1],
            }
          );
        },
        (err) => {
          assert.equal(err.code, 313);
          assert.equal(err.msg, "Sponsor is already not in list");
          return true;
        }
      );

      // Remove newSponsor2 from list
      await govProgram.rpc.removeSponsor(
        newSponsor2.publicKey,
        {
          accounts: {
            governance: governanceAccount.publicKey,
          },
          remainingAccounts: [
            {
              pubkey: user1Authority.publicKey,
              isSigner: true,
              isWritable: false,
            },
            {
              pubkey: user2Authority.publicKey,
              isSigner: true,
              isWritable: false,
            },
            {
              pubkey: newSponsor1.publicKey,
              isSigner: true,
              isWritable: false,
            },
          ],
          signers: [user1Authority, user2Authority, newSponsor1],
        }
      );

      sponsors = [user1Authority.publicKey, user2Authority.publicKey, user3Authority.publicKey, newSponsor1.publicKey];
      checkGovData = await govProgram.account.governance.fetch(governanceAccount.publicKey);
      assert.equal(checkGovData.sponsors.length, 4);
      assert.deepStrictEqual(checkGovData.sponsors, sponsors);

      // BadCase: not enough signers
      await assert.rejects(
        async () => {
          await govProgram.rpc.removeSponsor(
            newSponsor1.publicKey,
            {
              accounts: {
                governance: governanceAccount.publicKey,
              },
              remainingAccounts: [
                {
                  pubkey: user1Authority.publicKey,
                  isSigner: true,
                  isWritable: false,
                },
                {
                  pubkey: user2Authority.publicKey,
                  isSigner: true,
                  isWritable: false,
                },
              ],
              signers: [user1Authority, user2Authority],
            }
          );
        },
        (err) => {
          assert.equal(err.code, 311);
          assert.equal(err.msg, "Not enough signers to change sponsors list");
          return true;
        }
      );

      // BadCase: not enough signers (0)
      await assert.rejects(
        async () => {
          await govProgram.rpc.removeSponsor(
            newSponsor1.publicKey,
            {
              accounts: {
                governance: governanceAccount.publicKey,
              },
              remainingAccounts: [],
              signers: [],
            }
          );
        },
        (err) => {
          assert.equal(err.code, 311);
          assert.equal(err.msg, "Not enough signers to change sponsors list");
          return true;
        }
      );

      // BadCase: duplicate signers
      await assert.rejects(
        async () => {
          await govProgram.rpc.removeSponsor(
            newSponsor1.publicKey,
            {
              accounts: {
                governance: governanceAccount.publicKey,
              },
              remainingAccounts: [
                {
                  pubkey: user1Authority.publicKey,
                  isSigner: true,
                  isWritable: false,
                },
                {
                  pubkey: user2Authority.publicKey,
                  isSigner: true,
                  isWritable: false,
                },
                {
                  pubkey: user2Authority.publicKey,
                  isSigner: true,
                  isWritable: false,
                },
              ],
              signers: [user1Authority, user2Authority, user2Authority],
            }
          );
        },
        (err) => {
          assert.equal(err.code, 311);
          assert.equal(err.msg, "Not enough signers to change sponsors list");
          return true;
        }
      );

      // Remove newSponsor1 from list
      await govProgram.rpc.removeSponsor(
        newSponsor1.publicKey,
        {
          accounts: {
            governance: governanceAccount.publicKey,
          },
          remainingAccounts: [
            {
              pubkey: user1Authority.publicKey,
              isSigner: true,
              isWritable: false,
            },
            {
              pubkey: user2Authority.publicKey,
              isSigner: true,
              isWritable: false,
            },
            {
              pubkey: user3Authority.publicKey,
              isSigner: true,
              isWritable: false,
            },
          ],
          signers: [user1Authority, user2Authority, user3Authority],
        }
      );

      sponsors = [user1Authority.publicKey, user2Authority.publicKey, user3Authority.publicKey];
      checkGovData = await govProgram.account.governance.fetch(governanceAccount.publicKey);
      assert.equal(checkGovData.sponsors.length, 3);
      assert.deepStrictEqual(checkGovData.sponsors, sponsors);

      // BadCase: less than 3 sponsors
      await assert.rejects(
        async () => {
          await govProgram.rpc.removeSponsor(
            user3Authority.publicKey,
            {
              accounts: {
                governance: governanceAccount.publicKey,
              },
              remainingAccounts: [
                {
                  pubkey: user1Authority.publicKey,
                  isSigner: true,
                  isWritable: false,
                },
                {
                  pubkey: user2Authority.publicKey,
                  isSigner: true,
                  isWritable: false,
                },
              ],
              signers: [user1Authority, user2Authority],
            }
          );
        },
        (err) => {
          assert.equal(err.code, 309);
          assert.equal(err.msg, "Sponsors limit exceeded");
          return true;
        }
      );
    });

    it('Sponsors limit list test', async () => {
      let governanceAccount2 = anchor.web3.Keypair.generate();
      let pda = await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from(TREASURY_PREFIX),
          govProgram.programId.toBuffer(),
          governanceAccount2.publicKey.toBuffer()
        ],
        govProgram.programId
      );
      treasuryOwnerPK2 = pda[0];
      treasuryOwnerBump2 = pda[1];
      treasuryPK2 = await treasuryMint.createAccount(treasuryOwnerPK2);

      sponsors = [
        anchor.web3.Keypair.generate(), anchor.web3.Keypair.generate(), anchor.web3.Keypair.generate(),
        anchor.web3.Keypair.generate(), anchor.web3.Keypair.generate(), anchor.web3.Keypair.generate(),
        anchor.web3.Keypair.generate(), anchor.web3.Keypair.generate(), anchor.web3.Keypair.generate(),
        anchor.web3.Keypair.generate(), anchor.web3.Keypair.generate(), anchor.web3.Keypair.generate(),
        anchor.web3.Keypair.generate(), anchor.web3.Keypair.generate(), anchor.web3.Keypair.generate(),
      ];
      sponsorsPubkeys = [];
      for (i = 0; i < sponsors.length; i++) {
        sponsorsPubkeys.push(sponsors[i].publicKey);
      }
      await govProgram.rpc.initializeGovernance(
        stakingAccount.publicKey,
        new anchor.BN(approvalFixedPeriodInSeconds),
        minApprovalPercent,
        new anchor.BN(minStakeToPropose),
        minVoteParticipationPercent,
        new anchor.BN(paymentPeriodSec),
        treasuryOwnerBump2,
        sponsorsPubkeys,
        {
          accounts: {
            governance: governanceAccount2.publicKey,
            payer: payer.publicKey,
            treasuryOwner: treasuryOwnerPK2,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [governanceAccount2]
        }
      );

      let remainingAccounts = [];
      let signers = [];
      for (i = 0; i < 10; i++) {
        remainingAccounts.push({ pubkey: sponsorsPubkeys[i], isSigner: true, isWritable: false });
        signers.push(sponsors[i]);
      }

      // Added the 16th sponsor
      newSponsor = anchor.web3.Keypair.generate();
      await govProgram.rpc.addSponsor(
        newSponsor.publicKey,
        {
          accounts: {
            governance: governanceAccount2.publicKey,
          },
          remainingAccounts: remainingAccounts,
          signers: signers,
        }
      );

      checkSponsors = sponsorsPubkeys;
      checkSponsors.push(newSponsor.publicKey);
      checkGovData = await govProgram.account.governance.fetch(governanceAccount2.publicKey);
      assert.equal(checkGovData.sponsors.length, 16);
      assert.deepStrictEqual(checkGovData.sponsors, checkSponsors);
    });

    let treasuryPK = null;
    let treasuryStatsPK = null;

    it('Initialize treasury stats test', async () => {
      treasuryPK = await treasuryMint.createAccount(treasuryOwnerPK);

      let pda = await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from(TREASURY_STATS_PREFIX),
          govProgram.programId.toBuffer(),
          governanceAccount.publicKey.toBuffer(),
          treasuryPK.toBuffer(),
        ],
        govProgram.programId
      );
      treasuryStatsPK = pda[0];
      let treasuryStatsPKBump = pda[1];

      await govProgram.rpc.initializeTreasuryStats(
        maxProposalPaymentPercent,
        paymentInPeriodLimitPercent,
        treasuryStatsPKBump,
        {
          accounts: {
            governance: governanceAccount.publicKey,
            treasuryStats: treasuryStatsPK,
            treasury: treasuryPK,
            treasuryOwner: treasuryOwnerPK,
            payer: payer.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          }
        }
      )

      let checkTreasuryStatsData = await govProgram.account.treasuryStats.fetch(treasuryStatsPK);
      assert.ok(checkTreasuryStatsData.treasury.equals(treasuryPK));
      assert.equal(checkTreasuryStatsData.maxProposalPaymentPercent, maxProposalPaymentPercent);
      assert.equal(checkTreasuryStatsData.paymentAmountInPeriodLimitPercent, paymentInPeriodLimitPercent);
      assert.equal(checkTreasuryStatsData.paymentAmountInPeriod, 0);
      assert.equal(checkTreasuryStatsData.highestBalance, 0);
    });

    let govUser1FundAmount = 14_000_000_000;

    it('Fund treasury test', async () => {
      let fundAmount = 1_000_000_001;
      await govProgram.rpc.fundTreasury(
        new anchor.BN(fundAmount),
        {
          accounts: {
            governance: governanceAccount.publicKey,
            userTokenWallet: govUser1TokenWallet,
            userTokenWalletOwner: govUser1Auth.publicKey,
            treasury: treasuryPK,
            treasuryMint: treasuryMint.publicKey,
            treasuryStats: treasuryStatsPK,
            treasuryOwner: treasuryOwnerPK,
            tokenProgram: TOKEN_PROGRAM_ID,
          },
          signers: [govUser1Auth]
        }
      );

      // Check data
      let checkTreasury = await treasuryMint.getAccountInfo(treasuryPK);
      assert.equal(checkTreasury.amount, fundAmount);
      let checkTreasuryStatsData = await govProgram.account.treasuryStats.fetch(treasuryStatsPK);
      assert.equal(checkTreasuryStatsData.highestBalance.toNumber(), fundAmount);

      // Check highest balance updating
      await govProgram.rpc.fundTreasury(
        new anchor.BN(govUser1FundAmount),
        {
          accounts: {
            governance: governanceAccount.publicKey,
            userTokenWallet: govUser1TokenWallet,
            userTokenWalletOwner: govUser1Auth.publicKey,
            treasury: treasuryPK,
            treasuryMint: treasuryMint.publicKey,
            treasuryStats: treasuryStatsPK,
            treasuryOwner: treasuryOwnerPK,
            tokenProgram: TOKEN_PROGRAM_ID,
          },
          signers: [govUser1Auth]
        }
      );

      // Check data
      checkTreasury = await treasuryMint.getAccountInfo(treasuryPK);
      assert.equal(checkTreasury.amount, govUser1FundAmount + fundAmount);
      checkTreasuryStatsData = await govProgram.account.treasuryStats.fetch(treasuryStatsPK);
      assert.equal(checkTreasuryStatsData.highestBalance.toNumber(), govUser1FundAmount + fundAmount);
      govUser1FundAmount = govUser1FundAmount + fundAmount;

      // TODO: funding another treasury
      // TODO: BadCase: treasury from another SPL Token??
    });

    let proposal1PK = null;
    let proposal1IpfsHash = 'zb2rhe143L6sgu2Nba4TZgFMdPidGMA6hmWhK9wLUoVGWYsR7';
    let proposal1Amount = 1_500_000_000;

    let proposal2PK = null;
    let proposal2IpfsHash = '11223344556677889900112233445566';
    let proposal2Amount = 2_500_000_000;

    let proposal3PK = null;
    let proposal3IpfsHash = '11223344556611223344556677889900';
    let proposal3Amount = 1_000_000_000;

    it('Make proposal test', async () => {
      let pda = await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from(PROPOSAL_PREFIX),
          govProgram.programId.toBuffer(),
          governanceAccount.publicKey.toBuffer(),
          Buffer.from(proposal1IpfsHash.slice(0, 32)),
        ],
        govProgram.programId
      );
      proposal1PK = pda[0];
      let proposal1Bump = pda[1];

      pda = await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from(PROPOSAL_PREFIX),
          govProgram.programId.toBuffer(),
          governanceAccount.publicKey.toBuffer(),
          Buffer.from(proposal2IpfsHash.slice(0, 32)),
        ],
        govProgram.programId
      );
      proposal2PK = pda[0];
      let proposal2Bump = pda[1];

      pda = await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from(PROPOSAL_PREFIX),
          govProgram.programId.toBuffer(),
          governanceAccount.publicKey.toBuffer(),
          Buffer.from(proposal3IpfsHash.slice(0, 32)),
        ],
        govProgram.programId
      );
      proposal3PK = pda[0];
      let proposal3Bump = pda[1];

      // User1 stake additional tokens to make proposal
      let user1AdditionalAmount = 500_000_000;
      await stakingProgram.rpc.stake(
        new anchor.BN(user1AdditionalAmount),
        {
          accounts: {
            stakingUserData: user1StakingData.publicKey,
            userTokenWallet: user1TokenWalletPK,
            userTokenWalletOwner: user1Authority.publicKey,
            stakingData: stakingAccount.publicKey,
            holdingWallet: holdingWalletPK,
            stakingTokenMetadata: metadataAccount.publicKey,
            mint: mint.publicKey,
            mintAuthority: pdaMintAuthority,
            tokenProgram: TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [user1Authority]
        }
      );

      // BadCase: min stake amount check
      await assert.rejects(
        async () => {
          await govProgram.rpc.makeProposal(
            new anchor.BN(proposal1Amount),
            proposal1Bump,
            proposal1IpfsHash,
            {
              accounts: {
                governance: governanceAccount.publicKey,
                treasury: treasuryPK,
                treasuryStats: treasuryStatsPK,
                stakingUserData: user1StakingData.publicKey,
                userTokenWallet: user1TokenWalletPK,
                userTokenWalletOwner: user1Authority.publicKey,
                proposal: proposal1PK,
                recipient: govUser2TokenWallet,
                payer: payer.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
              },
              signers: [user1Authority]
            }
          );
        },
        (err) => {
          assert.equal(err.code, 305);
          assert.equal(err.msg, "There is not enough staked tokens to make proposal");
          return true;
        }
      );

      // BadCase: too big payment amount (more than treasury amount)
      await assert.rejects(
        async () => {
          let amount = govUser1FundAmount + 1;
          await govProgram.rpc.makeProposal(
            new anchor.BN(amount),
            proposal1Bump,
            proposal1IpfsHash,
            {
              accounts: {
                governance: governanceAccount.publicKey,
                treasury: treasuryPK,
                treasuryStats: treasuryStatsPK,
                stakingUserData: user2StakingData.publicKey,
                userTokenWallet: user2TokenWalletPK,
                userTokenWalletOwner: user2Authority.publicKey,
                proposal: proposal1PK,
                recipient: govUser1TokenWallet,
                payer: payer.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
              },
              signers: [user2Authority]
            }
          );
        },
        (err) => {
          assert.equal(err.code, 302);
          assert.equal(err.msg, "Governance treasury insufficient funds");
          return true;
        }
      );

      // BadCase: too big payment amount (max payment amount limit)
      await assert.rejects(
        async () => {
          treasuryStatsData = await govProgram.account.treasuryStats.fetch(treasuryStatsPK);
          let maxProposalPaymentAmount = treasuryStatsData.highestBalance * (maxProposalPaymentPercent / 100.0);
          let amount = maxProposalPaymentAmount + 1;
          await govProgram.rpc.makeProposal(
            new anchor.BN(amount),
            proposal1Bump,
            proposal1IpfsHash,
            {
              accounts: {
                governance: governanceAccount.publicKey,
                treasury: treasuryPK,
                treasuryStats: treasuryStatsPK,
                stakingUserData: user2StakingData.publicKey,
                userTokenWallet: user2TokenWalletPK,
                userTokenWalletOwner: user2Authority.publicKey,
                proposal: proposal1PK,
                recipient: govUser1TokenWallet,
                payer: payer.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
              },
              signers: [user2Authority]
            }
          );
        },
        (err) => {
          assert.equal(err.code, 306);
          assert.equal(err.msg, "Max proposal payment amount limit exceeded");
          return true;
        }
      );

      // staking user2 making proposal
      await govProgram.rpc.makeProposal(
        new anchor.BN(proposal1Amount),
        proposal1Bump,
        proposal1IpfsHash,
        {
          accounts: {
            governance: governanceAccount.publicKey,
            treasury: treasuryPK,
            treasuryStats: treasuryStatsPK,
            stakingUserData: user2StakingData.publicKey,
            userTokenWallet: user2TokenWalletPK,
            userTokenWalletOwner: user2Authority.publicKey,
            proposal: proposal1PK,
            recipient: govUser1TokenWallet,
            payer: payer.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [user2Authority]
        }
      );

      // Check data
      treasuryStatsData = await govProgram.account.treasuryStats.fetch(treasuryStatsPK);
      assert.equal(treasuryStatsData.paymentAmountInPeriod.toNumber(), proposal1Amount);
      let checkProposalData = await govProgram.account.proposal.fetch(proposal1PK);
      assert.ok(checkProposalData.governance.equals(governanceAccount.publicKey));
      assert.ok(checkProposalData.recipient.equals(govUser1TokenWallet));
      assert.equal(checkProposalData.paymentAmount, proposal1Amount);
      assert.equal(checkProposalData.ipfsHash, proposal1IpfsHash);
      assert.equal(checkProposalData.prosWeight, 0);
      assert.equal(checkProposalData.consWeight, 0);
      assert.equal(checkProposalData.isClosed, false);
      assert.equal(checkProposalData.isSponsored, false);

      // Staking user2 making another proposal (proposal2)
      await govProgram.rpc.makeProposal(
        new anchor.BN(proposal2Amount),
        proposal2Bump,
        proposal2IpfsHash,
        {
          accounts: {
            governance: governanceAccount.publicKey,
            treasury: treasuryPK,
            treasuryStats: treasuryStatsPK,
            stakingUserData: user2StakingData.publicKey,
            userTokenWallet: user2TokenWalletPK,
            userTokenWalletOwner: user2Authority.publicKey,
            proposal: proposal2PK,
            recipient: govUser1TokenWallet,
            payer: payer.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [user2Authority]
        }
      );

      // Check data
      treasuryStatsData = await govProgram.account.treasuryStats.fetch(treasuryStatsPK);
      assert.equal(treasuryStatsData.paymentAmountInPeriod.toNumber(), proposal1Amount + proposal2Amount);
      checkProposalData = await govProgram.account.proposal.fetch(proposal2PK);
      assert.ok(checkProposalData.governance.equals(governanceAccount.publicKey));
      assert.ok(checkProposalData.recipient.equals(govUser1TokenWallet));
      assert.equal(checkProposalData.paymentAmount, proposal2Amount);
      assert.equal(checkProposalData.ipfsHash, proposal2IpfsHash);
      assert.equal(checkProposalData.prosWeight, 0);
      assert.equal(checkProposalData.consWeight, 0);
      assert.equal(checkProposalData.isClosed, false);
      assert.equal(checkProposalData.isSponsored, false);

      // BadCase: payment limit in period exceeded
      await assert.rejects(
        async () => {
          treasuryStatsData = await govProgram.account.treasuryStats.fetch(treasuryStatsPK);
          let paymentInPeriodLimit = treasuryStatsData.highestBalance * (paymentInPeriodLimitPercent / 100.0);
          let amount = paymentInPeriodLimit - (proposal1Amount + proposal2Amount) + 1;
          await govProgram.rpc.makeProposal(
            new anchor.BN(amount),
            proposal3Bump,
            proposal3IpfsHash,
            {
              accounts: {
                governance: governanceAccount.publicKey,
                treasury: treasuryPK,
                treasuryStats: treasuryStatsPK,
                stakingUserData: user2StakingData.publicKey,
                userTokenWallet: user2TokenWalletPK,
                userTokenWalletOwner: user2Authority.publicKey,
                proposal: proposal3PK,
                recipient: govUser1TokenWallet,
                payer: payer.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
              },
              signers: [user2Authority]
            }
          );
        },
        (err) => {
          assert.equal(err.code, 310);
          assert.equal(err.msg, "This proposal exceeds the maximum amount that can be paid this period");
          return true;
        }
      );

      // Staking user2 making another proposal (proposal3)
      await govProgram.rpc.makeProposal(
        new anchor.BN(proposal3Amount),
        proposal3Bump,
        proposal3IpfsHash,
        {
          accounts: {
            governance: governanceAccount.publicKey,
            treasury: treasuryPK,
            treasuryStats: treasuryStatsPK,
            stakingUserData: user2StakingData.publicKey,
            userTokenWallet: user2TokenWalletPK,
            userTokenWalletOwner: user2Authority.publicKey,
            proposal: proposal3PK,
            recipient: govUser1TokenWallet,
            payer: payer.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [user2Authority]
        }
      );

      // Check data
      treasuryStatsData = await govProgram.account.treasuryStats.fetch(treasuryStatsPK);
      assert.equal(treasuryStatsData.paymentAmountInPeriod.toNumber(), proposal1Amount + proposal2Amount + proposal3Amount);
      checkProposalData = await govProgram.account.proposal.fetch(proposal3PK);
      assert.ok(checkProposalData.governance.equals(governanceAccount.publicKey));
      assert.ok(checkProposalData.recipient.equals(govUser1TokenWallet));
      assert.equal(checkProposalData.paymentAmount, proposal3Amount);
      assert.equal(checkProposalData.ipfsHash, proposal3IpfsHash);
      assert.equal(checkProposalData.prosWeight, 0);
      assert.equal(checkProposalData.consWeight, 0);
      assert.equal(checkProposalData.isClosed, false);
      assert.equal(checkProposalData.isSponsored, false);
    });

    it('Approve proposal test', async () => {
      // User1 stake additional tokens for voting
      let user1AdditionalAmount = 5_000_000_000;
      let user1StakeAmount = user1AdditionalAmount + 500_000_000;
      await stakingProgram.rpc.stake(
        new anchor.BN(user1AdditionalAmount),
        {
          accounts: {
            stakingUserData: user1StakingData.publicKey,
            userTokenWallet: user1TokenWalletPK,
            userTokenWalletOwner: user1Authority.publicKey,
            stakingData: stakingAccount.publicKey,
            holdingWallet: holdingWalletPK,
            stakingTokenMetadata: metadataAccount.publicKey,
            mint: mint.publicKey,
            mintAuthority: pdaMintAuthority,
            tokenProgram: TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [user1Authority]
        }
      );

      // User4 stake additional tokens for voting
      let user4StakeAmount = 10_000_000_000
      await stakingProgram.rpc.stake(
        new anchor.BN(user4StakeAmount),
        {
          accounts: {
            stakingUserData: user4StakingData.publicKey,
            userTokenWallet: user4TokenWalletPK,
            userTokenWalletOwner: user4Authority.publicKey,
            stakingData: stakingAccount.publicKey,
            holdingWallet: holdingWalletPK,
            stakingTokenMetadata: metadataAccount.publicKey,
            mint: mint.publicKey,
            mintAuthority: pdaMintAuthority,
            tokenProgram: TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [user4Authority]
        }
      );

      let pda = await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from(VOTE_MARKER_PREFIX),
          governanceAccount.publicKey.toBuffer(),
          proposal1PK.toBuffer(),
          user1StakingData.publicKey.toBuffer(),
        ],
        govProgram.programId
      );
      let voteMarkerPK = pda[0];
      let voteMarkerBump = pda[1];

      // User1 vote for proposal1
      await govProgram.rpc.approveProposal(
        true,
        voteMarkerBump,
        {
          accounts: {
            governance: governanceAccount.publicKey,
            stakingUserData: user1StakingData.publicKey,
            userTokenWallet: user1TokenWalletPK,
            userTokenWalletOwner: user1Authority.publicKey,
            stakingData: stakingAccount.publicKey,
            proposal: proposal1PK,
            voteMarker: voteMarkerPK,
            payer: payer.publicKey,
            stakingProgram: stakingProgram.programId,
            systemProgram: anchor.web3.SystemProgram.programId,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [user1Authority],
        }
      );

      // BadCase: user1 vote for proposal1 again
      await assert.rejects(
        async () => {
          await govProgram.rpc.approveProposal(
            true,
            voteMarkerBump,
            {
              accounts: {
                governance: governanceAccount.publicKey,
                stakingUserData: user1StakingData.publicKey,
                userTokenWallet: user1TokenWalletPK,
                userTokenWalletOwner: user1Authority.publicKey,
                stakingData: stakingAccount.publicKey,
                proposal: proposal1PK,
                voteMarker: voteMarkerPK,
                payer: payer.publicKey,
                stakingProgram: stakingProgram.programId,
                systemProgram: anchor.web3.SystemProgram.programId,
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
              },
              signers: [user1Authority],
            }
          );
        },
        (err) => {
          return true;
        }
      );

      let checkProposalData = await govProgram.account.proposal.fetch(proposal1PK);
      assert.equal(checkProposalData.isClosed, false);
      assert.equal(checkProposalData.prosWeight, user1StakeAmount);
      assert.equal(checkProposalData.consWeight, 0);
      let checkUser1StakingData = await stakingProgram.account.stakingUserData.fetch(user1StakingData.publicKey);
      assert.equal(checkUser1StakingData.lockedAmount, user1StakeAmount);
      let lockedUntil = checkUser1StakingData.lockedUntil;

      // BadCase: User1 tries to unlock his amount by time
      await assert.rejects(
        async () => {
          await stakingProgram.rpc.lockAmount(
            new anchor.BN(currentTimestamp),
            new anchor.BN(user1StakeAmount),
            {
              accounts: {
                stakingData: stakingAccount.publicKey,
                stakingUserData: user1StakingData.publicKey,
                userTokenWallet: user1TokenWalletPK,
                userTokenWalletOwner: user1Authority.publicKey,
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
              },
              signers: [user1Authority],
            }
          );
        },
        (err) => {
          assert.equal(err.code, 0x130);
          assert.equal(err.msg, "Trying to unlock amount");
          return true;
        }
      );

      // User1 tries to unlock his amount
      await stakingProgram.rpc.lockAmount(
        new anchor.BN(lockedUntil),
        new anchor.BN(user1StakeAmount - 100),
        {
          accounts: {
            stakingData: stakingAccount.publicKey,
            stakingUserData: user1StakingData.publicKey,
            userTokenWallet: user1TokenWalletPK,
            userTokenWalletOwner: user1Authority.publicKey,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [user1Authority],
        }
      );

      // Locked amount not changed
      checkUser1StakingData = await stakingProgram.account.stakingUserData.fetch(user1StakingData.publicKey);
      assert.equal(checkUser1StakingData.lockedUntil.toNumber(), lockedUntil);
      assert.equal(checkUser1StakingData.lockedAmount.toNumber(), user1StakeAmount);

      // User2 vote for proposal1
      pda = await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from(VOTE_MARKER_PREFIX),
          governanceAccount.publicKey.toBuffer(),
          proposal1PK.toBuffer(),
          user2StakingData.publicKey.toBuffer(),
        ],
        govProgram.programId
      );
      voteMarkerPK = pda[0];
      voteMarkerBump = pda[1];

      await govProgram.rpc.approveProposal(
        false,
        voteMarkerBump,
        {
          accounts: {
            governance: governanceAccount.publicKey,
            stakingUserData: user2StakingData.publicKey,
            userTokenWallet: user2TokenWalletPK,
            userTokenWalletOwner: user2Authority.publicKey,
            stakingData: stakingAccount.publicKey,
            proposal: proposal1PK,
            voteMarker: voteMarkerPK,
            payer: payer.publicKey,
            stakingProgram: stakingProgram.programId,
            systemProgram: anchor.web3.SystemProgram.programId,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [user2Authority]
        }
      );

      checkProposalData = await govProgram.account.proposal.fetch(proposal1PK);
      let checkUser2StakingData = await stakingProgram.account.stakingUserData.fetch(user2StakingData.publicKey);
      assert.equal(checkProposalData.isClosed, false);
      assert.equal(checkProposalData.prosWeight, user1StakeAmount);
      assert.deepStrictEqual(checkProposalData.consWeight, checkUser2StakingData.lockedAmount);
      assert.deepStrictEqual(checkUser2StakingData.lockedAmount, checkUser2StakingData.ownershipShare);

      // User2 vote for proposal2
      pda = await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from(VOTE_MARKER_PREFIX),
          governanceAccount.publicKey.toBuffer(),
          proposal2PK.toBuffer(),
          user2StakingData.publicKey.toBuffer(),
        ],
        govProgram.programId
      );
      voteMarkerPK = pda[0];
      voteMarkerBump = pda[1];

      await govProgram.rpc.approveProposal(
        true,
        voteMarkerBump,
        {
          accounts: {
            governance: governanceAccount.publicKey,
            stakingUserData: user2StakingData.publicKey,
            userTokenWallet: user2TokenWalletPK,
            userTokenWalletOwner: user2Authority.publicKey,
            stakingData: stakingAccount.publicKey,
            proposal: proposal2PK,
            voteMarker: voteMarkerPK,
            payer: payer.publicKey,
            stakingProgram: stakingProgram.programId,
            systemProgram: anchor.web3.SystemProgram.programId,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [user2Authority]
        }
      );

      checkProposalData = await govProgram.account.proposal.fetch(proposal2PK);
      checkUser2StakingData = await stakingProgram.account.stakingUserData.fetch(user2StakingData.publicKey);
      assert.equal(checkProposalData.isClosed, false);
      assert.deepStrictEqual(checkProposalData.prosWeight, checkUser2StakingData.lockedAmount);
      assert.equal(checkProposalData.consWeight.toNumber(), 0);
      assert.deepStrictEqual(checkUser2StakingData.lockedAmount, checkUser2StakingData.ownershipShare);

      // User4 vote for proposal3 (not sponsor)
      pda = await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from(VOTE_MARKER_PREFIX),
          governanceAccount.publicKey.toBuffer(),
          proposal3PK.toBuffer(),
          user4StakingData.publicKey.toBuffer(),
        ],
        govProgram.programId
      );
      voteMarkerPK = pda[0];
      voteMarkerBump = pda[1];

      await govProgram.rpc.approveProposal(
        true,
        voteMarkerBump,
        {
          accounts: {
            governance: governanceAccount.publicKey,
            stakingUserData: user4StakingData.publicKey,
            userTokenWallet: user4TokenWalletPK,
            userTokenWalletOwner: user4Authority.publicKey,
            stakingData: stakingAccount.publicKey,
            proposal: proposal3PK,
            voteMarker: voteMarkerPK,
            payer: payer.publicKey,
            stakingProgram: stakingProgram.programId,
            systemProgram: anchor.web3.SystemProgram.programId,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [user4Authority],
        }
      );
    });

    it('Finalize still in vote proposal test', async () => {
      // BadCase: the vote in progres
      await assert.rejects(
        async () => {
          await govProgram.rpc.finalizeProposal(
            {
              accounts: {
                governance: governanceAccount.publicKey,
                stakingData: stakingAccount.publicKey,
                proposal: proposal1PK,
                treasury: treasuryPK,
                treasuryOwner: treasuryOwnerPK,
                treasuryMint: treasuryMint.publicKey,
                recipient: govUser1TokenWallet,
                tokenProgram: TOKEN_PROGRAM_ID,
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
              },
            }
          );
        },
        (err) => {
          assert.equal(err.code, 0x130);
          assert.equal(err.msg, "The vote is in progress");
          return true;
        }
      );
    });

    it('Finalize proposal test', async () => {
      let sleep_ms = approvalFixedPeriodInSeconds * 1000;
      console.log("sleep for ms: ", sleep_ms);
      sleep(sleep_ms);

      checkStakingData = await stakingProgram.account.stakingData.fetch(stakingAccount.publicKey);
      console.log("Total staked: ", checkStakingData.totalStaked.toNumber());
      checkGovData = await govProgram.account.governance.fetch(governanceAccount.publicKey);
      console.log("minVoteParticipationPercent: ", checkGovData.minVoteParticipationPercent);
      console.log("minApprovalPercent: ", checkGovData.minApprovalPercent);

      checkProposalData = await govProgram.account.proposal.fetch(proposal1PK);
      console.log("Proposal 1:")
      console.log("prosWeight: ", checkProposalData.prosWeight.toNumber());
      console.log("consWeight: ", checkProposalData.consWeight.toNumber());
      console.log("isSponsored: ", checkProposalData.isSponsored);

      checkProposalData = await govProgram.account.proposal.fetch(proposal2PK);
      console.log("Proposal 2:")
      console.log("prosWeight: ", checkProposalData.prosWeight.toNumber());
      console.log("consWeight: ", checkProposalData.consWeight.toNumber());
      console.log("isSponsored: ", checkProposalData.isSponsored);

      checkProposalData = await govProgram.account.proposal.fetch(proposal3PK);
      console.log("Proposal 3:")
      console.log("prosWeight: ", checkProposalData.prosWeight.toNumber());
      console.log("consWeight: ", checkProposalData.consWeight.toNumber());
      console.log("isSponsored: ", checkProposalData.isSponsored);

      checkRecipient = await treasuryMint.getAccountInfo(checkProposalData.recipient);
      let recipient1BalanceBefore = checkRecipient.amount.toNumber();

      await govProgram.rpc.finalizeProposal(
        {
          accounts: {
            governance: governanceAccount.publicKey,
            stakingData: stakingAccount.publicKey,
            proposal: proposal1PK,
            treasury: treasuryPK,
            treasuryOwner: treasuryOwnerPK,
            treasuryMint: treasuryMint.publicKey,
            recipient: govUser1TokenWallet,
            tokenProgram: TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
        }
      );

      // BadCase: proposal already closed
      await assert.rejects(
        async () => {
          await govProgram.rpc.finalizeProposal(
            {
              accounts: {
                governance: governanceAccount.publicKey,
                stakingData: stakingAccount.publicKey,
                proposal: proposal1PK,
                treasury: treasuryPK,
                treasuryOwner: treasuryOwnerPK,
                treasuryMint: treasuryMint.publicKey,
                recipient: govUser1TokenWallet,
                tokenProgram: TOKEN_PROGRAM_ID,
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
              },
            }
          );
        },
        (err) => {
          assert.equal(err.code, 303);
          assert.equal(err.msg, "Proposal is already closed");
          return true;
        }
      );

      // Check approved proposal results
      checkProposalData = await govProgram.account.proposal.fetch(proposal1PK);
      assert.equal(checkProposalData.isClosed, true);
      checkTreasury = await treasuryMint.getAccountInfo(treasuryPK);
      assert.equal(checkTreasury.amount, govUser1FundAmount - checkProposalData.paymentAmount);
      checkRecipient = await treasuryMint.getAccountInfo(checkProposalData.recipient);
      assert.equal(checkRecipient.amount.toNumber(), recipient1BalanceBefore + checkProposalData.paymentAmount.toNumber());

      let treasuryBalanceBefore = checkTreasury.amount;

      // Proposal 2 min participation percent not reached
      checkRecipient = await treasuryMint.getAccountInfo(checkProposalData.recipient);
      let recipient2BalanceBefore = checkRecipient.amount.toNumber();
      await govProgram.rpc.finalizeProposal(
        {
          accounts: {
            governance: governanceAccount.publicKey,
            stakingData: stakingAccount.publicKey,
            proposal: proposal2PK,
            treasury: treasuryPK,
            treasuryOwner: treasuryOwnerPK,
            treasuryMint: treasuryMint.publicKey,
            recipient: govUser1TokenWallet,
            tokenProgram: TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
        }
      );

      // Check not approved proposal results
      checkProposalData = await govProgram.account.proposal.fetch(proposal2PK);
      assert.equal(checkProposalData.isClosed, true);
      checkTreasury = await treasuryMint.getAccountInfo(treasuryPK);
      assert.deepStrictEqual(checkTreasury.amount, treasuryBalanceBefore);
      checkRecipient = await treasuryMint.getAccountInfo(checkProposalData.recipient);
      assert.equal(checkRecipient.amount.toNumber(), recipient2BalanceBefore);

      // Finalize the proposal 3 (it is not sponsored)
      checkRecipient = await treasuryMint.getAccountInfo(checkProposalData.recipient);
      recipient2BalanceBefore = checkRecipient.amount.toNumber();
      await govProgram.rpc.finalizeProposal(
        {
          accounts: {
            governance: governanceAccount.publicKey,
            stakingData: stakingAccount.publicKey,
            proposal: proposal3PK,
            treasury: treasuryPK,
            treasuryOwner: treasuryOwnerPK,
            treasuryMint: treasuryMint.publicKey,
            recipient: govUser1TokenWallet,
            tokenProgram: TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
        }
      );

      // Check not approved proposal results
      checkProposalData = await govProgram.account.proposal.fetch(proposal3PK);
      assert.equal(checkProposalData.isClosed, true);
      checkTreasury = await treasuryMint.getAccountInfo(treasuryPK);
      assert.deepStrictEqual(checkTreasury.amount, treasuryBalanceBefore);
      checkRecipient = await treasuryMint.getAccountInfo(checkProposalData.recipient);
      assert.equal(checkRecipient.amount.toNumber(), recipient2BalanceBefore);
    });

    it('Unlock amounts test', async () => {
      await stakingProgram.rpc.stake(
        new anchor.BN(100_000_000),
        {
          accounts: {
            stakingUserData: user1StakingData.publicKey,
            userTokenWallet: user1TokenWalletPK,
            userTokenWalletOwner: user1Authority.publicKey,
            stakingData: stakingAccount.publicKey,
            holdingWallet: holdingWalletPK,
            stakingTokenMetadata: metadataAccount.publicKey,
            mint: mint.publicKey,
            mintAuthority: pdaMintAuthority,
            tokenProgram: TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [user1Authority]
        }
      );

      checkStakingUserData = await stakingProgram.account.stakingUserData.fetch(user1StakingData.publicKey);
      assert.equal(checkStakingUserData.lockedAmount.toNumber(), 0);
      assert.equal(checkStakingUserData.lockedUntil.toNumber(), 0);

      await stakingProgram.rpc.stake(
        new anchor.BN(100_000_000),
        {
          accounts: {
            stakingUserData: user2StakingData.publicKey,
            userTokenWallet: user2TokenWalletPK,
            userTokenWalletOwner: user2Authority.publicKey,
            stakingData: stakingAccount.publicKey,
            holdingWallet: holdingWalletPK,
            stakingTokenMetadata: metadataAccount.publicKey,
            mint: mint.publicKey,
            mintAuthority: pdaMintAuthority,
            tokenProgram: TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [user2Authority]
        }
      );

      checkStakingUserData = await stakingProgram.account.stakingUserData.fetch(user2StakingData.publicKey);
      assert.equal(checkStakingUserData.lockedAmount.toNumber(), 0);
      assert.equal(checkStakingUserData.lockedUntil.toNumber(), 0);

      await stakingProgram.rpc.stake(
        new anchor.BN(100_000_000),
        {
          accounts: {
            stakingUserData: user4StakingData.publicKey,
            userTokenWallet: user4TokenWalletPK,
            userTokenWalletOwner: user4Authority.publicKey,
            stakingData: stakingAccount.publicKey,
            holdingWallet: holdingWalletPK,
            stakingTokenMetadata: metadataAccount.publicKey,
            mint: mint.publicKey,
            mintAuthority: pdaMintAuthority,
            tokenProgram: TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [user4Authority]
        }
      );

      checkStakingUserData = await stakingProgram.account.stakingUserData.fetch(user4StakingData.publicKey);
      assert.equal(checkStakingUserData.lockedAmount.toNumber(), 0);
      assert.equal(checkStakingUserData.lockedUntil.toNumber(), 0);
    });

    it('Reset payment amount in period test', async () => {
      let proposal4IpfsHash = "00223344556611223344556677889911"
      pda = await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from(PROPOSAL_PREFIX),
          govProgram.programId.toBuffer(),
          governanceAccount.publicKey.toBuffer(),
          Buffer.from(proposal4IpfsHash.slice(0, 32)),
        ],
        govProgram.programId
      );
      let proposal4PK = pda[0];
      let proposal4Bump = pda[1];

      checkGovData = await govProgram.account.governance.fetch(governanceAccount.publicKey);
      let oldTimestamp = checkGovData.paymentPeriodStart.toNumber();

      let amount = 5_000_000_000;
      await govProgram.rpc.makeProposal(
        new anchor.BN(amount),
        proposal4Bump,
        proposal4IpfsHash,
        {
          accounts: {
            governance: governanceAccount.publicKey,
            treasury: treasuryPK,
            treasuryStats: treasuryStatsPK,
            stakingUserData: user2StakingData.publicKey,
            userTokenWallet: user2TokenWalletPK,
            userTokenWalletOwner: user2Authority.publicKey,
            proposal: proposal4PK,
            recipient: govUser1TokenWallet,
            payer: payer.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          },
          signers: [user2Authority]
        }
      );

      checkGovData = await govProgram.account.governance.fetch(governanceAccount.publicKey);
      assert.ok(checkGovData.paymentPeriodStart.toNumber() > oldTimestamp);
      treasuryStatsData = await govProgram.account.treasuryStats.fetch(treasuryStatsPK);
      assert.equal(treasuryStatsData.paymentAmountInPeriod.toNumber(), amount);
    });
  });
});
