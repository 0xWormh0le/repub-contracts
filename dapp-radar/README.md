# Radar Airdrop

## Flow

![flow](http://plantumlapp.herokuapp.com/svg/bLF1Yjj03BtxAyHU6iCMbXvpA8ImfJtaiXHwyKMRKU9X7OqhoTdcxplnUDRE40ez3PRclQVtD6wz8pY4OA_XJuLx2mBR3lq9sQeUnVpUzyW6l-XLlH6WmeFRz3sye4DfUAe_t5p-eJgGZ7U_XuZ5hYDhU3K3wrl0nekJq6y3c-3UHkHKQpXNRo7FBzilJzF46tVoN5NZ0P-_fjuQiEybd6dLC2QkZND2gezpOHS6jhhAbYCuErt3VYpwMEt2KI4gJAsRMsSIVxZ0e2JW5OZDMqSEB01c1yWEMbJ-P8aqjh4JGdUvhonqz6eay6mj2Gqdm3JvrQy_er6-MordIh5VuRy7KWFrHnxvOm92CJTFR8iCJbVp3TSD7oISe0q6x-EgPfb4MQLZgV4lxeOVFxWpTBQNiEH6TEMer5eOok6Ka3A5POhbMrh3kxSMTcIuGtrhUDp0p_16l5gmrbC3V3m7HmeVhdBuZx3FCZrU58uuxwDKhOhlnQkCtwm7acyIKdXASgPvBLcaN5GDTXrQuv47AMNk-uz6WZWeU1ks06gXXyDWWr3gw_GMhFMQVIy3ByZpBtT7jST1AN-kwl_vEP_glm00)

- Admin approves tokens Airdrop Contract can transfer ERC20 tokens from the reserve address to transfer tokens to recipients during the airdrop

- Claimant logs in

- Site verifies if the user is entitled to the airdrop or if the user has previously claimed their airdrop

- Site requests a signed claim from the Hot Wallet

- Hot wallet signs the claim

- Hot wallet returns the signed claim to the claimants browser

- Claimant uses metamask to make their claim

- Smart contract transfers tokens to the claimant address and the claimant pays the gas

- After some time passes, the issuer pauses contract at the end of the airdrop

- Admin sets the approved allowance from the reserve address to the Airdrop contract to 0

## Compile & Test

Compile solidity contracts and run the test suite with:

```shell
yarn compile
yarn test
```

## Deploy & Verification

```
yarn deploy --network <network-in-hardhat-config>
yarn verify --network <network-in-hardhat-config>
```

## Geneate Claims

Generate a bulk of signed claims using the following [Hardhat task](https://hardhat.org/guides/create-task.html).

Syntax:
```
yarn generate-claims \
  --input-file <input-file-path> \
  --output-file <output-file-path> \
  --private-key-file <private-key-file-path>
```

It will print csv results of recipient, token amount and signed claim into output file.

Example usage:
```
yarn generate-claims --input-file test/tasks/airdrop.csv --output-file ../tmp/output.csv --private-key-file ../data/claim-signer-private-key

# or

npx hardhat generate-laims --input-file test/tasks/airdrop.csv --output-file ../tmp/output.csv --private-key-file ../data/claim-signer-private-key
```

### Arguments

- --input-file

Input CSV file path containing recipient address and token amount in base unit, which is relative to project root path.
Should include CSV header in the first row

- --output-file

Output CSV file path containing recipient address, token amount in base unit and signed claim, which is relative to project root path

- --private-key-file

Claim signer's private key file, which is relative to project root path

## dapp-verify package

![image](https://user-images.githubusercontent.com/18642714/144487371-4850f22f-79ef-4496-94c7-d99c832b1dea.png)

- User requests the gated content from the Website

- Website generates an unsigned proof of ownership which includes the hash of a nonce, timestamp, and users blockchain address.

- The claimant signs the proof of ownership message with their MetaMask wallet

- The claimant / wallet sends the signed proof of ownership to the website

- The website calls ecrecover on the signed message to determine which blockchain account signed the message

- The the website checks the balance of the blockchain address that it recovered from the signed proof of ownership

- If the blockchain balance of tokens is greater than the required amount then it unlocks access to the gated content for the user

### Usage

#### 1. Get message to sign
```Node
// backend

import { getUnsignedMsg } from './dapp-verify'

let nonce = 0

const msg = getUnsignedMsg(
  nonce++,
  Date.now()
)
```

#### 2. Sign message and request unlock to server

Sign message using Metamask (ethers.js)
```Node
// frontend

import { ethers } from "ethers"
...
// connect Metamask and get provider using ethers.js
const signer = provider.getSigner()
const signature = await signer.signMessage(msg)

// or if you are using web3
const signature = web3.eth.sign(signer, msg)
```

Sign message manually using private key
```Node
// frontend

import { getSignature } from './dapp-verify'

const signature = getSignature(privateKey, msg)

```

#### 3. Server verifies the message and check if he is good to see the content

```Node
// backend
import { ethers } from 'ethers'
import { canUnlockAccess } from './dapp-verify'

const provider = ethers.getDefaultProvider()

const onRequestAccess = async (signature: Buffer, unsignedMsg: Buffer) => {
  const canUnlock = await canUnlockAccess(
    requiredBalance,
    tokenAddress,
    provider,
    signature,
    unsignedMsg
  )

  if (canUnlock) {
    // send gated content
  } else {
    // send "user balance not sufficient" response
  }
}
```

## How to claim tokens

- Airdrop.claimSigner signs message using his private key combining recipient address and amount of tokens to claim
- Arbitrary user calls Airdrop.claimTokens with signature above, recipient address and amount
- Only when recipient and amount are the same as the one of signed message, Airdrop contract transfers tokens from reserve address to recipient

```Node
const { ethers } = require('hardhat')
const { ecsign } = require('ethereumjs-util')

const { keccak256, solidityPack } = ethers.utils

function getSignature(privateKey, recipient, amount) {
  const msg = keccak256(
    solidityPack(
      ['address', 'uint256'],
      [recipient, amount]
    )
  )
  const { v, r, s } = ecsign(
    Buffer.from(msg.slice(2), 'hex'),
    Buffer.from(privateKey.slice(2), 'hex')
  )

  return '0x' + r.toString('hex') + s.toString('hex') + v.toString(16)
}

airdrop.connect(user).claimTokens(
  getSignature(claimSigner.privateKey, recipient.address, amount),
  recipient.address,
  amount
).then(() => console.log('claim succeeded'))
```
