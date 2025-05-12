#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const argv = require('yargs/yargs')(process.argv.slice(2))
  .usage('Usage: $0 -f [file]')
  .demandOption(['f'])
  .alias('f', 'file')
  .describe('f', 'Path to JSON file containing array of Bitcoin addresses')
  .argv;

const API_BASE = 'https://blockchain.info/balance?active=';

// Validate Bitcoin address format (simple regex, can be improved)
function isValidBitcoinAddress(address) {
  return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address);
}

async function fetchBalances(addresses) {
  try {
    // Blockchain.com API accepts addresses separated by '|'
    const url = API_BASE + addresses.join('|');
    const response = await axios.get(url);
    return response.data; // Object keyed by address with balance info
  } catch (error) {
    throw new Error(`API request failed: ${error.message}`);
  }
}

async function main() {
  try {
    const filePath = path.resolve(argv.file);
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }

    const data = fs.readFileSync(filePath, 'utf-8');
    let addresses = JSON.parse(data);

    if (!Array.isArray(addresses)) {
      console.error('Input file must contain a JSON array of Bitcoin addresses.');
      process.exit(1);
    }

    // Filter valid addresses
    addresses = addresses.filter(addr => {
      if (!isValidBitcoinAddress(addr)) {
        console.warn(`Invalid Bitcoin address skipped: ${addr}`);
        return false;
      }
      return true;
    });

    if (addresses.length === 0) {
      console.error('No valid Bitcoin addresses to check.');
      process.exit(1);
    }

    // Blockchain.com API has a limit on number of addresses per request (usually ~100)
    const chunkSize = 100;
    for (let i = 0; i < addresses.length; i += chunkSize) {
      const chunk = addresses.slice(i, i + chunkSize);
      console.log(`Checking batch ${i / chunkSize + 1} (${chunk.length} addresses)...`);

      const balances = await fetchBalances(chunk);

      for (const addr of chunk) {
        const info = balances[addr];
        if (info) {
          // balance is in satoshis
          console.log(`${addr}: confirmed balance = ${info.final_balance / 1e8} BTC`);
        } else {
          console.log(`${addr}: No data returned`);
        }
      }

      // Optional delay to avoid rate limits
      if (i + chunkSize < addresses.length) {
        await new Promise(res => setTimeout(res, 1500)); // 1.5 seconds delay
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
