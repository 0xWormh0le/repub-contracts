const { expect } = require('chai');

describe("Transfer restriction messages test", function () {
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

    let rules = await TransferRules.deploy()
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

  it('Transfer restriction messages are returned correctly', async () => {
    expect(await token.messageForTransferRestriction(0))
      .to.equal("SUCCESS" , "wrong message")
    expect(await token.messageForTransferRestriction(1))
      .to.equal("GREATER THAN RECIPIENT MAX BALANCE" , "wrong message")
    expect(await token.messageForTransferRestriction(2))
      .to.equal("SENDER TOKENS LOCKED" , "wrong message")
    expect(await token.messageForTransferRestriction(3))
      .to.equal("DO NOT SEND TO TOKEN CONTRACT" , "wrong message")
    expect(await token.messageForTransferRestriction(4))
      .to.equal("DO NOT SEND TO EMPTY ADDRESS" , "wrong message")
    expect(await token.messageForTransferRestriction(5))
      .to.equal("SENDER ADDRESS IS FROZEN" , "wrong message")
    expect(await token.messageForTransferRestriction(6))
      .to.equal("ALL TRANSFERS PAUSED" , "wrong message")
    expect(await token.messageForTransferRestriction(7))
      .to.equal("TRANSFER GROUP NOT APPROVED" , "wrong message")
    expect(await token.messageForTransferRestriction(8))
      .to.equal("TRANSFER GROUP NOT ALLOWED UNTIL LATER" , "wrong message")
    })
})
