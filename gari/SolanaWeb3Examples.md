## Setup

```
$ yarn add @project-serum/anchor @solana/spl-token @solana/web3.js bignumber.js
```

Add utils methods:

```js
import { BigNumber } from "bignumber.js";

export const getProvider = (): PhantomProvider | undefined => {
  if ("solana" in window) {
    const anyWindow: any = window;
    provider = anyWindow.solana;
    if (provider.isPhantom) {
      return provider;
    }
  }
  window.open("https://phantom.app/", "_blank");
};

const convertDecimals = (value: number | string, decimals = 9) => {
  return (new BigNumber(value)).dividedBy(new BigNumber(10).pow(decimals)).toString()
}

export const addLog = (message: string) => {
  console.log(message)
}
```

## Keypair generation

```js
import {
  Keypair
} from "@solana/web3.js";
const fromWallet = Keypair.generate();
```


## Airdrop SOL

```js
import {
  Connection, clusterApiUrl
} from "@solana/web3.js";
const connection = new Connection(
    clusterApiUrl('devnet'),
    'confirmed',
);
const fromAirdropSignature = await connection.requestAirdrop(
    fromWallet.publicKey,
    web3.LAMPORTS_PER_SOL,
  );
// Wait for airdrop confirmation
await connection.confirmTransaction(fromAirdropSignature);
```


## Balance SOL token

```js
export const getBalance = async (): Promise<string> => {
  const connection = new Connection(NETWORK);
  const provider = getProvider();
  if (!provider.publicKey) {
    return;
  }

  const balance = await connection.getBalance(provider.publicKey);
  return convertDecimals(balance);
}
```

## Balance checks for the GARI

```js
export const getBalanceToken = async (addressToken: string): Promise<string> => {
  const connection = new Connection(NETWORK);
  const provider = getProvider();
  if (!provider.publicKey) {
    return;
  }
  const { value: { amount, decimals} } = await connection.getTokenAccountBalance(new PublicKey(addressToken));
  return convertDecimals(amount, decimals);
}
```


## SOL token transfer signing

```js
export const createTransferTransaction = async () => {
  const provider = getProvider();
  const connection = new Connection(NETWORK);

  if (!provider.publicKey) {
    return;
  }
  let transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: provider.publicKey,
      toPubkey: provider.publicKey,
      lamports: 100,
    })
  );
  transaction.feePayer = provider.publicKey;
  addLog("Getting recent blockhash");
  const anyTransaction: any = transaction;
  anyTransaction.recentBlockhash = (
    await connection.getRecentBlockhash()
  ).blockhash;
  return transaction;
};

export const sendTransaction = async (getTransaction: () => {}) => {
  const connection = new Connection(NETWORK);

  const transaction = await getTransaction();
  if (transaction) {
    try {
      let signed = await provider.signTransaction(transaction);
      addLog("Got signature, submitting transaction");
      let signature = await connection.sendRawTransaction(signed.serialize());
      addLog(
        "Submitted transaction " + signature + ", awaiting confirmation"
      );
      await connection.confirmTransaction(signature);
      addLog("Transaction " + signature + " confirmed");
    } catch (err) {
      console.warn(err);
      addLog("Error: " + JSON.stringify(err));
    }
  }
};

await sendTransaction(createTransferTransaction);
```

## GARI token transfer signing

```js
import * as web3 from "@solana/web3.js";
import * as splToken from "@solana/spl-token";

// Address: 9vpsmXhZYMpvhCKiVoX5U8b1iKpfwJaFpPEEXF7hRm9N
const DEMO_WALLET_SECRET_KEY = new Uint8Array([
  37, 21, 197, 185, 105, 201, 212, 148, 164, 108, 251, 159, 174, 252, 43, 246,
  225, 156, 38, 203, 99, 42, 244, 73, 252, 143, 34, 239, 15, 222, 217, 91, 132,
  167, 105, 60, 17, 211, 120, 243, 197, 99, 113, 34, 76, 127, 190, 18, 91, 246,
  121, 93, 189, 55, 165, 129, 196, 104, 25, 157, 209, 168, 165, 149,
]);
(async () => {
  // Connect to cluster
  var connection = new web3.Connection(web3.clusterApiUrl("devnet"));
  // Construct wallet keypairs
  var fromWallet = web3.Keypair.fromSecretKey(DEMO_WALLET_SECRET_KEY);
  var toWallet = web3.Keypair.generate();
  // Construct my token class
  var myMint = new web3.PublicKey("My Mint Public Address");
  var myToken = new splToken.Token(
    connection,
    myMint,
    splToken.TOKEN_PROGRAM_ID,
    fromWallet
  );
  // Create associated token accounts for my token if they don't exist yet
  var fromTokenAccount = await myToken.getOrCreateAssociatedAccountInfo(
    fromWallet.publicKey
  )
  var toTokenAccount = await myToken.getOrCreateAssociatedAccountInfo(
    toWallet.publicKey
  )
  // Add token transfer instructions to transaction
  var transaction = new web3.Transaction()
    .add(
      splToken.Token.createTransferInstruction(
        splToken.TOKEN_PROGRAM_ID,
        fromTokenAccount.address,
        toTokenAccount.address,
        fromWallet.publicKey,
        [],
        0
      )
    );
  // Sign transaction, broadcast, and confirm
  var signature = await web3.sendAndConfirmTransaction(
    connection,
    transaction,
    [fromWallet]
  );
  console.log("SIGNATURE", signature);
  console.log("SUCCESS");
})();
```


# Contract call examples for deposit and withdraw

## Stake

```js
import anchor from '@project-serum/anchor';
import idl from './idl.json';
```

```js
const programID = new PublicKey(idl.metadata.address);
const program = new anchor.Program(idl, programID, provider);

await program.rpc.initializeStakingUser({
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
        }),
    ],
    signers: [user2Authority, user2StakingData]

});

await program.rpc.stake(amount, {
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
});
```

## Unstake
```js
await program.rpc.unstake(amount, {
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
});
```

## totalStaked

Example for getting totalStaked without unminted interest.

```js
const stakingProgram = anchor.workspace.Staking;
let stakingData = await stakingProgram.account.stakingData.fetch(stakingAccount.publicKey);
console.log(stakingData.totalStaked);
```

To get totalStaked with unminted interest you should calculate "virtual" interest first and get sum. Or call the accrue_interest instruction.

## totalStakedFor

Example of getting totalStakedFor without unminted interest.

```js
const stakingProgram = anchor.workspace.Staking;
let userData = await stakingProgram.account.stakingUserData.fetch(userStakingData.publicKey);
console.log(userData.ownershipShare);
```

To get totalStakedFor with unminted interest you should calculate "virtual" interest first and calculate new user shares.

## Staking token

Example of getting the staking token metadata address.

```js
const stakingProgram = anchor.workspace.Staking;
let stakingData = await stakingProgram.account.stakingData.fetch(stakingAccount.publicKey);
console.log(stakingData.stakeTokenMetadata);
```

This is the Metaplex Metadata address. The token Mint address contains within the Metaplex Metadata structure.
You can deserialize the Mint address.
Metaplex Metadata structure: https://github.com/metaplex-foundation/metaplex/blob/master/rust/token-metadata/program/src/state.rs#L88

Example of mint address deserialization.

```js
const metadataAccountInfo = await provider.connection.getAccountInfo(stakingData.stakeTokenMetadata);
let mintAddress = new PublicKey(metadataAccountInfo.data.slice(1+32, 1+32+32));
console.log(mintAddress.toBase58());
```
