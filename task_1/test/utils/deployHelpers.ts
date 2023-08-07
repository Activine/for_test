import { expect } from "chai";
import { ethers, network } from "hardhat";
import { utils } from "ethers";

const { setBalance } = require("@nomicfoundation/hardhat-network-helpers");
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { LotteryTicket, TicketSale, IERC20 } from "../../types/typechain-types";
import { string } from "hardhat/internal/core/params/argumentTypes";
const { signMarketplaceDataByUser } = require("./sign");

export async function deploy() {
  let owner: SignerWithAddress,
    user: SignerWithAddress,
    user2: SignerWithAddress,
    usdt: IERC20,
    bnb: IERC20,
    usdtKeeper: SignerWithAddress,
    bnbKeeper: SignerWithAddress,
    vrfCoordinator: any,
    lottery: TicketSale,
    lotteryTicket: LotteryTicket;

  let MINTER_ROLE: string, OPERATOR_ROLE: string;
  const day = 86400n;

  const keyHash = "0x8af398995b04c28e9951adb9721ef74c74f93e6a478f39e7e0777be13527e7ef";

  const contractUSDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
  const oracleUSDT = "0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46";
  const contractBNB = "0xB8c77482e45F1F44dE1745F52C74426C631bDD52";
  const oracleBNB = "0xc546d2d06144F9DD42815b8bA46Ee7B8FcAFa4a2";
  const bnbAcc = "0xB8c77482e45F1F44dE1745F52C74426C631bDD52";
  const usdtAcc = "0xC6CDE7C39eB2f0F0095F41570af89eFC2C1Ea828";
  [owner, user, user2] = await ethers.getSigners();

  // get instance TetherToken & BNBToken
  usdt = await ethers.getContractAt("IERC20", contractUSDT);

  bnb = await ethers.getContractAt("IERC20", contractBNB);
  // get control under usdtAccount & bnbAccount
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [usdtAcc],
  });

  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [bnbAcc],
  });

  usdtKeeper = await ethers.getSigner(usdtAcc);
  console.log("balance USDT", await usdt.connect(user).balanceOf(usdtKeeper.address));

  bnbKeeper = await ethers.getSigner(bnbAcc);
  console.log("balance BNB", await bnb.connect(user).balanceOf(bnbKeeper.address));

  // set Ether to usdtKeeper & bnbKeeper
  const newBalance = ethers.utils.parseEther("1000000");
  await setBalance(bnbKeeper.address, newBalance);
  await setBalance(usdtKeeper.address, newBalance);
  //VRF
  const VRFCoordinatorArtifact = await ethers.getContractFactory("VRFCoordinatorV2Mock");
  vrfCoordinator = await VRFCoordinatorArtifact.connect(owner).deploy("100000000000000000", 1000000000);
  await vrfCoordinator.deployed();
  expect(vrfCoordinator.address).to.be.properAddress;

  const txSubscription = await vrfCoordinator.connect(owner).createSubscription();
  txSubscription.wait();

  const txFundSub = await vrfCoordinator.connect(owner).fundSubscription(1, BigInt(1000000000000000000));
  txFundSub.wait();
  // deploy contracts & set minter role
  const TicketContract = await ethers.getContractFactory("LotteryTicket", owner);
  lotteryTicket = await TicketContract.deploy();
  await lotteryTicket.deployed();

  const Lottery = await ethers.getContractFactory("TicketSale", owner);
  lottery = await Lottery.deploy(
    lotteryTicket.address,
    "Marketplace",
    "1",
    1,
    vrfCoordinator.address,
    keyHash
  );
  await lottery.deployed();

  const txAddConsumer = await vrfCoordinator.connect(owner).addConsumer(1, lottery.address);
  txAddConsumer.wait();

  MINTER_ROLE = await lotteryTicket.MINTER_ROLE();
  OPERATOR_ROLE = await lottery.OPERATOR_ROLE();
  await lotteryTicket.grantRole(MINTER_ROLE, lottery.address);

  const txSetUSDT = await lottery.connect(owner).setTokenData(oracleUSDT, contractUSDT);
  txSetUSDT.wait();
  const txSetBNB = await lottery.connect(owner).setTokenData(oracleBNB, contractBNB);
  txSetBNB.wait();

  return { owner, user, user2, bnbKeeper, usdtKeeper, usdt, bnb, lottery, lotteryTicket, vrfCoordinator };
}

export async function purchaseTicketWithToken(
  owner: SignerWithAddress,
  user: SignerWithAddress,
  purchaseToken: IERC20,
  purchaseIdToken: number,
  lottery: TicketSale,
  amount: number
) {
  const domainMarketplace = {
    name: "Marketplace",
    version: "1",
    chainId: network.config.chainId,
    verifyingContract: lottery.address,
  };

  const uri = "someURI.json";
  const signature = await signMarketplaceDataByUser(domainMarketplace, amount, user.address, uri, owner);
  const totalPrice = await lottery.getTotalPrice(purchaseIdToken, amount);
  const approve = await purchaseToken.connect(user).approve(lottery.address, totalPrice);
  approve.wait();

  const purchase = await lottery
    .connect(user)
    .purchaseTicket(
      purchaseToken.address,
      purchaseIdToken,
      amount,
      uri,
      signature.v,
      signature.r,
      signature.s
    );
  purchase.wait();
  return purchase;
}

export async function purchaseTicketWithETH(
  owner: SignerWithAddress,
  user: SignerWithAddress,
  purchaseToken: string,
  purchaseIdToken: number,
  lottery: TicketSale,
  amount: number
) {
  const domainMarketplace = {
    name: "Marketplace",
    version: "1",
    chainId: network.config.chainId,
    verifyingContract: lottery.address,
  };

  const price = utils.parseEther("0.02");
  const uri = "someURI.json";

  const signature = await signMarketplaceDataByUser(domainMarketplace, amount, user.address, uri, owner);

  const totalPrice = BigInt(price * amount);
  const purchase = await lottery
    .connect(user)
    .purchaseTicket(purchaseToken, purchaseIdToken, amount, uri, signature.v, signature.r, signature.s, {
      value: totalPrice,
    });
  purchase.wait();
  return purchase;
}