'use strict';

global.artifacts = artifacts;
global.web3 = web3;

async function main(){
    const newtworkType = await web3.eth.net.getNetworkType()
    const networkId = await web3.eth.net.getId()
    console.log("network type:"+newtworkType)
    console.log("network id:"+networkId)

    const senderWalletAddress = await web3.eth.getCoinbase()
    const RestrictedToken = await artifacts.require('RestrictedToken')
    const token = await RestrictedToken.deployed() 

    if(!(await token.checkTransferAdmin(senderWalletAddress))) await token.grantTransferAdmin(senderWalletAddress)
    await token.setAllowGroupTransfer(0, 0, 1)
    await token.setAllowGroupTransfer(0, 1, 1)
    await token.setAllowGroupTransfer(0, 2, 1)
    await token.setAllowGroupTransfer(0, 3, 1)
    await token.setAllowGroupTransfer(0, 4, 1)

    console.log('\n\nTest token blaster with:')
    console.log(`yarn truffle exec bin/blaster.js -t ${token.address} -c test/test_data/test-transfers.csv --network development`)
}

// For truffle exec
module.exports = function(callback) {
    main().then(() => callback()).catch(err => callback(err))
};