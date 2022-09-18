const { expect } = require('chai');

describe("Integrated Scenarios", function (accounts) {
    let contractAdmin
    let reserveAdmin
    let transferAdmin
    let exchangeOmnibus
    let foreignInvestorS
    let foreignInvestorS2

    let groupDefault
    let groupReserve
    let groupExchange
    let groupForeignS
    let token

    beforeEach(async function () {
        const accounts = await ethers.getSigners()
        const TransferRules = await ethers.getContractFactory("TransferRules")
        const RestrictedToken = await ethers.getContractFactory("RestrictedToken")

        contractAdmin = accounts[0]
        transferAdmin = accounts[1]
        walletsAdmin = accounts[2]
        reserveAdmin = accounts[3]
        exchangeOmnibus = accounts[4]
        foreignInvestorS = accounts[5]
        foreignInvestorS2 = accounts[6]

        groupDefault = 0
        groupReserve = 1
        groupExchange = 2
        groupForeignS = 3

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

        // configure initial transferAdmin
        await token.connect(contractAdmin).grantTransferAdmin(transferAdmin.address)
        await token.connect(contractAdmin).grantWalletsAdmin(walletsAdmin.address)
    })

    it('can be setup correctly for Exchange and Reg S transfer restrictions with separate admin roles', async () => {
        // setup initial transfers groups
        // reserve account can transfer to anyone right away
        await token.connect(transferAdmin).setAllowGroupTransfer(groupReserve, groupExchange, 1)
        await token.connect(transferAdmin).setAllowGroupTransfer(groupReserve, groupForeignS, 1)
        await token.connect(walletsAdmin).setAddressPermissions(
            reserveAdmin.address,
            groupReserve,
            0,
            0,
            100,
            false
        )

        // // exchange allows Reg S to withdraw to their own accounts
        await token.connect(transferAdmin).setAllowGroupTransfer(groupExchange, groupForeignS, 1)
        await token.connect(walletsAdmin).setAddressPermissions(
            exchangeOmnibus.address,
            groupExchange,
            0,
            0,
            100,
            false
        )

        // // foreign Reg S can deposit into exchange accounts for trading on exchanges
        await token.connect(transferAdmin).setAllowGroupTransfer(groupForeignS, groupExchange, 1)
        await token.connect(walletsAdmin).setAddressPermissions(
            foreignInvestorS.address,
            groupForeignS,
            0,
            0,
            10,
            false
        )

        // // distribute tokens to the exchange for regulated token sale
        await token.connect(reserveAdmin).transfer(exchangeOmnibus.address, 50)
        expect(await token.balanceOf(exchangeOmnibus.address))
            .to.equal(50)

        await token.connect(exchangeOmnibus).transfer(foreignInvestorS.address, 3)
        expect(await token.balanceOf(exchangeOmnibus.address))
            .to.equal(47)
        expect(await token.balanceOf(foreignInvestorS.address))
            .to.equal(3)

        // Reg S can transfer back to the exchange
        await token.connect(transferAdmin).setAllowGroupTransfer(groupForeignS, groupExchange, 1)

        await token.connect(foreignInvestorS).transfer(exchangeOmnibus.address, 1)

        await token.connect(foreignInvestorS).transfer(exchangeOmnibus.address, 1)
        
        // Reg S cannot transfer to another Reg S
        await token.connect(walletsAdmin).setAddressPermissions(
            foreignInvestorS2.address,
            groupForeignS,
            0,
            0,
            10,
            false
        )

        await expect(token.connect(foreignInvestorS).transfer(foreignInvestorS2.address, 1))
            .to.revertedWith("TRANSFER GROUP NOT APPROVED")
    })
})

