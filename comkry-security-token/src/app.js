window.Web3 = require('web3')
window._ = {}
var _ = window._

_.message = (message) => {
    var elem = document.querySelector("#messages")
    elem.innerHTML += message
    elem.innerHTML += '<br /><br />'
}

_.pretty = (payload) => {
    return JSON.stringify(payload, null, 2).replace(/,/g, ",<br />")
}

_.getABI = async function getABI(path) {
    return await fetch(path).then(async (response) => {
        return await response.json()
    })
}

_.sendEtherFrom = async function sendEtherFrom(account, callback) {
    const method = 'eth_sendTransaction'
    const parameters = [{
        from: yourAccount,
        to: yourAccount,
        gasPrice: gasPrice,
        value: weiValueInHex,
        //data: '0x0000000000000001' // message / function call to a smart contract
    }]
    const from = account
    const payload = {
        method: method,
        params: parameters,
        from: from,
    }

    ethereum.sendAsync(payload, function (err, response) {
        if (response.error) {
            _.message(`Rejected: ${response.error.message}`)
        }
        if (response.result) {
            const txHash = response.result
            _.message(`Paid transaction: ${txHash}`)
            _.message(`Payment details:<br />${_.pretty(payload)}`)
            _.pollForCompletion(txHash, callback)
        }
    })
}

_.pollForCompletion = function pollForCompletion(txHash, callback) {
    let calledBack = false
    const checkInterval = setInterval(function () {
        const notYet = 'response has no error or result'
        ethereum.sendAsync({
            method: 'eth_getTransactionByHash',
            params: [txHash],
        }, function (err, response) {
            if (calledBack) return
            if (err || response.error) {
                if (err.message.includes(notYet)) {
                    return 'transactiion is not yet mined'
                }

                callback(err || response.error)
            }

            const transaction = response.result
            clearInterval(checkInterval)
            calledBack = true
            callback(null, transaction)
        })
    }, 2000)
}

_.render = async function render(web3) {
    let addr = await web3.eth.getCoinbase()
    let claimsBuildJson = await _.getABI('/contracts/RestrictedToken.json')
    let abi = claimsBuildJson["abi"]
    let contractAddress = claimsBuildJson['networks'][5777]["address"]
    
    let token = new web3.eth.Contract(abi, contractAddress)
    window.token = token

    document.querySelector('#wallet-address').textContent = addr
    document.querySelector('#token-address').textContent = contractAddress
    document.querySelector('#wallet-balance').textContent = await token.methods.balanceOf(addr).call()
    document.querySelector('#token-name').textContent = await token.methods.name().call()
    document.querySelector('#token-symbol').textContent = await token.methods.symbol().call()
    document.querySelector('#token-total-supply').textContent = await token.methods.totalSupply().call()
}