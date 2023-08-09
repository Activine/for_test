# Hardhat template, default wrapper

## < Project Name > smart contracts

This repo will have a code of Lottery Smart Contracts.

## Setting project

### Install dependencies

```sh
npm install
```

---

### Compile contracts

```sh
npm compile
```

---

### Migrate contracts

```sh
npm migrate:<NETWORK> (mainnet, goerli, polygon, polygonMumbai, bsc, bscTestnet)
```

---

### Verify contracts

To verify the contract, you must specify the names of the contracts for verification through "," WITHOUT SPACES

```sh
npm verify:<NETWORK> <NAME_CONTRACT_FIRST>,<NAME_CONTRACT_SECOND>
```

---

### Tests contracts

```sh
# Run Tests
npm test

# Run test watcher
npm test:watch
```

---

### Node hardhat(Localfork)

NOTE:// To work with a node or fork, you need to run the node in a separate console

```sh
# Run Node hardhat (For run localfork setting config { FORK_ENABLED: true, FORK_PROVIDER_URI: "https://...."})
npm node

# Run test watcher
yarn test:node
```

---

### Coverage

```sh
npm coverage
```

---

### Gas reporter

You can start the gas reporter either through a separate gas reporter script through "**yarn**" or by changing the variable in the config "**GAS_REPORTER.ENABLED**" when running tests

```sh
# Native gas reporter
npm gas-reporter

# GAS_REPORTER.ENABLED = true
npm test
```

---

### Clean

```sh
# Rm artifacts, cache, typechain-types
npm clean

# Rm deployments for choose network
npm clean:deployments <NETWORK>
```

### Linter

```sh
# Checking code style for .ts, .sol
npm lint

# Run fix code style for .ts, .sol
npm lint:fix

# Checking code style for .ts
npm lint:ts

# Run fix code style for .ts
npm lint:ts:fix

# Checking code style for .sol
npm lint:sol

# Run fix code style for .sol
npm lint:sol:fix
```

## Auto audit with slither

To run the analyzer, you must first install it globally

To audit all contracts, use the command :

```sh
slither .
```

To exclude warnings in subsequent audits, use :

```sh
slither . --triage
```

## Deployment config

```
{
  "INFURA_KEY": "",
  "DEPLOYER_KEY": "",
  "ETHERSCAN_API_KEY": "",
  "POLYGONSCAN_API_KEY": "",
  "BSCSCAN_API_KEY": "",
  "GAS_PRICE": "",
  "NODE": {
    "GAS_PRICE": "auto",
    "LOGGING": true,
    "FORK": {
      "FORK_PROVIDER_URI": "",
      "FORK_ENABLED": false
    }
  },
  "GAS_REPORTER": {
    "ENABLED": false,
    "COINMARKETCAP": "",
    "CURRENCY": "USD",
    "TOKEN": "ETH",
    "GAS_PRICE_API": "https://api.etherscan.io/api?module=proxy&action=eth_gasPrice"
  },
  "DEPLOY": {}
}
```
