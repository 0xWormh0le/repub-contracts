const hre = require('hardhat')
const chai = require('chai')
const { expect } = chai
const { solidity } = require('ethereum-waffle')
chai.use(solidity)

async function currentTimestamp (offsetInSeconds = 0) {
  return (await hre.ethers.provider.getBlock()).timestamp + offsetInSeconds
}

async function exactlyMoreThanOneDayAgo () {
  return await currentTimestamp(-3601)
}
const maxUint = '115792089237316195423570985008687907853269984665640564039457584007913129639935'
describe('TokenLockup unlock scheduling', async function () {
  let tokenLockup, token, reserveAccount, recipient, accounts, allowedAccount, allowedAccountRecipient
  const decimals = 10
  const totalSupply = maxUint

  beforeEach(async () => {
    accounts = await hre.ethers.getSigners()

    reserveAccount = accounts[0]
    recipient = accounts[1]

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
      30, // low minimum to force rounding issues
      346896000 // 11 years
    )

    const totalRecipientAmount = 100
    const totalBatches = 2
    const firstDelay = 0
    const firstBatchBips = 5000 // 8%
    const batchDelay = 3600 * 24 * 4 // 4 days
    const commence = await exactlyMoreThanOneDayAgo()
    allowedAccount = accounts[3]
    allowedAccountRecipient = accounts[4]

    await token.connect(reserveAccount).approve(tokenLockup.address, totalRecipientAmount)

    await tokenLockup.connect(reserveAccount).createReleaseSchedule(
      totalBatches,
      firstDelay,
      firstBatchBips,
      batchDelay
    )

    await tokenLockup.connect(reserveAccount).fundReleaseSchedule(
      recipient.address,
      100,
      commence,
      0, // scheduleId
      []
    )
  })

  it('token approval emits an event', async () => {
    await expect(tokenLockup.connect(recipient).approve(allowedAccount.address, 7))
      .to.emit(tokenLockup, 'Approval')
      .withArgs(recipient.address, allowedAccount.address, 7)
  })

  it('unlocked tokens can be transferred by an approved account with balances from multiple lockups', async () => {
    expect(await tokenLockup.connect(recipient).balanceOf(recipient.address)).to.equal(100)
    expect(await tokenLockup.connect(recipient).allowance(recipient.address, allowedAccount.address)).to.equal(0)

    await tokenLockup.connect(recipient).approve(allowedAccount.address, 7)
    expect(await tokenLockup.connect(recipient).allowance(recipient.address, allowedAccount.address)).to.equal(7)
    await tokenLockup.connect(allowedAccount).transferFrom(recipient.address, allowedAccountRecipient.address, 7)
  })

  it('increaseAllowance and decreaseAllowance work', async () => {
    expect(await tokenLockup.connect(recipient).balanceOf(recipient.address)).to.equal(100)
    expect(await tokenLockup.connect(recipient).allowance(recipient.address, allowedAccount.address)).to.equal(0)

    await tokenLockup.connect(recipient).approve(allowedAccount.address, 7)
    expect(await tokenLockup.connect(recipient).allowance(recipient.address, allowedAccount.address)).to.equal(7)

    await expect(tokenLockup.connect(recipient).increaseAllowance(allowedAccount.address, 5))
      .to.emit(tokenLockup, 'Approval')
      .withArgs(recipient.address, allowedAccount.address, 12)

    expect(await tokenLockup.connect(recipient).allowance(recipient.address, allowedAccount.address)).to.equal(12)

    await expect(tokenLockup.connect(recipient).decreaseAllowance(allowedAccount.address, 1))
      .to.emit(tokenLockup, 'Approval')
      .withArgs(recipient.address, allowedAccount.address, 11)

    expect(await tokenLockup.connect(recipient).allowance(recipient.address, allowedAccount.address)).to.equal(11)

    await tokenLockup.connect(allowedAccount).transferFrom(recipient.address, allowedAccountRecipient.address, 11)
  })

  it('increaseAllowance cannot overflow approval max integer value', async () => {
    await tokenLockup.connect(recipient).approve(allowedAccount.address,
      maxUint)

    expect(await tokenLockup.connect(recipient)
      .allowance(recipient.address, allowedAccount.address))
      .to.equal(maxUint)

    let errorMessage
    try {
      await tokenLockup.connect(recipient).increaseAllowance(allowedAccount.address, 1)
    } catch (e) {
      errorMessage = e.message
    }
    expect(errorMessage).to.match(/Transaction reverted/)
    expect(await tokenLockup.connect(recipient)
      .allowance(recipient.address, allowedAccount.address))
      .to.equal(maxUint)
  })

  it('cannot pass in a value greater than max uint256 value to approve()', async () => {
    let errorMessage
    try {
      await tokenLockup.connect(recipient).approve(allowedAccount.address,
        '115792089237316195423570985008687907853269984665640564039457584007913129639936')
    } catch (e) {
      errorMessage = e.message
    }
    expect(errorMessage).to.match(/value out-of-bounds/)
  })

  it('cannot decreaseAllowance to below 0', async () => {
    expect(await tokenLockup.connect(recipient).balanceOf(recipient.address)).to.equal(100)
    expect(await tokenLockup.connect(recipient).allowance(recipient.address, allowedAccount.address)).to.equal(0)

    let errorMessage
    try {
      await tokenLockup.connect(recipient).decreaseAllowance(allowedAccount.address, 1)
    } catch (e) {
      errorMessage = e.message
    }
    expect(errorMessage).to.match(/decrease > allowance/)
    expect(await tokenLockup.connect(recipient).allowance(recipient.address, allowedAccount.address)).to.equal(0)
  })

  it('cannot transferFrom approved amount that exceeds that locked token amount', async () => {
    expect(await tokenLockup.connect(recipient).balanceOf(recipient.address)).to.equal(100)
    expect(await tokenLockup.connect(recipient).unlockedBalanceOf(recipient.address)).to.equal(50)
    expect(await tokenLockup.connect(recipient).allowance(recipient.address, allowedAccount.address)).to.equal(0)

    await tokenLockup.connect(recipient).approve(allowedAccount.address, 100) // more than unlocked less than balance
    expect(await tokenLockup.connect(recipient).allowance(recipient.address, allowedAccount.address)).to.equal(100)
    let errorMessage
    try {
      await tokenLockup.connect(allowedAccount).transferFrom(recipient.address, allowedAccountRecipient.address, 51)
    } catch (e) {
      errorMessage = e.message
    }
    expect(errorMessage).to.match(/amount > unlocked/)
  })

  it('cannot transferFrom amount that exceeds approved amount', async () => {
    expect(await tokenLockup.connect(recipient).balanceOf(recipient.address)).to.equal(100)
    expect(await tokenLockup.connect(recipient).unlockedBalanceOf(recipient.address)).to.equal(50)
    expect(await tokenLockup.connect(recipient).allowance(recipient.address, allowedAccount.address)).to.equal(0)

    await tokenLockup.connect(recipient).approve(allowedAccount.address, 1) // enough unlocked, not enough for transfer
    expect(await tokenLockup.connect(recipient).allowance(recipient.address, allowedAccount.address)).to.equal(1)
    let errorMessage
    try {
      await tokenLockup.connect(allowedAccount).transferFrom(recipient.address, allowedAccountRecipient.address, 2)
    } catch (e) {
      errorMessage = e.message
    }
    expect(errorMessage).to.match(/value > allowance/)
  })

  it('cannot approve transfer to the 0x0 address', async () => {
    let errorMessage
    try {
      await tokenLockup.connect(recipient).approve('0x0000000000000000000000000000000000000000', 1) // enough unlocked, not enough for transfer
    } catch (e) {
      errorMessage = e.message
    }
    expect(errorMessage).to.match(/spender is 0 address/)
    expect(await tokenLockup.allowance(recipient.address, allowedAccount.address)).to.equal(0)
  })

  it('cannot approve transfer from the 0x0 address', async () => {
    let errorMessage
    try {
      await tokenLockup.connect('0x0000000000000000000000000000000000000000').approve(recipient.address, 1) // enough unlocked, not enough for transfer
    } catch (e) {
      errorMessage = e.message
    }
    expect(errorMessage).to.match(/VoidSigner cannot sign transactions/)
    expect(await tokenLockup.allowance(recipient.address, allowedAccount.address)).to.equal(0)
  })
})
