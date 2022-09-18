const { expect } = require('chai');

describe("Restricted token basics", function (accounts) {
  let contractAdmin
  let reserveAdmin
  let unprivileged
  let token
  let transferAdmin

  beforeEach(async function () {
    const RestrictedToken = await ethers.getContractFactory('RestrictedToken')
    const TransferRules = await ethers.getContractFactory("TransferRules")
    const accounts = await ethers.getSigners()

    contractAdmin = accounts[0]
    transferAdmin = accounts[1]
    walletsAdmin = accounts[2]
    reserveAdmin = accounts[3]

    unprivileged = accounts[5]
    alice = accounts[6]
    bob = accounts[7]

    const rules = await TransferRules.deploy()
    token = await RestrictedToken.deploy(
      rules.address,
      contractAdmin.address,
      reserveAdmin.address,
      "xyz",
      "Ex Why Zee",
      6,
      100,
      1e6
    )

    await token.connect(contractAdmin).grantTransferAdmin(transferAdmin.address)

    await token.connect(contractAdmin).grantWalletsAdmin(walletsAdmin.address)
    
    await token.connect(transferAdmin).setAllowGroupTransfer(0, 0, 1)
  })

  it('token initialization and high-level parameters', async () => {
    expect(await token.symbol())
      .to.equal("xyz", "should return the token symbol")
    expect(await token.name())
      .to.equal("Ex Why Zee", "should return the token name")
    expect(await token.decimals())
      .to.equal(6, "should return the token decimals")
    expect(await token.totalSupply())
      .to.equal(100, "should return the totalSupply")
  })

  it('token admin setup', async () => {
    expect(await token.balanceOf(contractAdmin.address))
      .to.equal(0, "Contract owner should have 0 balance")
    expect(await token.balanceOf(reserveAdmin.address))
      .to.equal(100, "Reserve admin should have the entire supply")
  })

  it('transfer restriction success', async () => {
    expect(await token.detectTransferRestriction(contractAdmin.address, contractAdmin.address, 0))
      .to.equal(0, "transfer should be unrestricted")
  })

  it('allowance return value and setting', async () => {
    await token.connect(bob).approve(unprivileged.address, 10)
    await token.connect(bob).approve(unprivileged.address, 10)
    expect(await token.allowance(bob.address, unprivileged.address))
      .to.equal(10, "should have correct allowance")
  })
})
