const { expect } = require('chai');

describe('Getters and setters', () => {
  let rules, token
  let owner
  let accounts

  beforeEach(async () => {
    const RestrictedToken = await ethers.getContractFactory('RestrictedToken')
    const TransferRules = await ethers.getContractFactory("TransferRules")

    accounts = await ethers.getSigners()
    owner = accounts[2]
    rules = await TransferRules.deploy()
    token = await RestrictedToken.deploy(
      rules.address,
      owner.address,
      owner.address,
      "xyz",
      "Ex Why Zee",
      0,
      100,
      1e6
    )
    token = token.connect(owner)

    token.grantTransferAdmin(owner.address);
  })

  it('getters and setters', async () => {
    expect(await token.balanceOf(owner.address))
      .to.equal(100, 'bad getter value')

    expect(await token.getMaxBalance(owner.address))
      .to.equal(0, "bad getter value")

    expect(await token.getTotalLocksUntil(owner.address))
      .to.equal(0, "bad getter value")

    expect(await token.getTransferGroup(owner.address))
      .to.equal(0, "bad getter value")

    expect(await token.getFrozenStatus(owner.address))
      .to.equal(false, "default is not frozen")
  })

  it('GetAllowTransferTime', async () => {
    const alice = accounts[0];
    const bob = accounts[1];

    expect (await token.getAllowTransferTime(alice.address, bob.address))
      .to.equal(0, "default to time 0 for all addresses")

    // allow alice and bob's default group (0) to trade after timestamp 100
    await token.setAllowGroupTransfer(0, 0, 100);
    expect(await token.getAllowTransferTime(alice.address, bob.address))
      .to.equal(100, "transfer group timestamp not properly set")
  })
})
