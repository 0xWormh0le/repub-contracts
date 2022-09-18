const hre = require('hardhat')
const { expect } = require('chai')

let reserveAccount, token, accounts, tokenLockup, commence
const decimals = 10
const totalSupply = 50000

async function currentTimestamp (offsetInSeconds = 0) {
  return (await hre.ethers.provider.getBlock()).timestamp + offsetInSeconds
}

async function exactlyMoreThanOneDayAgo () {
  return await currentTimestamp(-3601)
}

describe('BatchTransfer fund release schedule', function () {
  beforeEach(async () => {
    commence = exactlyMoreThanOneDayAgo()
    accounts = await hre.ethers.getSigners()

    reserveAccount = accounts[0]

    const Token = await hre.ethers.getContractFactory('Token')
    token = await Token.deploy(
      'Test Scheduled Release Token',
      'SCHR',
      decimals,
      totalSupply,
      [accounts[0].address],
      [totalSupply]
    )

    const TokenLockup = await hre.ethers.getContractFactory('TokenLockup')
    tokenLockup = await TokenLockup.deploy(
      token.address,
      'Xavier Yolo Zeus Token Lockup Release Scheduler',
      'XYZ Lockup',
      30,
      346896000
    )

    const totalRecipientAmount = 6000
    const totalBatches = 2
    const firstDelay = 0
    const firstBatchBips = 5000 // 8%
    const batchDelay = 3600 * 24 * 4 // 4 days

    await token.connect(reserveAccount).approve(tokenLockup.address, totalRecipientAmount)

    await tokenLockup.connect(reserveAccount).createReleaseSchedule(
      totalBatches,
      firstDelay,
      firstBatchBips,
      batchDelay
    )
  })

  it('can transfer', async function () {
    await tokenLockup.connect(reserveAccount).batchFundReleaseSchedule(
      [accounts[1].address, accounts[2].address, accounts[3].address],
      [1000, 2000, 3000],
      [commence, commence, commence],
      [0, 0, 0],
      [])

    expect(await tokenLockup.balanceOf(accounts[1].address)).to.equal(1000)
    expect(await tokenLockup.unlockedBalanceOf(accounts[1].address)).to.equal(500)

    expect(await tokenLockup.balanceOf(accounts[2].address)).to.equal(2000)
    expect(await tokenLockup.unlockedBalanceOf(accounts[2].address)).to.equal(1000)

    expect(await tokenLockup.balanceOf(accounts[3].address)).to.equal(3000)
    expect(await tokenLockup.unlockedBalanceOf(accounts[3].address)).to.equal(1500)

    expect(await token.balanceOf(reserveAccount.address)).to.equal(totalSupply - 6000)
  })

  //
  it('will not allow less accounts than transfer amounts', async () => {
    let errorMessage
    try {
      await tokenLockup.connect(reserveAccount).batchFundReleaseSchedule(
        [accounts[1].address, accounts[3].address],
        [1000, 2000, 3000],
        [commence, commence, commence],
        [0, 0, 0],
        [])
    } catch (e) {
      errorMessage = e.message
    }

    expect(errorMessage).to.match(/mismatched array length/)
    expect(await token.balanceOf(reserveAccount.address)).to.equal(totalSupply)
  })

  it('will not allow more accounts than transfer amounts', async () => {
    let errorMessage
    try {
      await tokenLockup.connect(reserveAccount).batchFundReleaseSchedule(
        [accounts[1].address, accounts[3].address],
        [1000, 2000, 3000],
        [commence, commence, commence],
        [0, 0, 0],
        [])
    } catch (e) {
      errorMessage = e.message
    }

    expect(errorMessage).to.match(/mismatched array length/)
    expect(await token.balanceOf(reserveAccount.address)).to.equal(totalSupply)
  })

  it('reverts all transfers if any recipient is the 0 address', async () => {
    let errorMessage
    try {
      await tokenLockup.connect(reserveAccount).batchFundReleaseSchedule(
        [accounts[1].address, '0x0000000000000000000000000000000000000000', accounts[3].address],
        [1000, 2000, 3000],
        [commence, commence, commence],
        [0, 0, 0],
        [])
    } catch (e) {
      errorMessage = e.message
    }

    expect(errorMessage).to.match(/to 0 address/)
    expect(await token.balanceOf(reserveAccount.address)).to.equal(totalSupply)
  })

  it('reverts all transfers if it exceeds the approved number of tokens', async () => {
    let errorMessage
    try {
      await tokenLockup.connect(reserveAccount).batchFundReleaseSchedule(
        [accounts[1].address, accounts[2].address, accounts[3].address],
        [1000, 2000, 3001],
        [commence, commence, commence],
        [0, 0, 0],
        [])
    } catch (e) {
      errorMessage = e.message
    }

    expect(errorMessage).to.match(/transfer amount exceeds allowance/)
    expect(await token.balanceOf(reserveAccount.address)).to.equal(totalSupply)
  })

  it('can transfer to many recipients', async () => {
    const recipients = []
    const amounts = []
    const commencements = []
    const delays = []
    const totalTransferQuantity = 50
    await token.connect(reserveAccount).approve(tokenLockup.address, 50000)

    for (let i = 1; i <= totalTransferQuantity; i++) {
      recipients.push(accounts[1].address)
      amounts.push(1000)
      commencements.push(commence)
      delays.push(0)
    }

    await tokenLockup.connect(reserveAccount).batchFundReleaseSchedule(
      recipients,
      amounts,
      commencements,
      delays,
      [])

    expect(await tokenLockup.balanceOf(accounts[1].address)).to.equal(50000)
    expect(await tokenLockup.unlockedBalanceOf(accounts[1].address)).to.equal(25000)

    expect(await token.balanceOf(reserveAccount.address)).to.equal(0)
  })
})
