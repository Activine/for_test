import { log } from "console";

const { expect } = require("chai")
const { ethers, network } = require("hardhat");
const { utils } = require("ethers")
const hre = require("hardhat");
const { constants } = ethers;
const { setBalance, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("NFT Sale", function () {
  let owner: any,
    user: any,
    usdt: any,
    bnb: any,
    usdtKeeper: any,
    bnbKeeper: any,
    vrfCoordinator: any,
    lottery: any,
    lotteryTicket: any

  let MINTER_ROLE: string;
  const day = 86400n;

  let keyHash = "0x8af398995b04c28e9951adb9721ef74c74f93e6a478f39e7e0777be13527e7ef";

  const contractUSDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
  const oracleUSDT = "0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46";
  const contractBNB = "0xB8c77482e45F1F44dE1745F52C74426C631bDD52";
  const oracleBNB = "0xc546d2d06144F9DD42815b8bA46Ee7B8FcAFa4a2";
  const bnbAcc = "0xB8c77482e45F1F44dE1745F52C74426C631bDD52";
  const usdtAcc = "0xC6CDE7C39eB2f0F0095F41570af89eFC2C1Ea828";

  before(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    user = signers[1];

    // get instance TetherToken & BNBToken
    usdt = await ethers.getContractAt("IERC20", contractUSDT);

    bnb = await ethers.getContractAt("IERC20", contractBNB);

    // get control under usdtAccount & bnbAccount
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [usdtAcc]
    });

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [bnbAcc]
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

    let txSubscription = await vrfCoordinator.connect(owner).createSubscription();
    txSubscription.wait();

    let txFundSub = await vrfCoordinator.connect(owner).fundSubscription(1, BigInt(1000000000000000000));
    txFundSub.wait();

    // deploy contracts & set minter role
    const TicketContract = await ethers.getContractFactory("LotteryTicket", owner);
    lotteryTicket = await TicketContract.deploy();
    await lotteryTicket.deployed();

    const Lottery = await ethers.getContractFactory("TicketSale", owner);
    lottery = await Lottery.deploy(
      lotteryTicket.address,
      1,
      vrfCoordinator.address,
      keyHash
    );
    await lottery.deployed();

    let txAddConsumer = await vrfCoordinator.connect(owner).addConsumer(1, lottery.address);
    txAddConsumer.wait()

    MINTER_ROLE = await lotteryTicket.MINTER_ROLE();
    await lotteryTicket.grantRole(MINTER_ROLE, lottery.address);
  })

  describe("Main Logic", function () {
    it("should be deployed!", async function () {
      expect(lotteryTicket.address).to.be.properAddress;
      expect(lottery.address).to.be.properAddress;
    })

    it("grant role minter", async function () {
      let tx = await lotteryTicket.grantRole(MINTER_ROLE, lottery.address);
      tx.wait()

      expect(await lotteryTicket.hasRole(MINTER_ROLE, lottery.address)).to.eq(true)
    })

    it("success: set list of token by owner", async function () {
      let txSetUSDT = await lottery.connect(owner).setTokenData(oracleUSDT, contractUSDT)
      txSetUSDT.wait()
      let txSetBNB = await lottery.connect(owner).setTokenData(oracleBNB, contractBNB)
      txSetBNB.wait()

      expect(await lottery.supportOfToken(contractUSDT)).to.eq(true)
      await expect(txSetUSDT).to.emit(lottery, "SetNewToken").withArgs(oracleUSDT, contractUSDT, owner.address)

      expect(await lottery.supportOfToken(contractBNB)).to.eq(true)
      await expect(txSetBNB).to.emit(lottery, "SetNewToken").withArgs(oracleBNB, contractBNB, owner.address)
    })

    it("reverted: set list of token by user", async function () {
      let oracleDAI = "0x773616e4d11a78f511299002da57a0a94577f1f4";
      let contractDAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F"

      await expect(lottery.connect(user).setTokenData(oracleDAI, contractDAI)).to.be.revertedWith("Caller is not a admin")
    })

    describe("Buying NFT with Ether", function () {
      it("success: buy 15 NFT", async function () {
        let price = utils.parseEther("0.02");
        let amount = 150;
        let totalprice = BigInt(price * amount);
        let uri = "someURI.json";

        let txBuy = await lottery.connect(user).purchaseTicket(ethers.constants.AddressZero, 0, amount, uri, { value: totalprice });
        txBuy.wait();

        let txBalanceNFT = await lotteryTicket.connect(user).balanceOf(user.address);
        await expect(txBalanceNFT).to.eq(amount);

        await expect(() => txBuy).to.changeEtherBalances([user, lottery], [-totalprice, totalprice]);
        await expect(txBuy).to.emit(lottery, "PurchaseTicket").withArgs(user.address, amount, 0, totalprice);
      })
      it("reverted: entered incorrectly price", async function () {
        let price = utils.parseEther("0.01");
        let amount = 150;
        let totalprice = BigInt(price * amount);
        let uri = "someURI.json";

        await expect(lottery.connect(user).purchaseTicket(ethers.constants.AddressZero, 0, amount, uri, { value: totalprice })).to.be.revertedWith("Price entered incorrectly");
      })
    })
    describe("Buying NFT with USDT", function () {
      it("success: buy 10 NFT", async function () {
        let priceForOne = ethers.utils.parseUnits("2", 16);
        let exchangeRateUSDT = await lottery.connect(usdtKeeper).getLatestPrice(1);
        let uri = "someURI.json";
        let amount = 100;
        let totalprice = Math.floor(priceForOne * amount * 1e6 / exchangeRateUSDT);

        await usdt.connect(usdtKeeper).approve(lottery.address, totalprice);

        let txBuy = await lottery.connect(usdtKeeper).purchaseTicket(contractUSDT, 1, amount, uri);
        txBuy.wait();

        let txBalanceNFT = await lotteryTicket.balanceOf(usdtKeeper.address);
        await expect(txBalanceNFT).to.eq(amount);

        await expect(() => txBuy).to.changeTokenBalances(usdt, [lottery.address, usdtKeeper.address], [totalprice, -totalprice]);
        await expect(txBuy).to.emit(lottery, "PurchaseTicket").withArgs(usdtKeeper.address, amount, 1, totalprice);
      })

      it("reverted: try to buy 11 NFT with unsupported token", async function () {
        let uri = "someURI.json";
        let amount = 11;

        await expect(lottery.connect(usdtKeeper).purchaseTicket(oracleUSDT, 3, amount, uri)).to.be.revertedWith("Unsupported token");
      })
    })
    describe("Buying NFT with BNB", function () {
      it("success", async function () {
        let priceForOne = ethers.utils.parseUnits("2", 16);
        let exchangeRateUSDT = await lottery.connect(usdtKeeper).getLatestPrice(2);
        let uri = "someURI.json";
        let amount = 50;

        let totalprice = await lottery.getTotalPrice(2, amount);
        await bnb.connect(bnbKeeper).approve(lottery.address, totalprice);

        let txBuy = await lottery.connect(bnbKeeper).purchaseTicket(contractBNB, 2, amount, uri);
        txBuy.wait();

        let txBalanceNFT = await lotteryTicket.connect(bnbKeeper).balanceOf(bnbKeeper.address);
        await expect(txBalanceNFT).to.eq(amount);

        await expect(() => txBuy).to.changeTokenBalances(bnb, [lottery.address, bnbKeeper.address], [BigInt(totalprice), -BigInt(totalprice)]);
        await expect(txBuy).to.emit(lottery, "PurchaseTicket").withArgs(bnbKeeper.address, amount, 2, totalprice);
      })
    })
    describe("winners", function () {
      it("reverted: lottery not over", async function () {
        await expect(lottery.connect(owner).setWinners()).to.be.revertedWith("Lottery is not over");
      })
      it("success: payout", async function () {
        await time.increase(day * 8n);

        let txWin = await lottery.connect(owner).setWinners();
        txWin.wait();
        let txVRFreq = await vrfCoordinator.connect(owner).fulfillRandomWords(1, lottery.address);
        txVRFreq.wait();
        let txWinget = await lottery.connect(owner).getWinner();

        let balanceETH = await ethers.provider.getBalance(lottery.address);
        let ownerFeeETH = balanceETH * 10 / 100;
        let winningAmount = BigInt(balanceETH - ownerFeeETH);

        let balanceUSDT = await usdt.balanceOf(lottery.address);
        let ownerFeeUSDT = Math.floor(balanceUSDT * 10 / 100);
        let winningAmountUSDT = Math.floor(balanceUSDT - ownerFeeUSDT);

        let balanceBNB = await bnb.balanceOf(lottery.address);
        let ownerFeeBNB = Math.floor(balanceBNB * 10 / 100);
        let winningAmountBNB = Math.floor((balanceBNB) - ownerFeeBNB);

        let winner = await lotteryTicket.ownerOf(txWinget);
        let balance = await ethers.provider.getBalance(winner);

        let payout = await lottery.connect(owner).payout();
        await expect(() => payout).to.changeEtherBalances([lottery.address, winner, owner.address], [-BigInt(balanceETH), BigInt(winningAmount), BigInt(ownerFeeETH)]);
        await expect(payout).to.emit(lottery, "Payout").withArgs(constants.AddressZero, owner.address, ownerFeeETH);
        await expect(payout).to.emit(lottery, "Payout").withArgs(constants.AddressZero, winner, winningAmount);

        await expect(() => payout).to.changeTokenBalances(usdt, [lottery.address, winner, owner.address], [-balanceUSDT, winningAmountUSDT, ownerFeeUSDT]);
        await expect(payout).to.emit(lottery, "Payout").withArgs(usdt.address, owner.address, ownerFeeUSDT);
        await expect(payout).to.emit(lottery, "Payout").withArgs(usdt.address, winner, winningAmountUSDT);

      })
    })
  })
})