const hre = require('hardhat')
const ethers = require('ethers')
const { expect } = require("chai")
const { advanceTime } = require('./utils')

const staker1balance = 1e6
const staker2balance = 1e6
const staker3balance = 1e6
const totalSupply = 1e9
const maxInterestRate = 400000

let reserveAccount, staker1, staker2, staker3, token, staking

describe('StakingConstructor', async function () {
  beforeEach(async () => {
    [reserveAccount, staker1, staker2, staker3] = await hre.ethers.getSigners()

    let tokenFactory = await hre.ethers.getContractFactory("StakeToken")
    token = await tokenFactory.deploy(
      "Staking Token",
      "STKN",
      18
    )
  })

  it('should not allow to set a zero token address', async function () {
    let stakingFactory = await hre.ethers.getContractFactory("Staking")
    expect(stakingFactory.deploy(
      hre.ethers.constants.AddressZero,
      Math.floor(Date.now()/1000),
      maxInterestRate,
      100000
    )).to.be.reverted
  })

  it('should not allow to launch with interest rate > max interest rate', async function () {
    let stakingFactory = await hre.ethers.getContractFactory("Staking")
    expect(stakingFactory.deploy(
      token.address,
      Math.floor(Date.now()/1000),
      maxInterestRate,
      maxInterestRate + 1
    )).to.be.reverted
  })

  it('should not allow to launch with max interest set to 0', async function () {
    let stakingFactory = await hre.ethers.getContractFactory("Staking")
    expect(stakingFactory.deploy(
      token.address,
      Math.floor(Date.now()/1000),
      0,
      0
    )).to.be.reverted
  })

  it('should not allow to launch with interest set to 0', async function () {
    let stakingFactory = await hre.ethers.getContractFactory("Staking")
    expect(stakingFactory.deploy(
      token.address,
      Math.floor(Date.now()/1000),
      maxInterestRate,
      0
    )).to.be.reverted
  })

  it('should not allow to set a date more than 1 day in the past', async function () {
    let stakingFactory = await hre.ethers.getContractFactory("Staking")
    expect(stakingFactory.deploy(
      token.address,
      Math.floor(Date.now()/1000) - 3600 * 24 * 2,
      maxInterestRate,
      100000
    )).to.be.reverted
  })
})

