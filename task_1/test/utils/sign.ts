import { ethers } from "hardhat";

const marketplaceType = {
  SignData: [
    { name: "amount", type: "uint8" },
    { name: "buyer", type: "address" },
    { name: "uri", type: "string[]" },
  ],
};

const signMarketplaceDataByUser = async (
  domain: any, amount: any, buyer: any, uri: any, user: any
  ) => ethers.utils.splitSignature(
  await user._signTypedData(domain, marketplaceType, {
    amount,
    buyer,
    uri,
  })
);
module.exports = { signMarketplaceDataByUser };
