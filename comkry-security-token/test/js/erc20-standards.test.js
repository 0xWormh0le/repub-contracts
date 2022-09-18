const { expect } = require('chai');

describe("ERC20 functionality", function () {
    let contractAdmin
    let alice
    let bob
    let token

    beforeEach(async function () {
        const accounts = await ethers.getSigners()
        const TransferRules = await ethers.getContractFactory("TransferRules")
        const RestrictedToken = await ethers.getContractFactory("RestrictedToken")

        contractAdmin = accounts[0]
        transferAdmin = accounts[1]
        walletsAdmin = accounts[2]
        alice = accounts[3]
        bob = accounts[4]
        charlie = accounts[5]

        defaultGroup = 0

        const rules = await TransferRules.deploy()
        token = await RestrictedToken.deploy(
            rules.address,
            contractAdmin.address,
            alice.address,
            "xyz",
            "Ex Why Zee",
            6,
            100,
            1e6
        )

        await token.connect(contractAdmin).grantTransferAdmin(transferAdmin.address)
        await token.connect(contractAdmin).grantWalletsAdmin(walletsAdmin.address)
        await token.connect(transferAdmin).setAllowGroupTransfer(defaultGroup, defaultGroup, 1)
        await token.connect(walletsAdmin).setAddressPermissions(bob.address, defaultGroup, 0, 0, 200, false)
    })

    it('cannot receive tokens by default even in default group 0', async () => {
        await token.connect(walletsAdmin).setMaxBalance(charlie.address, 10)
        await expect(token.connect(alice).transfer(charlie.address, 50))
            .to.revertedWith('GREATER THAN RECIPIENT MAX BALANCE')
    })

    it('can do a simple transfer', async () => {
        await expect(token.connect(alice).transfer(bob.address, 50))
            .to.emit(token, 'Transfer')
            .withArgs(alice.address, bob.address, 50)
        expect(await token.balanceOf(bob.address))
            .to.equal(50)
    })

    it('can approve someone else', async () => {
        await expect(token.connect(alice).approve(bob.address, 20))
            .to.emit(token, 'Approval')
            .withArgs(alice.address, bob.address, 20)

        expect(await token.allowance(alice.address, bob.address))
            .to.equal(20)
        expect(await token.balanceOf(bob.address))
            .to.equal(0)
        expect(await token.balanceOf(alice.address))
            .to.equal(100)

        await token.connect(bob).transferFrom(alice.address, bob.address, 20)

        expect(await token.balanceOf(bob.address)).to.equal(20)
        expect(await token.balanceOf(alice.address)).to.equal(80)
        await expect(token.connect(bob).transferFrom(alice.address, bob.address, 1))
            .to.revertedWith('The approved allowance is lower than the transfer amount')
    })

    it('can safeApprove only when safeApprove value is 0', async () => {
        expect(await token.allowance(alice.address, bob.address)).to.equal(0)
        await expect(token.connect(alice).safeApprove(bob.address, 20))
            .to.emit(token, 'Approval')
            .withArgs(alice.address, bob.address, 20)
        expect(await token.allowance(alice.address, bob.address)).to.equal(20)

        await expect(token.connect(alice).safeApprove(bob.address, 1))
            .revertedWith('Cannot approve from non-zero to non-zero allowance')

        await expect(token.connect(alice).safeApprove(bob.address, 0))
            .to.emit(token, 'Approval')
            .withArgs(alice.address, bob.address, 0)

        expect(await token.allowance(alice.address, bob.address))
            .to.equal(0)
    })

    it('can increaseAllowance', async () => {
        await token.connect(alice).safeApprove(bob.address, 20)
        await expect(token.connect(alice).increaseAllowance(bob.address, 2))
            .to.emit(token, 'Approval')
            .withArgs(alice.address, bob.address, 22)
        expect(await token.allowance(alice.address, bob.address))
            .to.equal(22)
    })

    it('can increaseAllowance from 0', async () => {
        await expect(token.connect(alice).increaseAllowance(bob.address, 2))
            .emit(token, 'Approval')
            .withArgs(alice.address, bob.address, 2)
        expect(await token.allowance(alice.address, bob.address))
            .to.equal(2)
    })

    it('can decreaseAllowance', async () => {
        await token.connect(alice).safeApprove(bob.address, 20)
        await expect(token.connect(alice).decreaseAllowance(bob.address, 2))
            .emit(token, 'Approval')
            .withArgs(alice.address, bob.address, 18)
        expect(await token.allowance(alice.address, bob.address))
            .to.equal(18)
    })

    it('cannot transfer more tokens than you have', async () => {
        await expect(token.connect(alice).transfer(bob.address, 101))
            .to.revertedWith('Insufficent tokens')
    })

    it('cannot transfer more tokens than the account you are transferring from has', async () => {
        expect(await token.balanceOf(alice.address)).to.equal(100)
        await token.connect(alice).safeApprove(bob.address, 150)
        await expect(token.connect(bob).transferFrom(alice.address, bob.address, 101))
            .to.revertedWith('Insufficent tokens')
        expect(await token.balanceOf(alice.address))
            .to.equal(100)
    })
})
