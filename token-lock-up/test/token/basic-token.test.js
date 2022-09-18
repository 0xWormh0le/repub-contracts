const hre = require('hardhat')
const { expect } = require('chai')

let reserveAccount, recipientAccount, token
const decimals = 10
const totalSupply = 10000

describe('Token functionality', function () {
  beforeEach(async () => {
    const accounts = await hre.ethers.getSigners()

    reserveAccount = accounts[0]
    recipientAccount = accounts[1]

    const Token = await hre.ethers.getContractFactory('Token')
    token = await Token.deploy(
      'Test Scheduled Release Token',
      'SCHR',
      decimals,
      totalSupply,
      [accounts[0].address],
      [totalSupply]
    )
  })

  it('deploys a token with the expected details', async function () {
    expect(await token.name()).to.equal('Test Scheduled Release Token')
    expect(await token.symbol()).to.equal('SCHR')
    expect(await token.decimals()).to.equal(decimals)

    expect(await token.totalSupply()).to.equal(totalSupply)
    expect(await token.balanceOf(reserveAccount.address)).to.equal(totalSupply)

    await (token.connect(reserveAccount).transfer(recipientAccount.address, 30))

    expect(await token.balanceOf(recipientAccount.address)).to.equal(30)
    expect(await token.balanceOf(reserveAccount.address)).to.equal(totalSupply - 30)
  })

  it('cannot mint tokens', async function () {
    try {
      await token.mint(reserveAccount.address, 100)
    } catch (e) {
      expect(e.message).to.equal('token.mint is not a function')
    }
  })

  it('no freeze function', async function () {
    try {
      await token.freeze(reserveAccount.address)
    } catch (e) {
      expect(e.message).to.equal('token.freeze is not a function')
    }
  })

  it('can burn own tokens', async function () {
    expect(await token.balanceOf(reserveAccount.address)).to.equal(totalSupply)
    await token.burn(10)
    expect(await token.balanceOf(reserveAccount.address)).to.equal(totalSupply - 10)
  })

  it('can transfer', async function () {
    await token.transfer(recipientAccount.address, 1)

    expect(await token.balanceOf(recipientAccount.address)).to.equal(1)
    expect(await token.balanceOf(reserveAccount.address)).to.equal(totalSupply - 1)
  })
  //
  // it('cannot transfer more tokens than you have', async () => {
  //   expect(await token.balanceOf(reserveAccount.address)).to.equal(totalSupply)
  //   await token.transfer(recipientAccount.address, totalSupply + 1)
  //
  //   expect(await token.balanceOf(recipientAccount.address)).to.equal(0)
  //   expect(await token.balanceOf(reserveAccount.address)).to.equal(totalSupply)
  // })
  //
  // it('cannot transfer more tokens than the account you are transferring from has', async () => {
  //   expect(await token.balanceOf.call(alice)).to.equal(totalSupply)
  //   await token.safeApprove(bob.address, 150, {
  //     from: alice.address
  //   })
  //
  //   await truffleAssert.reverts(token.transferFrom(alice, bob, 101, {
  //     from: bob
  //   }), "Insufficent tokens")
  //   assert.equal(await token.balanceOf.call(alice), 100)
  // })

  // it('can safeApprove only when safeApprove value is 0', async () => {
  //   assert.equal(await token.allowance(alice, bob), 0)
  //
  //   let tx = await token.safeApprove(bob, 20, {
  //     from: alice
  //   })
  //
  //   assert.equal(await token.allowance(alice, bob), 20)
  //
  //   truffleAssert.eventEmitted(tx, 'Approval', (ev) => {
  //     assert.equal(ev.owner, alice)
  //     assert.equal(ev.spender, bob)
  //     assert.equal(ev.value, 20)
  //     return true
  //   })
  //
  //   await truffleAssert.reverts(token.safeApprove(bob, 1, {
  //     from: alice
  //   }), "Cannot approve from non-zero to non-zero allowance")
  //
  //   let tx2 = await token.safeApprove(bob, 0, {
  //     from: alice
  //   })
  //
  //   truffleAssert.eventEmitted(tx2, 'Approval', (ev) => {
  //     assert.equal(ev.owner, alice)
  //     assert.equal(ev.spender, bob)
  //     assert.equal(ev.value, 0)
  //     return true
  //   })
  //
  //   assert.equal(await token.allowance(alice, bob), 0)
  // })

  // it('can increaseAllowance', async () => {
  //   token.safeApprove(bob, 20, {
  //     from: alice
  //   })
  //
  //   let tx = await token.increaseAllowance(bob, 2, {
  //     from: alice
  //   })
  //
  //   truffleAssert.eventEmitted(tx, 'Approval', (ev) => {
  //     assert.equal(ev.owner, alice)
  //     assert.equal(ev.spender, bob)
  //     assert.equal(ev.value,22)
  //     return true
  //   })
  //
  //   assert.equal(await token.allowance(alice, bob), 22)
  // })

  // it('can increaseAllowance from 0', async () => {
  //   let tx = await token.increaseAllowance(bob, 2, {
  //     from: alice
  //   })
  //
  //   truffleAssert.eventEmitted(tx, 'Approval', (ev) => {
  //     assert.equal(ev.owner, alice)
  //     assert.equal(ev.spender, bob)
  //     assert.equal(ev.value,2)
  //     return true
  //   })
  //
  //   assert.equal(await token.allowance(alice, bob), 2)
  // })
  //
  // it('can decreaseAllowance', async () => {
  //   token.safeApprove(bob, 20, {
  //     from: alice
  //   })
  //
  //   let tx = await token.decreaseAllowance(bob, 2, {
  //     from: alice
  //   })
  //
  //   truffleAssert.eventEmitted(tx, 'Approval', (ev) => {
  //     assert.equal(ev.owner, alice)
  //     assert.equal(ev.spender, bob)
  //     assert.equal(ev.value,18)
  //     return true
  //   })
  //
  //   assert.equal(await token.allowance(alice, bob), 18)
  // })
  //
  // it('cannot transfer more tokens than you have', async () => {
  //   await truffleAssert.reverts(token.transfer(bob, 101, {
  //     from: alice
  //   }), "Insufficent tokens")
  // })
  //
})
