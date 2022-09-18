const { expect } = require('chai')
const { currentTimestamp } = require('./helper')

describe('Max receiver balance', () => {
  let rules, token
  let tokenContractOwner
  let accounts

  beforeEach(async () => {
    const RestrictedToken = await ethers.getContractFactory('RestrictedToken')
    const TransferRules = await ethers.getContractFactory("TransferRules")
    const UserProxy = await ethers.getContractFactory("UserProxy")
    const accounts = await ethers.getSigners()

    tokenContractOwner = accounts[2]
    reserveAdmin = accounts[3]
    rules = await TransferRules.deploy()
    token = await RestrictedToken.deploy(
      rules.address,
      tokenContractOwner.address,
      tokenContractOwner.address,
      "xyz",
      "Ex Why Zee",
      0,
      100,
      1e6
    )
    token = token.connect(tokenContractOwner)

    await token.grantTransferAdmin(tokenContractOwner.address)
    await token.grantWalletsAdmin(tokenContractOwner.address)

    alice = await UserProxy.deploy(token.address);
    bob = await UserProxy.deploy(token.address);

    const timestamp = await currentTimestamp()

    await token.setAllowGroupTransfer(0, 0, timestamp); // don't restrict default group transfers
  })

  it('Admin can add account to whitelist and be approved for transfer', async () => {
    const restrictionCode = await token.detectTransferRestriction(
      alice.address,
      bob.address,
      17
    )

    await token.setMaxBalance(bob.address, 10);
    expect(await token.detectTransferRestriction(
      alice.address,
      bob.address,
      10
    )).to.equal(0, 'should allow max value')

    await token.setMaxBalance(bob.address, 1);
    expect(await token.detectTransferRestriction(
      alice.address,
      bob.address,
      10
    )).to.equal(1, "should not allow a value transfer above the max for the recipient address")
  })

  it('Get Max Balance', async () => {
    expect(await token.getMaxBalance(alice.address))
      .to.equal(0, "wrong balance for alice")
    await token.setMaxBalance(alice.address, 10);
    expect(await token.getMaxBalance(alice.address))
      .to.equal(10, "wrong balance for alice")
  })
})
