const { task } = require('hardhat/config');
const readline = require('readline');
const fs = require('fs');
const { Buffer } = require('buffer');
const getSignature = require('../libs/signer')

const readChunkSync = (filePath, { length, startPosition }) => {
  let buffer = Buffer.alloc(length);
  const fileDescriptor = fs.openSync(filePath, 'r');

  try {
    const bytesRead = fs.readSync(fileDescriptor, buffer, {
      length,
      position: startPosition,
    });

    if (bytesRead < length) {
      buffer = buffer.slice(0, bytesRead);
    }

    return buffer;
  } finally {
    fs.closeSync(fileDescriptor);
  }
}

const chunkSize = 50000

const formatSecs = secs => {
  const mins = Math.floor(secs / 60)
  const hours = Math.floor(secs / 3600)
  const days = Math.floor(secs / 3600 / 24)

  if (secs < 60) {
    return `${secs}s`
  } else if (mins < 60) {
    return `${mins}m ${secs % 60}s`
  } else if (hours < 24) {
    return `${hours}h ${Math.round((secs % 3600) / 60)}m`
  } else {
    return `${days}d ${Math.round((secs % (3600 * 24)) / 3600)}h`
  }
}

/**
 * 
 * @param {string} privateKeyFile private key file path
 * @param {string} inputFile input file path
 * @param {string} outputFile output file path
 * @returns total claims
 */
const generateClaims = async (privateKeyFile, inputFile, outputFile) => {
  let readPos = 0, leftover = '', header = true, totalRecipients = 0
  let buffer

  const signerPrivateKey = fs.readFileSync(privateKeyFile, 'utf8')

  process.stdout.write("🪂 Generating claims...\n");
  process.stdout.write("");

  const fileStat = fs.statSync(inputFile)

  const startTime = Date.now()

  if (fs.existsSync(outputFile)) {
    fs.unlinkSync(outputFile)
  }

  do {
    buffer = readChunkSync(inputFile, { length: chunkSize, startPosition: readPos })

    const output = []
    const lines = (leftover + buffer.toString('utf8')).split(/\r?\n/)
    lines.slice(header ? 1 : 0, buffer.length > 0 ? lines.length - 1 : lines.length)
      .filter(line => line.length > 0)
      .forEach(line => {
        const [ recipient, amount ] = line.split(',')
        output.push([
          recipient,
          amount,
          getSignature(signerPrivateKey, { recipient, amount })
        ].join())
      })

    if (header) {
      fs.appendFileSync(
        outputFile,
        'recipient,amount,signedclaim\r\n',
        { encoding: 'utf8' }
      )
    }
    
    readPos += chunkSize
    totalRecipients += output.length
    leftover = lines[lines.length - 1]
    header = false

    fs.appendFileSync(
      outputFile,
      output.join('\r\n') + '\r\n',
      { encoding: 'utf8' }
    )

    const percent = Math.min(Math.floor(readPos * 100 / fileStat.size), 100)
    const estimation = Math.floor(
      (Date.now() - startTime) *
      Math.max((fileStat.size - readPos), 0) /
      readPos /
      1000
    )

    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`${totalRecipients} records processed (${percent} %), complete estimation: ${formatSecs(estimation)}`)
  } while (buffer.length > 0)

  console.log('') // prints a new line

  console.log(`Took ${formatSecs(Math.floor((Date.now() - startTime) / 1000))}`)

  return totalRecipients
}

module.exports = () => task("generate-claims", "Generate claims into CSV output with given claim signer priate key and airdrop csv")
  .addParam('privateKeyFile', 'File path that holds claim signer\'s private key')
  .addParam('inputFile', 'Input CSV file path')
  .addParam('outputFile', 'Output CSV file path')
  .setAction(async ({ privateKeyFile, inputFile, outputFile }) => {
    await generateClaims(privateKeyFile, inputFile, outputFile)
  })

module.exports.generateClaims = generateClaims
