'use strict';
const yargs =  require('yargs')
const util = require('util')

const argv = yargs
    .option('tokenAddress',{
        alias: 't',
        description: 'address of the restricted token to check balances',
        type: 'string',
        demand: 'ERROR: you must specify the token you want to check balances for'
    })
    .help('help')
    .usage('Usage: $0 -t [address]')
    .argv

global.artifacts = artifacts;
global.web3 = web3;

async function main(){
    const newtworkType = await web3.eth.net.getNetworkType();
    const networkId = await web3.eth.net.getId();
    console.log("network type:"+newtworkType);
    console.log("network id:"+networkId);

    const RestrictedToken = await artifacts.require('RestrictedToken')
    const token = await RestrictedToken.at(argv.tokenAddress) 
    const sender = await web3.eth.getCoinbase()

    async function info(title, addr) {
       console.log("\n\n", title, '\n',
        addr, '\n',
        'Balance: ', (await token.balanceOf(addr)).toString(), '\n',
        'Transfer Group:', (await token.getTransferGroup(addr)).toString(), '\n',
        'Max Balance:', (await token.getMaxBalance(addr)).toString(), '\n',
        'Lock Until:', time((await token.getLockUntil(addr))).toString(), '\n',
        'Frozen:', (await token.getFrozenStatus(addr)).toString(), '\n',
        'Transfer Admin:', (await token.checkTransferAdmin(addr)).toString(), '\n',
        '\n'
        )
    }

    await info('Sender:', sender)
    // bin/test/test-transfer.csv addresses for dev environment test sends
    await info('Recipient 1:', '0x57ea4caa7c61c2f48ce26cd5149ee641a75f5f6f')
    await info('Recipient 2:', '0x45d245d054a9cab4c8e74dc131c289207db1ace4')
}

// For truffle exec
module.exports = function(callback) {
    main().then(() => callback()).catch(err => callback(err))
}

function time(unixTimestamp) {
    let time = new Date(unixTimestamp*1e3)
    return time.toLocaleString('en-us', {timeZone: 'UTC'})
}