describe('Staking', async function () {
  beforeEach(async () => {
    [reserveAccount, staker1, staker2, staker3] = await hre.ethers.getSigners()

    let latestBlock = await hre.network.provider.request({
      method: "eth_getBlockByNumber",
      params: ["latest", false]
    })
    let timestamp = ethers.BigNumber.from(latestBlock.timestamp)

    let tokenFactory = await hre.ethers.getContractFactory("StakeToken")
    token = await tokenFactory.deploy(
      "Staking Token",
      "STKN",
      18
    )

    let stakingFactory = await hre.ethers.getContractFactory("Staking")
    staking = await stakingFactory.deploy(
      token.address,
      timestamp.toNumber(),
      maxInterestRate,
      100000
    )

    token = await token.connect(reserveAccount)

    await token.init([staking.address, reserveAccount.address], staking.address)
    await token.mint(staker1.address, staker1balance)
    await token.mint(staker2.address, staker2balance)
    await token.mint(staker3.address, staker3balance)

  })

  it('should not allow setting more than the max interest rate', async function () {
    let stakingFactory = await hre.ethers.getContractFactory("Staking")
    expect(stakingFactory.deploy(
      token.address,
      Math.floor(Date.now()/1000),
      maxInterestRate,
      maxInterestRate + 1
    )).to.be.reverted
  })

  it('should have expected token test setup', async function () {
    expect(await token.balanceOf(staker1.address))
      .to.equal(staker1balance)
    expect(await token.balanceOf(staker2.address))
      .to.equal(staker2balance)
    expect(await token.balanceOf(staker3.address))
      .to.equal(staker3balance)
  })

  it('should allow staking and unstaking tokens', async function () {
    let stakingConnection = await staking.connect(staker1)
    let tokenConnection = await token.connect(staker1)

    expect(await stakingConnection.totalStakedFor(staker1.address))
      .to.equal(0)

    await tokenConnection.approve(staking.address, staker1balance)

    await stakingConnection.stake(staker1balance - 100, 0)
    await stakingConnection.stakeFor(staker2.address, 100, 0)

    expect(await stakingConnection.totalStakedFor(staker1.address))
      .to.equal(staker1balance - 100)

    expect(await stakingConnection.totalStakedFor(staker2.address))
      .to.equal(100)

    await stakingConnection.unstake(100, 0)
    expect(await stakingConnection.totalStakedFor(staker1.address))
      .to.equal(staker1balance - 200)
  })

  it('should revert on zero staked amount', async function () {
    let stakingConnection = await staking.connect(staker1)
    let tokenConnection = await token.connect(staker1)


    expect(stakingConnection.stake(0, 0)).to.be.reverted
  })

  it('should revert when staking for zero address', async function () {
    let stakingConnection = await staking.connect(staker1)
    let tokenConnection = await token.connect(staker1)

    await tokenConnection.approve(staking.address, staker1balance)


    expect(stakingConnection.stakeFor(hre.ethers.constants.AddressZero, 100, 0)).to.be.reverted
  })

  it('should revert on insufficient balance', async function () {
    let stakingConnection = await staking.connect(staker1)
    let tokenConnection = await token.connect(staker1)

    expect(await stakingConnection.totalStakedFor(staker1.address))
      .to.equal(0)

    await tokenConnection.approve(staking.address, staker1balance + 1)

    expect(stakingConnection.stake(staker1balance + 1, 0)).to.be.reverted

  })

  it('should revert on insufficient allowance', async function () {
    let stakingConnection = await staking.connect(staker1)
    let tokenConnection = await token.connect(staker1)

    expect(await stakingConnection.totalStakedFor(staker1.address))
      .to.equal(0)

    await tokenConnection.approve(staking.address, staker1balance - 1)

    expect(stakingConnection.stake(staker1balance, 0)).to.be.reverted

  })

  it('should revert on incorrect transferFrom', async function () {

    let weirdTokenFactory = await hre.ethers.getContractFactory("WeirdTransferFromToken")
    weirdToken = await weirdTokenFactory.deploy(
      "Staking Token",
      "STKN"
    )

    let weirdStakingFactory = await hre.ethers.getContractFactory("Staking")
    weirdStaking = await weirdStakingFactory.deploy(
      weirdToken.address,
      Math.floor(Date.now()/1000),
      maxInterestRate,
      100000
    )

    await weirdToken.mint(staker1.address, 1000)

    let stakingConnection = await weirdStaking.connect(staker1)
    let tokenConnection = await weirdToken.connect(staker1)

    await tokenConnection.approve(weirdStaking.address, 1000)

    expect(stakingConnection.stake(1000, 0)).to.be.reverted
  })

  it('should revert on incorrect transfer', async function () {

    let weirdTokenFactory = await hre.ethers.getContractFactory("WeirdTransferToken")
    weirdToken = await weirdTokenFactory.deploy(
      "Staking Token",
      "STKN"
    )

    let weirdStakingFactory = await hre.ethers.getContractFactory("Staking")
    weirdStaking = await weirdStakingFactory.deploy(
      weirdToken.address,
      Math.floor(Date.now()/1000),
      maxInterestRate,
      100000
    )

    await weirdToken.mint(staker1.address, 1000)

    let stakingConnection = await weirdStaking.connect(staker1)
    let tokenConnection = await weirdToken.connect(staker1)

    await tokenConnection.approve(weirdStaking.address, 1000)

    await stakingConnection.stake(1000, 0)

    expect(stakingConnection.unstake(1000, 0)).to.be.reverted
  })

  it('should not allow to unstake 0', async function () {
    let stakingConnection = await staking.connect(staker1)
    let tokenConnection = await token.connect(staker1)

    await tokenConnection.approve(staking.address, staker1balance)

    await stakingConnection.stake(staker1balance, 0)

    expect(stakingConnection.unstake(0, 0)).to.be.reverted

  })

  it('should not allow to unstake more than the user balance', async function () {
    let stakingConnection = await staking.connect(staker1)
    let tokenConnection = await token.connect(staker1)

    await tokenConnection.approve(staking.address, staker1balance)

    await stakingConnection.stake(staker1balance, 0)

    expect(stakingConnection.unstake(staker1balance + 1, 0)).to.be.reverted

  })

  it('should keep track of total staked from multiple stakers', async function () {
    expect(await staking.totalStaked()).to.equal(0)

    staking = staking.connect(staker1)
    await (await token.connect(staker1)).approve(staking.address, totalSupply)
    await staking.stake(200, 0)
    expect(await staking.totalStaked()).to.equal(200)

    staking = staking.connect(staker2)
    await (await token.connect(staker2)).approve(staking.address, totalSupply)
    await staking.stake(170, 0)
    expect(await staking.totalStaked()).to.equal(370)

    staking = staking.connect(staker1)
    await staking.unstake(10, 0)
    expect(await staking.totalStaked()).to.equal(360)
    expect(await staking.totalStakedFor(staker1.address)).to.equal(190)
  })

  it('should define the staking token', async function () {
    expect(await staking.token()).to.equal(token.address)
  })

  it('should not support history', async function () {
    expect(await staking.supportsHistory()).to.equal(false)
  })

  it('should emit a staked and unstaked events', async function () {
    staking = await staking.connect(staker1)
    await (await token.connect(staker1)).approve(staking.address, totalSupply)

    expect(staking.stake(10, hre.ethers.utils.hexlify(0)))
      .to.emit(staking, 'Staked')
      .withArgs(staker1.address, 10, 10, "0x00")

    expect(staking.stake(10, hre.ethers.utils.hexlify(5)))
      .to.emit(staking, 'Staked')
      .withArgs(staker1.address, 10, 20, "0x05")

    expect(staking.unstake(2, hre.ethers.utils.hexlify(4)))
      .to.emit(staking, 'Unstaked')
      .withArgs(staker1.address, 2, 18, "0x04")
  })

  it('should allow the owner to set the interest rate', async function() {
    const stakingConnection = await staking.connect(reserveAccount)

    await stakingConnection.setInterestRate(100)
    expect(await stakingConnection.interestRate())
      .to.equal(100)
  })

  it('should not allow non-owners to set the interest rate', async function() {
    const stakingConnection = await staking.connect(staker1)

    expect(stakingConnection.setInterestRate(100))
      .to.be.reverted
  })

  it('should not allow the interest rate to exceed the allowed maximum', async function() {
    const stakingConnection = await staking.connect(reserveAccount)

    expect(stakingConnection.setInterestRate(maxInterestRate + 1))
      .to.be.reverted
  })

  it('should accrue interest over time', async function() {
    const stakingConnectionOwner = staking.connect(reserveAccount)
    const stakingConnectionStaker = staking.connect(staker1)
    const tokenConnection = token.connect(staker1)

    await stakingConnectionOwner.setInterestRate(10000)
    await tokenConnection.approve(staking.address, totalSupply)
    await stakingConnectionStaker.stake(10000, 0)

    await advanceTime(2 * 3600 * 24)

    expect(await staking.totalStakedFor(staker1.address))
      .to.equal(10000 * (1.01 ** 2))
    await stakingConnectionStaker.unstake(10000 * (1.01 ** 2), 0)
    expect(await tokenConnection.balanceOf(staker1.address))
      .to.equal(staker1balance - 10000 + 10000 * (1.01 ** 2))
  })

  it('should be able to accrue interest manually', async function() {
    const stakingConnectionOwner = staking.connect(reserveAccount)
    const stakingConnectionStaker = staking.connect(staker1)
    const tokenConnection = token.connect(staker1)

    await stakingConnectionOwner.setInterestRate(10000)
    await tokenConnection.approve(staking.address, totalSupply)
    await stakingConnectionStaker.stake(10000, 0)

    await advanceTime(2 * 3600 * 24)

    await stakingConnectionStaker.accrueInterest()

    expect(await tokenConnection.balanceOf(staking.address))
      .to.equal(10000 * (1.01 ** 2))
  })

  it('should not accrue interest in less than a day', async function() {
    const stakingConnectionOwner = staking.connect(reserveAccount)
    const stakingConnectionStaker = staking.connect(staker1)
    const tokenConnection = token.connect(staker1)

    await stakingConnectionOwner.setInterestRate(10000)
    await tokenConnection.approve(staking.address, totalSupply)
    await stakingConnectionStaker.stake(10000, 0)

    await advanceTime(0 * 3600 * 24.5)

    await stakingConnectionStaker.accrueInterest()

    expect(await tokenConnection.balanceOf(staking.address))
      .to.equal(10000)
  })

  it('should accrue interest correctly over a long period of time', async function() {
    const stakingConnectionOwner = staking.connect(reserveAccount)
    const stakingConnectionStaker = staking.connect(staker1)
    const tokenConnection = token.connect(staker1)

    await stakingConnectionOwner.setInterestRate(10000)
    await tokenConnection.approve(staking.address, totalSupply)
    await stakingConnectionStaker.stake(10000, 0)

    await advanceTime(15 * 3600 * 24)

    expect(await staking.totalStakedFor(staker1.address))
      .to.equal(11609)
    await stakingConnectionStaker.unstake(11609, 0)
    expect(await tokenConnection.balanceOf(staker1.address))
      .to.equal(staker1balance + 1609)
  })

  it('should accrue interest correctly after interest rate change', async function() {
    const stakingConnectionOwner = staking.connect(reserveAccount)
    const stakingConnectionStaker = staking.connect(staker1)
    const tokenConnection = token.connect(staker1)

    // Interest rate is set to 1% daily
    await stakingConnectionOwner.setInterestRate(10000)
    await tokenConnection.approve(staking.address, totalSupply)
    await stakingConnectionStaker.stake(staker1balance, 0)

    await advanceTime(2 * 3600 * 24)

    // Interest rate is set to 0.1% daily
    await stakingConnectionOwner.setInterestRate(1000)

    expect(await staking.totalStakedFor(staker1.address))
      .to.equal(staker1balance * (1.01 ** 2))
    await stakingConnectionStaker.unstake(staker1balance * (1.01 ** 2), 0)
    expect(await tokenConnection.balanceOf(staker1.address))
      .to.equal(staker1balance * (1.01 ** 2))
  })

  it('should accrue interest correctly for multiple stakers in a complex scenario', async function() {
    // Interest rate is set to 10% daily

    await (await staking.connect(reserveAccount)).setInterestRate(100000)

    // Alice stakes
    await (await token.connect(staker1)).approve(staking.address, totalSupply)
    await (await staking.connect(staker1)).stake(staker1balance, 0)

    // Bruce stakes
    await (await token.connect(staker2)).approve(staking.address, totalSupply)
    await (await staking.connect(staker2)).stake(staker2balance / 2, 0)

    await advanceTime(1 * 3600 * 24)

    // Interest rate is set to 5% daily
    await (await staking.connect(reserveAccount)).setInterestRate(50000)

    // Bruce unstakes, enraged
    await (await staking.connect(staker2)).unstake((staker2balance / 2) * 1.1, 0)

    await advanceTime(1 * 3600 * 24)

    // Alice's staked balance should be 1000 + 10% (30 days) + 5% (compound)

    expect(await staking.totalStakedFor(staker1.address))
      .to.equal(staker1balance * 1.1 * 1.05)

    // Bruce's token balance should be 5e5 + 5e5 * 1.1

    expect(await token.balanceOf(staker2.address))
      .to.equal(staker2balance / 2 + (staker2balance / 2) * 1.1)

    // Interest rate is set to 40% daily
    await (await staking.connect(reserveAccount)).setInterestRate(400000)

    // Enters Carol
    await (await token.connect(staker3)).approve(staking.address, totalSupply)
    await (await staking.connect(staker3)).stake(staker3balance, 0)

    await (await staking.connect(staker1)).unstake(1e5, 0)

    await advanceTime(1 * 3600 * 24)

    // Alice's staked balance should be (previous balance - 55) * 1.4

    let aliceBalance2 = (staker1balance * 1.1 * 1.05 - 1e5) * 1.4

    // In complex scenarios insignificant rounding errors may arise due to integer computations in the contract

    expect(Number(await staking.totalStakedFor(staker1.address)))
      .to.be.within(aliceBalance2 - 1, aliceBalance2 + 1)

    // Carol's staked balance should be 1000 + 40%

    let carolBalance2 = staker3balance * 1.4
    expect(Number(await staking.totalStakedFor(staker3.address)))
      .to.be.within(carolBalance2 - 1, carolBalance2 + 1)
  })

  it('staking contract should display unminted interest correctly', async function() {
    const stakingConnectionOwner = staking.connect(reserveAccount)
    const stakingConnectionStaker = staking.connect(staker1)
    const tokenConnection = token.connect(staker1)

    // Interest rate is set to 1% daily
    await stakingConnectionOwner.setInterestRate(10000)
    await tokenConnection.approve(staking.address, totalSupply)
    await stakingConnectionStaker.stake(staker1balance, 0)

    // Should be 0 before we advance time
    expect(await staking.totalUnmintedInterest())
      .to.equal(0, "No virtual interest initially")

    await advanceTime(2 * 3600 * 24)

    // Sanity check
    expect(await staking.totalStakedFor(staker1.address))
      .to.equal(staker1balance * (1.01 ** 2))

    // Should change after we advance time, but before we accrue it
    expect(await staking.totalUnmintedInterest())
      .to.equal(staker1balance * (1.01 ** 2) - staker1balance, "Correct non-zero virtual display")

    await stakingConnectionStaker.unstake(10, 0)

    // Should be set to 0 as we force accrual
    expect(await staking.totalUnmintedInterest())
      .to.equal(0, "Zero after accrual")
  })

  it('token contract should display real + virtual tokens correctly', async function() {
    const stakingConnectionOwner = staking.connect(reserveAccount)
    const stakingConnectionStaker = staking.connect(staker1)
    const tokenConnection = token.connect(staker1)

    // Interest rate is set to 1% daily
    await stakingConnectionOwner.setInterestRate(10000)
    await tokenConnection.approve(staking.address, totalSupply)
    await stakingConnectionStaker.stake(staker1balance, 0)

    let newTotalSupply = await token.totalSupply()

    // Should be 0 before we advance time
    expect(await staking.totalUnmintedInterest())
      .to.equal(0, "No virtual interest initially")

    expect(await token.totalSupplyVirtual())
      .to.equal(newTotalSupply, "No virtual interest initially")

    await advanceTime(2 * 3600 * 24)

    // Expected interest: 2 days worth of 1% daily times staker's balance
    let expectedInterest = staker1balance * (1.01 ** 2) - staker1balance

    // Should change after we advance time, but before we accrue it
    expect(await staking.totalUnmintedInterest())
      .to.equal(expectedInterest, "Correct non-zero virtual display")

    newTotalSupply = await token.totalSupply()

    expect(await token.totalSupplyVirtual())
      .to.equal(Number(newTotalSupply) + Number(expectedInterest), "No virtual interest initially")

    await stakingConnectionStaker.unstake(10, 0)

    // Should be set to 0 as we force accrual
    expect(await staking.totalUnmintedInterest())
      .to.equal(0, "Zero after accrual")

    newTotalSupply = await token.totalSupply()
    expect(await token.totalSupplyVirtual())
      .to.equal(newTotalSupply, "Virtually equal")
  })


  it('precision loss from staking accrual should not exceed 0.00001 tokens a year', async function() {
    const stakingConnectionOwner = staking.connect(reserveAccount)
    const stakingConnectionStaker = staking.connect(staker1)
    const tokenConnection = token.connect(staker1)

    let startingBalance = 567899 // keeping in mind that the token has 8 decimals
    let accrualDays = 365

    await stakingConnectionOwner.setInterestRate(100) // 100 of 1e-6 daily, should be ~3.7% APY
    await tokenConnection.approve(staking.address, totalSupply)
    await stakingConnectionStaker.stake(startingBalance, 0)

    await advanceTime(accrualDays * 3600 * 24)

    let expectedBalance = startingBalance * (1.0001 ** accrualDays)

    let actualBalance = await staking.totalStakedFor(staker1.address)

    expect(expectedBalance - actualBalance)
      .to.be.below(1000)
  })

  it('188 is a good interest rate to hit 7% APY', async function() {
    const stakingConnectionOwner = staking.connect(reserveAccount)
    const stakingConnectionStaker = staking.connect(staker1)
    const tokenConnection = token.connect(staker1)

    let startingBalance = 567899 // keeping in mind that the token has 8 decimals
    let accrualDays = 360

    await stakingConnectionOwner.setInterestRate(188) // 100 of 1e-6 daily, should be ~14% APY
    await tokenConnection.approve(staking.address, totalSupply)
    await stakingConnectionStaker.stake(startingBalance, 0)

    await advanceTime(accrualDays * 3600 * 24)

    //let expectedBalance = startingBalance * (1.000364 ** accrualDays)

    let expectedBalance = startingBalance * 1.07
    let actualBalance = await staking.totalStakedFor(staker1.address)


    console.log("Expected: ", expectedBalance.toString())
    console.log("Actual  : ", actualBalance.toString())
    console.log("Error   : ", (expectedBalance-actualBalance).toString())
    expect(expectedBalance - actualBalance)
      .to.be.below(1000)
  })

  it('365 is a good interest rate to hit 14% APY', async function() {
    const stakingConnectionOwner = staking.connect(reserveAccount)
    const stakingConnectionStaker = staking.connect(staker1)
    const tokenConnection = token.connect(staker1)

    let startingBalance = 567899 // keeping in mind that the token has 8 decimals
    let accrualDays = 360

    await stakingConnectionOwner.setInterestRate(365) // 100 of 1e-6 daily, should be ~14% APY
    await tokenConnection.approve(staking.address, totalSupply)
    await stakingConnectionStaker.stake(startingBalance, 0)

    await advanceTime(accrualDays * 3600 * 24)

    //let expectedBalance = startingBalance * (1.000364 ** accrualDays)

    let expectedBalance = startingBalance * 1.14
    let actualBalance = await staking.totalStakedFor(staker1.address)


    console.log("Expected: ", expectedBalance.toString())
    console.log("Actual  : ", actualBalance.toString())
    console.log("Error   : ", (expectedBalance-actualBalance).toString())
    expect(expectedBalance - actualBalance)
      .to.be.below(1000)
  })

  it('30 years of unaccrued interest still fits into a block', async function() {
    const stakingConnectionOwner = staking.connect(reserveAccount)
    const stakingConnectionStaker = staking.connect(staker1)
    const tokenConnection = token.connect(staker1)

    let startingBalance = 567899 // keeping in mind that the token has 8 decimals
    let accrualDays = 365 * 30

    await stakingConnectionOwner.setInterestRate(100) // 100 of 1e-6 daily, should be ~3.7% APY
    await tokenConnection.approve(staking.address, totalSupply)
    await stakingConnectionStaker.stake(startingBalance, 0)

    await advanceTime(accrualDays * 3600 * 24)

    await stakingConnectionStaker.accrueInterest()
  })
})
