const { expect } = require('chai')
const { ethers } = require("hardhat")
const privateKey = require('./privateKey')
const getSignature = require('../libs/signer')

describe('Airdrop', () => {
  before(async () => {
    const users = await ethers.getSigners()
    const [reserveAddress, claimSigner] = users

    this.users = users.slice(2)
    this.reserveAddress = reserveAddress
    this.owner = reserveAddress
    this.claimSigner = claimSigner

    const RadarToken = await ethers.getContractFactory('RadarToken')
    const Airdrop = await ethers.getContractFactory('Airdrop')
    this.radarToken = await RadarToken.deploy(
      'RT',
      'RT',
      [reserveAddress.address],
      [1000 * 1000 * 1000]
    )

    this.airdrop = await Airdrop.deploy(
      reserveAddress.address,
      claimSigner.address,
      this.radarToken.address
    )
  })

  it('deployment fails: invalid args', async () => {
    const Airdrop = await ethers.getContractFactory('Airdrop')

    await expect(Airdrop.deploy(
      ethers.constants.AddressZero,
      this.claimSigner.address,
      this.radarToken.address
    )).revertedWith('RadarAirdrop: invalid reserve address')

    await expect(Airdrop.deploy(
      this.reserveAddress.address,
      ethers.constants.AddressZero,
      this.radarToken.address
    )).revertedWith('RadarAirdrop: invalid claim signer address')

    await expect(Airdrop.deploy(
      this.reserveAddress.address,
      this.claimSigner.address,
      ethers.constants.AddressZero,
    )).revertedWith('RadarAirdrop: invalid token address')
  })

  it('claimToken fails: invalid args', async () => {
    const [alice] = this.users

    await expect(this.airdrop.claimTokens(
      getSignature(privateKey(1), { recipient: alice.address, amount: 10 }),
      ethers.constants.AddressZero,
      10
    )).to.revertedWith('RadarAirdrop: invalid recipient address')

    await expect(this.airdrop.claimTokens(
      getSignature(privateKey(1), { recipient: alice.address, amount: 10 }),
      alice.address,
      0
    )).to.revertedWith('RadarAirdrop: invalid amount')
  })

  it('claimToken fails: invalid signature', async () => {
    const [alice, bob] = this.users
    
    // invalid signature
    await expect(this.airdrop.claimTokens(
      getSignature(privateKey(1), { recipient: alice.address, amount: 10 }), // signed message
      bob.address, // different recipient from one in signed message
      10
    )).to.revertedWith('RadarAirdrop: invalid signature')
  
    // invalid signer: claim signer's private key is privateKey(1)
    await expect(this.airdrop.claimTokens(
      getSignature(privateKey(2), { recipient: alice.address, amount: 10 }), // signed message
      alice.address,
      10
    )).to.revertedWith('RadarAirdrop: invalid signature')
  })

  it('claimToken succeeds', async () => {
    const [alice, bob] = this.users
    
    await this.radarToken.connect(this.reserveAddress)
      .approve(this.airdrop.address, 1000)
    const balance = (await this.radarToken.balanceOf(alice.address)).toNumber()

    await expect(this.airdrop.connect(bob).claimTokens(
      getSignature(privateKey(1), { recipient: alice.address, amount: 10 }),
      alice.address,
      10
    )).to.emit(this.airdrop, 'TokenClaimed')
      .withArgs(bob.address, alice.address, 10)

    // check token is transferred to recipient
    expect(
      (await this.radarToken.balanceOf(alice.address)).toNumber()
    ).to.equal(balance + 10)
  })

  it('claimToken fails: claim again to the same recipient', async () => {
    const [alice, bob] = this.users

    await expect(this.airdrop.connect(bob).claimTokens(
      getSignature(privateKey(1), { recipient: alice.address, amount: 10 }), // signed message
      alice.address,
      10
    )).to.revertedWith('RadarAirdrop: token already claimed to recipient')
  })

  it('pause airdrop and can\'t claim token', async () => {
    const [alice] = this.users

    // non owner can't pause Airdrop
    await expect(this.airdrop.connect(alice).pause())
      .to.revertedWith('Ownable: caller is not the owner')

    await this.airdrop.connect(this.owner).pause()

    // cannot claim tokens once paused
    await expect(this.airdrop.connect(alice).claimTokens('0x00', alice.address, 0))
      .to.revertedWith("Pausable: paused")
  })
})
