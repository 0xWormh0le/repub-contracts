import { ECDSASignature } from 'ethereumjs-util'
import ethers from 'ethers'

declare module "dapp-verify" {
  export type GetUnsignedMsg = (
    nonce: number,
    timestamp: number
  ) => Buffer
  
  export type GetSignature = (
    pk: string,
    message: Buffer
  ) => Buffer
  
  export type CanUnlockAccess = (
    requiredBalance: number,
    tokenAddress: string,
    provider: ethers.providers.JsonRpcProvider,
    signature: Buffer,
    unsignedMsg: Buffer
  ) => Promise<boolean>
}
