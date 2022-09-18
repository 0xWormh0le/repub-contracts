const hre = require('hardhat')
const { expect } = require('chai')
let accounts, Token, reserveAccount, recipientAccount, decimals, cap
const the0Address = '0x0000000000000000000000000000000000000000'

describe('Token deployment', async () => {
  beforeEach(async () => {
    accounts = await hre.ethers.getSigners()
    Token = await hre.ethers.getContractFactory('Token')
    reserveAccount = accounts[0]
    recipientAccount = accounts[1]
    decimals = 10
    cap = 10000
  })

  it('deploys a token with the expected details', async () => {
    const token = await Token.deploy(
      'Test Scheduled Release Token',
      'SCHR',
      decimals,
      cap,
      [accounts[0].address],
      [cap]
    )

    expect(await token.name()).to.equal('Test Scheduled Release Token')
    expect(await token.symbol()).to.equal('SCHR')
    expect(await token.decimals()).to.equal(decimals)

    expect(await token.totalSupply()).to.equal(cap)
    expect(await token.balanceOf(reserveAccount.address)).to.equal(cap)
    expect(await token.cap()).to.equal(cap)
  })

  it('can mint to multiple addresses on deploy', async () => {
    const address0 = accounts[0].address
    const address1 = accounts[1].address
    const address2 = accounts[2].address

    const token = await Token.deploy(
      'Test Scheduled Release Token',
      'SCHR',
      decimals,
      33,
      [address0, address1, address2],
      [10, 11, 12]
    )

    expect(await token.totalSupply()).to.equal(33)
    expect(await token.balanceOf(address0)).to.equal(10)
    expect(await token.balanceOf(address1)).to.equal(11)
    expect(await token.balanceOf(address2)).to.equal(12)
  })

  it('can deploy a token with 0 decimals', async function () {
    decimals = 0

    const token = await Token.deploy(
      'Test Scheduled Release Token',
      'SCHR',
      decimals,
      cap,
      [accounts[0].address],
      [cap]
    )

    expect(await token.decimals()).to.equal(0)
    await token.transfer(recipientAccount.address, 1)

    expect(await token.balanceOf(recipientAccount.address)).to.equal(1)
    expect(await token.balanceOf(reserveAccount.address)).to.equal(cap - 1)
  })

  it('must have matching mint addresses and amounts', async () => {
    await expect(
      Token.deploy(
        'Test Scheduled Release Token',
        'SCHR',
        decimals,
        10,
        [accounts[0].address],
        [5, 5]
      )
    ).to.revertedWith('must have same number of mint addresses and amounts')
  })

  it('cannot mint the reserve to the 0 address', async () => {
    await expect(
      Token.deploy(
        'Test Scheduled Release Token',
        'SCHR',
        decimals,
        cap,
        [the0Address],
        [cap]
      )
    ).to.revertedWith('cannot have a non-address as reserve')
  })

  it('cannot mint more than the cap on deploy', async () => {
    cap = 100

    await expect(
      Token.deploy(
        'Test Scheduled Release Token',
        'SCHR',
        decimals,
        cap,
        [accounts[0].address, accounts[1].address],
        [cap, 1]
      )
    ).to.revertedWith('total supply of tokens cannot exceed the cap')
  })

  it('cannot have a totalSupply of 0', async () => {
    cap = 0

    await expect(
      Token.deploy(
        'Test Scheduled Release Token',
        'SCHR',
        decimals,
        cap,
        [accounts[0].address],
        [cap]
      )
    ).to.revertedWith('ERC20Capped: cap is 0')
  })
})
