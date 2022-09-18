const hre = require('hardhat')
const { expect } = require('chai')

let reserveAccount, token, batchTransfer, accounts
const decimals = 10
const totalSupply = 10000

describe('BatchTransfer', function () {
  beforeEach(async () => {
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

    const BatchTransfer = await hre.ethers.getContractFactory('BatchTransfer')
    batchTransfer = await BatchTransfer.deploy()
  })

  it('can transfer', async function () {
    await token.connect(reserveAccount).approve(batchTransfer.address, 6)
    await batchTransfer.connect(reserveAccount).batchTransfer(
      token.address,
      [accounts[1].address, accounts[2].address, accounts[3].address],
      [1, 2, 3])

    expect(await token.balanceOf(accounts[1].address)).to.equal(1)
    expect(await token.balanceOf(accounts[2].address)).to.equal(2)
    expect(await token.balanceOf(accounts[3].address)).to.equal(3)

    expect(await token.balanceOf(reserveAccount.address)).to.equal(totalSupply - 6)
  })

  it('will not allow less accounts than transfer amounts', async () => {
    await token.connect(reserveAccount).approve(batchTransfer.address, 6)

    let errorMessage
    try {
      await batchTransfer.connect(reserveAccount).batchTransfer(
        token.address,
        [accounts[1].address, accounts[2].address, accounts[3].address],
        [1, 2, 3, 4])
    } catch (e) {
      errorMessage = e.message
    }

    expect(errorMessage).to.match(/recipient & amount arrays must be the same length/)
    expect(await token.balanceOf(reserveAccount.address)).to.equal(totalSupply)
  })

  it('will not allow more accounts than transfer amounts', async () => {
    await token.connect(reserveAccount).approve(batchTransfer.address, 6)

    let errorMessage
    try {
      await batchTransfer.connect(reserveAccount).batchTransfer(
        token.address,
        [accounts[1].address, accounts[2].address],
        [1, 2, 3])
    } catch (e) {
      errorMessage = e.message
    }

    expect(errorMessage).to.match(/recipient & amount arrays must be the same length/)
    expect(await token.balanceOf(reserveAccount.address)).to.equal(totalSupply)
  })

  it('reverts all transfers if any recipient is the 0 address', async () => {
    await token.connect(reserveAccount).approve(batchTransfer.address, 6)

    let errorMessage
    try {
      await batchTransfer.connect(reserveAccount).batchTransfer(
        token.address,
        [accounts[1].address, accounts[2].address, '0x0000000000000000000000000000000000000000'],
        [1, 2, 3])
    } catch (e) {
      errorMessage = e.message
    }

    expect(errorMessage).to.match(/transfer to the zero address/)
    expect(await token.balanceOf(reserveAccount.address)).to.equal(totalSupply)
  })

  it('reverts all transfers if it runs out of tokens', async () => {
    await token.connect(reserveAccount).approve(batchTransfer.address, 6)

    let errorMessage
    try {
      await batchTransfer.connect(reserveAccount).batchTransfer(
        token.address,
        [accounts[1].address, accounts[2].address, accounts[3].address], [1, totalSupply, 3])
    } catch (e) {
      errorMessage = e.message
    }

    expect(errorMessage).to.match(/transfer amount exceeds balance/)
    expect(await token.balanceOf(reserveAccount.address)).to.equal(totalSupply)
  })

  it('can transfer to many recipients', async () => {
    const recipients = []
    const amounts = []
    const totalTransferQuantity = 500
    await token.connect(reserveAccount).approve(batchTransfer.address, totalTransferQuantity)
    for (let i = 1; i <= totalTransferQuantity; i++) {
      recipients.push(accounts[1].address)
      amounts.push(1)
    }

    await batchTransfer.connect(reserveAccount).batchTransfer(
      token.address, recipients, amounts)

    expect(await token.balanceOf(accounts[1].address)).to.equal(totalTransferQuantity)

    expect(await token.balanceOf(reserveAccount.address)).to.equal(totalSupply - totalTransferQuantity)
  })
})
