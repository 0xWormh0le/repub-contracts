const { expect } = require('chai');

describe("Freezes", function () {
  let contractAdmin
  let reserveAdmin
  let token
  let transferAdmin

  beforeEach(async function () {
    const accounts = await ethers.getSigners()
    const TransferRules = await ethers.getContractFactory("TransferRules")
    const RestrictedToken = await ethers.getContractFactory("RestrictedToken")

    contractAdmin = accounts[0]
    transferAdmin = accounts[1]
    walletsAdmin = accounts[2]
    reserveAdmin = accounts[3]
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
    await token.connect(walletsAdmin).setMaxBalance(alice.address, 1000)
    await token.connect(walletsAdmin).setMaxBalance(bob.address, 100)
    await token.connect(transferAdmin).setAllowGroupTransfer(0, 0, 1)
  })

  it('Accounts can be frozen and prohibit outgoing transfers', async () => {
    await token.connect(reserveAdmin).transfer(alice.address, 10)
    await token.connect(reserveAdmin).freeze(alice.address, true)

    expect(await token.detectTransferRestriction(alice.address, bob.address, 1))
      .to.equal(5)

    await expect(token.connect(alice).transfer(bob.address, 2))
      .to.revertedWith("SENDER ADDRESS IS FROZEN")
  })

  it('Accounts can be frozen by wallets admin', async () => {
    await token.connect(walletsAdmin).freeze(alice.address, true)

    expect(await token.getFrozenStatus(alice.address))
      .to.equal(true)
  })

  it('Accounts can be frozen by reserve admin', async () => {
    await token.connect(reserveAdmin).freeze(alice.address, true)

    expect(await token.getFrozenStatus(alice.address))
      .to.equal(true)
  })

  it('Accounts can be frozen and prohibit incoming transfers', async () => {
    await token.connect(reserveAdmin).transfer(alice.address, 10)

    await token.connect(reserveAdmin).freeze(bob.address, true)

    expect(await token.detectTransferRestriction(alice.address, bob.address, 1))
      .to.equal(9)

    await expect(token.connect(alice).transfer(bob.address, 2))
      .to.revertedWith('RECIPIENT ADDRESS IS FROZEN')
  })

  it('contract admin can pause and unpause all transfers', async () => {
    expect(await token.isPaused())
      .to.equal(false)
    await token.connect(contractAdmin).pause()

    expect(await token.isPaused())
      .to.equal(true)
    expect(await token.detectTransferRestriction(reserveAdmin.address, alice.address, 1))
      .to.equal(6)

    await token.connect(contractAdmin).unpause()
    expect(await token.isPaused())
      .to.equal(false)
  })
})
