const { expect } = require('chai')
const { ethers } = require('hardhat')
const { utils } = require('ethers')
const { advanceTime, currentTimestamp } = require('./utils')

const ProposalState = {
  None: 0,
  Proposed: 1,
  Sponsored: 2,
  Approved: 3,
  Failed: 4,
  Paid: 5
}

describe('Governance', () => {
  before(async () => {
    const Governance = await ethers.getContractFactory('Governance')
    const StakeToken = await ethers.getContractFactory('StakeToken')
    const Token = await ethers.getContractFactory('ERC20Mock')

    const now = await currentTimestamp()
    const users = await ethers.getSigners()
    this.stakeToken = await StakeToken.deploy('STAKE', 'STAKE', 8)
    this.token = await Token.deploy('TKN', 'TKN')
    this.governance = await Governance.deploy(
      3600, // approval fixed period in seconds
      51, // min approval percent,
      this.stakeToken.address, // stake token address
      now, // starting timestamp
      400000, // max interest rate
      100000, // starting interest rate
    )
    this.ipfsHash = utils.formatBytes32String('some random bytes') // random bytes32
    this.ipfsHashAnother = utils.formatBytes32String('some random bytes another') // random bytes32
    this.users = users
    this.stakers = users.slice(0, 3)
    this.nonStakers = users.slice(3)

    // stake tokens
    await this.stakeToken.connect(this.stakers[0]).init([this.stakers[0].address], this.governance.address)
    await this.stakeToken.connect(this.stakers[0]).mint(this.stakers[0].address, 15)
    await this.stakeToken.connect(this.stakers[0]).mint(this.stakers[1].address, 25)
    await this.stakeToken.connect(this.stakers[0]).mint(this.stakers[2].address, 35)

    await this.stakeToken.connect(this.stakers[0]).approve(this.governance.address, 100)
    await this.stakeToken.connect(this.stakers[1]).approve(this.governance.address, 100)
    await this.stakeToken.connect(this.stakers[2]).approve(this.governance.address, 100)

    await this.governance.connect(this.stakers[0]).stake(15, '0x00')
    await this.governance.connect(this.stakers[1]).stake(25, '0x00')
    await this.governance.connect(this.stakers[2]).stake(35, '0x00')
  })

  it('success: treasuryBalance', async () => {
    await this.token.mint(this.governance.address, 50)
    expect(await this.governance.treasuryBalance(this.token.address))
      .to.equal(50)
  })

  it('make proposal: reject when invalid arguments were given', async () => {
    const [alice] = this.stakers
    const [bob] = this.nonStakers

    await expect(
      this.governance.connect(bob).makeProposal(this.ipfsHash, this.token.address, 100, bob.address)
    ).to.revertedWith('You are not a staker')

    await expect(
      this.governance.connect(alice).makeProposal(utils.formatBytes32String(0), this.token.address, 100, bob.address)
    ).to.revertedWith('Empty proposal ipfs hash')

    await expect(
      this.governance.connect(alice).makeProposal(this.ipfsHash, this.token.address, 0, bob.address)
    ).to.revertedWith('Empty token payment amount')

    await expect(
      this.governance.connect(alice).makeProposal(this.ipfsHash, this.token.address, 100, ethers.constants.AddressZero)
    ).to.revertedWith('Empty recipient address')
  })

  it('make proposal: success', async () => {
    const [alice] = this.stakers
    const [bob] = this.nonStakers

    // check status before making proposal
    expect(await this.governance.proposalStatus(this.ipfsHash))
      .to.equal(ProposalState.None)

    // make proposal
    await expect(
      this.governance.connect(alice).makeProposal(this.ipfsHash, this.token.address, 100, bob.address)
    ).to.emit(this.governance, 'ProposalMade')
      .withArgs(this.ipfsHash, this.token.address, 100, bob.address)

    await this.governance.connect(alice)
      .makeProposal(this.ipfsHashAnother, this.token.address, 100, bob.address)    

    // check steatus after making proposal
    expect(await this.governance.proposalStatus(this.ipfsHash))
      .to.equal(ProposalState.Proposed)
  })

  it('approve proposal: success', async () => {
    const [alice, bob, carl] = this.stakers

    // alice approves with voting weight 15
    await expect(this.governance.connect(alice).approveProposal(this.ipfsHash, true))
      .to.emit(this.governance, 'ProposalApproved')
      .withArgs(alice.address, this.ipfsHash, true)

    // carl disapproves with voting weight 35
    await expect(this.governance.connect(carl).approveProposal(this.ipfsHash, false))
      .to.emit(this.governance, 'ProposalApproved')
      .withArgs(carl.address, this.ipfsHash, false)

    // bob approves with voting weight 25
    await expect(this.governance.connect(bob).approveProposal(this.ipfsHash, true))
      .to.emit(this.governance, 'ProposalApproved')
      .withArgs(bob.address, this.ipfsHash, true)

    // vote on another proposal
    await this.governance.connect(alice)
      .approveProposal(this.ipfsHashAnother, true)
    await this.governance.connect(bob)
      .approveProposal(this.ipfsHashAnother, false)
    await this.governance.connect(carl)
      .approveProposal(this.ipfsHashAnother, false)
  })
  
  it('approve proposal: check fail condition and locking status', async () => {
    const [staker] = this.stakers
    const [alice] = this.nonStakers

    await expect(
      this.governance.connect(alice).approveProposal(this.ipfsHash, true)
    ).to.revertedWith('You are not a staker')

    await expect(
      this.governance.connect(staker).approveProposal(utils.formatBytes32String('invalid proposal'), true)
    ).to.revertedWith('Invalid ipfs hash')
      
    await expect(
      this.governance.connect(staker).approveProposal(this.ipfsHash, true)
    ).to.revertedWith('You already voted')

    // unable to unstake because governance token is locked after proposal
    await expect(this.governance.connect(staker).unstake(10, '0x00'))
      .to.revertedWith('Unstake amount is greater than unlocked balance')

    // advance time after proposal expiration
    await advanceTime(3700)

    await expect(
      this.governance.connect(staker).approveProposal(this.ipfsHash, true)
    ).to.revertedWith('Proposal expired')

    // Lock is removed after proposal expiration
    await this.governance.connect(staker).unstake(10, '0x00')
  })

  it('check proposal status after expiration', async () => {
    expect(await this.governance.proposalStatus(this.ipfsHash))
      .to.equal(ProposalState.Approved)
    expect(await this.governance.proposalStatus(this.ipfsHashAnother))
      .to.equal(ProposalState.Failed)
  })

  it('pay proposal: check fail conditions', async () => {
    const [staker] = this.stakers
    const [alice] = this.nonStakers

    await expect(
      this.governance.connect(alice).payProposal(this.ipfsHash)
    ).to.revertedWith('You are not a staker')

    // try pay failed proposal
    await expect(
      this.governance.connect(staker).payProposal(this.ipfsHashAnother)
    ).to.revertedWith('Proposal is not approved')

    // try pay unexpired proposal
    await this.governance.connect(staker).makeProposal(
      utils.formatBytes32String('new proposal'),
      this.token.address,
      100,
      alice.address)

    await expect(
      this.governance.connect(staker).payProposal(utils.formatBytes32String('new proposal'))
    ).to.revertedWith('Proposal is not approved')

    await expect(
      this.governance.connect(staker).payProposal(this.ipfsHash)
    ).to.revertedWith('Insufficient payment balance')
  })

  it('pay proposal: success', async () => {
    const [staker] = this.stakers
    const [hash, tokenAddress, recipientAddress, tokenPaymentAmount] = await this.governance.proposals(this.ipfsHash)
    const recipientBalance = await this.token.balanceOf(recipientAddress)

    await this.token.mint(this.governance.address, 100)

    await expect(
      this.governance.connect(staker).payProposal(this.ipfsHash)
    ).to.emit(this.governance, 'ProposalPaid')
      .withArgs(this.ipfsHash, tokenAddress, recipientAddress, tokenPaymentAmount)

    expect(
      (await this.token.balanceOf(recipientAddress)).toNumber()
    ).to.equal(recipientBalance.add(tokenPaymentAmount).toNumber())

    // check status of paid proposal
    expect(await this.governance.proposalStatus(this.ipfsHash))
      .to.equal(ProposalState.Paid)

    // pay again reverts
    await expect(
      this.governance.connect(staker).payProposal(this.ipfsHash)
    ).to.revertedWith('Proposal is not approved')
  })
})
