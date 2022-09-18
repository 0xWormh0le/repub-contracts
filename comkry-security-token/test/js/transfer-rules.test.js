const { expect } = require('chai');

describe("Transfer rules", function () {
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

    await token.connect(reserveAdmin).mint(alice.address, 40)
  })

  it('contract contractAdmin is not the same address as treasury admin', async () => {
    expect(await token.balanceOf(contractAdmin.address))
      .to.equal(0, 'allocates no balance to the contractAdmin')
    expect(await token.balanceOf(reserveAdmin.address))
      .to.equal(100, 'allocates all tokens to the token reserve admin')
  })

  it('cannot exceed the max balance of an address', async () => {
    await token.connect(walletsAdmin).setMaxBalance(unprivileged.address, 2)
    await token.connect(transferAdmin).setAllowGroupTransfer(0, 0, 1)

    await token.connect(reserveAdmin).transfer(unprivileged.address, 1)

    await expect(token.connect(reserveAdmin).transfer(unprivileged.address, 2))
      .to.revertedWith(
        "GREATER THAN RECIPIENT MAX BALANCE"
      )

    expect(await token.balanceOf(unprivileged.address))
      .to.equal(1)

    await token.connect(reserveAdmin).transfer(unprivileged.address, 1)

    expect(await token.balanceOf(unprivileged.address))
      .to.equal(2)
  })

  it('cannot transfer from a frozen address', async () => {
    await token.connect(walletsAdmin).freeze(alice.address, true)

    await expect(token.connect(alice).transfer(bob.address, 5))
      .to.revertedWith('SENDER ADDRESS IS FROZEN')
  })

  it('cannot transfer to a frozen address', async () => {
    await token.connect(walletsAdmin).freeze(bob.address, true)

    await expect(token.connect(alice).transfer(bob.address, 5))
      .to.revertedWith('RECIPIENT ADDRESS IS FROZEN')
  })
})
