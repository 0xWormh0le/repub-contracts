// 'use strict';
const yargs =  require('yargs')
const util = require('util')

const argv = yargs
    .option('csv',{
        alias: 'c',
        description: 'path to the permissions and transfers csv file',
        type: 'string',
        demand: 'ERROR: You must specify the path of the csv file with token transfers and address permissions' 
    })
    .help('help')
    .usage('Usage: $0 --tokenAddress [address] --senderAddress [blockchain private key] --csv [path]')
    .argv

global.web3 = web3;

async function main(){
    const newtworkType = await web3.eth.net.getNetworkType();
    const networkId = await web3.eth.net.getId();
    var TokenBlaster = require('../src/token-blaster.js')
    console.log("network type:\t"+newtworkType);
    console.log("network id:\t"+networkId);
    console.log("CSV Path:\t", argv.csv)

    let results = await TokenBlaster.validateCSV(argv.csv)
    if(results.length == 0) {
        console.log('NO VALIDATION ERRORS FOUND')
    } else {
        console.log('VALIDATION ERRORS:')
        console.log(util.inspect(results, false, null, true))
        console.log('VALIDATION ERRORS FOUND!!!')
    }
}

// For truffle exec
module.exports = function(callback) {
    main().then(() => callback()).catch(err => callback(err))
};