const { expect } = require('chai');

describe("Token minting tests", function () {
  let contractAdmin
  let transferAdmin
  let walletsAdmin
  let reserveAdmin
  let unprivileged
  let token

  beforeEach(async function () {
    const RestrictedToken = await ethers.getContractFactory('RestrictedToken')
    const TransferRules = await ethers.getContractFactory("TransferRules")
    const accounts = await ethers.getSigners()

    contractAdmin = accounts[0]
    transferAdmin = accounts[1]
    walletsAdmin = accounts[2]
    reserveAdmin = accounts[3]

    unprivileged = accounts[5]

    let rules = await TransferRules.deploy()
    token = await RestrictedToken.deploy(
      rules.address,
      contractAdmin.address,
      reserveAdmin.address,
      "xyz",
      "Ex Why Zee",
      6,
      100,
      1000
    )

    await token.connect(contractAdmin).grantTransferAdmin(transferAdmin.address)
  })

  it('has the correct test connfiguration', async () => {
    expect(await token.balanceOf(reserveAdmin.address))
      .to.equal(100, 'allocates all tokens to the token reserve admin')
  })

  it('can burn', async () => {
    await token.connect(reserveAdmin).burn(reserveAdmin.address, 17)
    expect(await token.balanceOf(reserveAdmin.address))
      .to.equal(83)
  })

  it('cannot burn more than address balance', async () => {
    await expect(token.connect(reserveAdmin).burn(reserveAdmin.address, 101))
      .to.revertedWith('Insufficent tokens to burn')
  })

  it('cannot mint more than the maxTotalSupply', async () => {
    expect(await token.maxTotalSupply())
      .to.equal(1000, 'should have max total supply')

    await expect(token.connect(reserveAdmin).mint(reserveAdmin.address, 901))
      .to.revertedWith(
        "Cannot mint more than the max total supply"
      )

    expect(await token.totalSupply())
      .to.equal(100, 'should not have increased the total tokens')

    await token.connect(reserveAdmin).mint(reserveAdmin.address, 900)

    expect(await token.totalSupply())
      .to.equal(1000, 'should have increased the total tokens')
    expect(await token.balanceOf(reserveAdmin.address))
      .to.equal(1000, 'should have minted the max number of tokens into the reserveAdmin address')
  })
})
