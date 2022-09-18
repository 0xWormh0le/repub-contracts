const { ethers } = require("hardhat")
const { expect } = require('chai')
const { getUnsignedMsg, getSignature, canUnlockAccess } = require('../../package/dapp-verify')
const privateKey = require('../privateKey')

describe('dapp-verify package', () => {
  before(async () => {
    const RadarToken = await hre.ethers.getContractFactory('RadarToken')
    const users = await hre.ethers.getSigners()

    users.forEach((user, index) => {
      user.privateKey = privateKey(index)
    })
    this.owner = users[0]
    this.users = users.slice(1)
    
    const [alice, bob] = this.users

    this.radarToken = await RadarToken.deploy(
      'RT',
      'RT',
      [alice.address, bob.address],
      [99, 101]
    )
  })

  it('unlock fails: user balance is not sufficient', async () => {
    const [alice] = this.users
    const msg = getUnsignedMsg(0, 0)
    const sig = getSignature(alice.privateKey, msg)
    const provider = ethers.provider

    expect(await canUnlockAccess(100, this.radarToken.address, provider, sig, msg))
      .to.equal(false)
  })

  it('unlock succeeds if user balance is sufficient', async () => {
    const [, bob] = this.users
    const msg = getUnsignedMsg(0, 0)
    const sig = getSignature(bob.privateKey, msg)
    const provider = ethers.provider

    expect(await canUnlockAccess(100, this.radarToken.address, provider, sig, msg))
      .to.equal(true)
  })

  it('unlock fails: signature is invalid', async () => {
    const [alice] = this.users
    const msg = getUnsignedMsg(0, 0)
    const sig = getSignature(alice.privateKey, msg)
    const provider = ethers.provider
    expect(await canUnlockAccess(10, this.radarToken.address, provider, sig, getUnsignedMsg(0, 1)))
      .to.equal(false)
  })
})
