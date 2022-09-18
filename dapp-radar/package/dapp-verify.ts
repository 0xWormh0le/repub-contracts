import { ethers } from 'ethers'
import { ecsign, ecrecover, pubToAddress } from 'ethereumjs-util'
import ERC20Abi from '@openzeppelin/contracts/build/contracts/ERC20.json'
import type { GetUnsignedMsg, GetSignature, CanUnlockAccess } from 'dapp-verify'

const { keccak256, solidityPack } = ethers.utils

/**
 * Returns unsigned message from given data
 * @param nonce nonce
 * @param timestamp timestamp
 * @returns message
 */
export const getUnsignedMsg: GetUnsignedMsg = (nonce, timestamp) => {
  const msg = keccak256(
    solidityPack( 
      ['uint256', 'uint256'],
      [nonce, timestamp]
    )
  )
  return Buffer.from(msg.slice(2), 'hex')
}

/**
 * Makes signature based on user's private key and message
 * @param pk private key of user wallet
 * @param msg message
 * @returns signed message
 */
export const getSignature: GetSignature = (pk, msg) => {
  const { r, s, v } = ecsign(msg, Buffer.from(pk.slice(2), 'hex'))
  return Buffer.concat([r, s, new Uint8Array([v])])
}

/**
 * Returns whether the user recovered from signature can access content based on provided params
 * @param requiredBalance if recovered user's balance is greater than `requiredBalance`, he can access the content
 * @param tokenAddress Radar token address
 * @param provider Ether provider
 * @param signature Signed message
 * @param unsignedMsg unsigned messge
 * @returns true if he can unlock the content, false if he cannot
 */
export const canUnlockAccess: CanUnlockAccess = async (
  requiredBalance,
  tokenAddress,
  provider,
  signature,
  unsignedMsg
) => {
  const r = signature.slice(0, 32)
  const s = signature.slice(32, 64)
  const v = signature.slice(64)

  const publicKey = ecrecover(unsignedMsg, v, r, s)
  const signerAddr = '0x' + pubToAddress(publicKey).toString('hex')
  const contract = new ethers.Contract(tokenAddress, ERC20Abi.abi, provider)
  const balance = await contract.balanceOf(signerAddr)

  return balance.toNumber() > requiredBalance
}
