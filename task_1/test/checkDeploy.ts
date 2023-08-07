import { expect } from "chai";
import { ethers, network } from "hardhat";
import { BigNumber, utils } from "ethers";
const { constants } = ethers;
import { loadFixture, time, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { LotteryTicket, TicketSale, IERC20 } from "../types/typechain-types";
import { deploy, purchaseTicketWithToken, purchaseTicketWithETH } from "@test-utils";
const { signMarketplaceDataByUser } = require("./utils/sign");


describe("Check deploy", function () {
  describe("Deploying test", () => {
    it("success: should be deployed & setting data correctly", async () => {
      const { lottery, lotteryTicket } = await loadFixture(deploy);
      //should be deployed!
      expect(lotteryTicket.address).to.be.properAddress;
      expect(lottery.address).to.be.properAddress;

      const MINTER_ROLE = await lotteryTicket.MINTER_ROLE();

      expect(await lotteryTicket.hasRole(MINTER_ROLE, lottery.address)).to.eq(true);

      const contractUSDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
      const contractBNB = "0xB8c77482e45F1F44dE1745F52C74426C631bDD52";
      expect(await lottery.supportOfToken(contractUSDT)).to.eq(true);
      expect(await lottery.supportOfToken(contractBNB)).to.eq(true);
    });

    it("success: setting & deleting support tokens", async () => {
      const { lottery, user } = await loadFixture(deploy);

      const OPERATOR_ROLE = await lottery.OPERATOR_ROLE();
      const oracleDAI = "0x773616E4d11A78F511299002da57A0a94577F1f4";
      const contractDAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
      const contractBNB = "0xB8c77482e45F1F44dE1745F52C74426C631bDD52";


      await expect(lottery.connect(user).setTokenData(oracleDAI, contractDAI)).to.be.revertedWith(
        `AccessControl: account ${user.address.toLowerCase()} is missing role ${OPERATOR_ROLE}`
      );
      const txSetToken = await lottery.setTokenData(oracleDAI, contractDAI);
      txSetToken.wait();

      await expect(txSetToken).to.emit(lottery, "SetNewToken").withArgs(oracleDAI, contractDAI);
      expect(await lottery.supportOfToken(contractDAI)).to.eq(true);

      await expect(lottery.deleteTokenData(oracleDAI, contractBNB, 3)).to.be.revertedWith(`Incorrect addresses`);

      const txDeleteToken = await lottery.deleteTokenData(oracleDAI, contractDAI, 3);
      txDeleteToken.wait();

      await expect(txDeleteToken).to.emit(lottery, "DeleteToken").withArgs(oracleDAI, contractDAI);
      expect(await lottery.supportOfToken(contractDAI)).to.eq(false);
    });
    it("success: testing calculation & exchange rate", async () => {
      const { lottery, owner, lotteryTicket, usdtKeeper, usdt } = await loadFixture(deploy);
      const amount = 10;
      let exchangeRate = await lottery.getLatestPrice(1);
      let totalPrice = await lottery.getTotalPrice(2, amount);
      console.log(exchangeRate);
      console.log(totalPrice);

      await expect(lottery.getTotalPrice(3, amount)).to.be.revertedWith("Unsupported token");
      await expect(lottery.getLatestPrice(3)).to.be.revertedWith("Unsupported token");

      expect(await lottery.getLatestPrice(1)).to.eq(exchangeRate);
      expect(await lottery.getTotalPrice(2, amount)).to.eq(totalPrice);
    });
  });

  describe("Buying lottery ticket", () => {
    it("success: buying with USDT", async () => {
      const { lottery, owner, lotteryTicket, usdtKeeper, usdt } = await loadFixture(deploy);
      const amount = 10;
      const tokenId = 1;
      const totalPrice = await lottery.getTotalPrice(tokenId, amount);

      const txPurchase = await purchaseTicketWithToken(
        owner,
        usdtKeeper,
        usdt,
        tokenId,
        lottery,
        amount
      );
      expect(await lotteryTicket.balanceOf(usdtKeeper.address)).to.eq(amount);
      await expect(txPurchase).to.emit(lottery, "PurchaseTicket").withArgs(usdtKeeper.address, amount, tokenId, totalPrice);

    });

    it("success: buying with BNB", async () => {
      const { lottery, owner, lotteryTicket, bnbKeeper, bnb } = await loadFixture(deploy);
      const amount = 10;
      const tokenId = 2;
      const totalPrice = await lottery.getTotalPrice(tokenId, amount);

      const txPurchase = await purchaseTicketWithToken(
        owner,
        bnbKeeper,
        bnb,
        tokenId,
        lottery,
        amount
      );
      console.log(await lotteryTicket.balanceOf(bnbKeeper.address));
      expect(await lotteryTicket.balanceOf(bnbKeeper.address)).to.eq(amount);
      await expect(txPurchase).to.emit(lottery, "PurchaseTicket").withArgs(bnbKeeper.address, amount, tokenId, totalPrice);

    });

    it("success: buying with ETH", async () => {
      const { lottery, owner, lotteryTicket, usdtKeeper } = await loadFixture(deploy);
      const amount = 10;
      const tokenId = 0;
      const price = utils.parseEther("0.02");
      const totalPrice = BigInt(price * amount);

      const txPurchase = await purchaseTicketWithETH(
        owner,
        usdtKeeper,
        ethers.constants.AddressZero,
        tokenId,
        lottery,
        amount
      );
      console.log(await lotteryTicket.balanceOf(usdtKeeper.address));
      expect(await lotteryTicket.balanceOf(usdtKeeper.address)).to.eq(amount);
      await expect(txPurchase).to.emit(lottery, "PurchaseTicket").withArgs(usdtKeeper.address, amount, tokenId, totalPrice);

    });

    it("reverted: Unsupported token", async () => {
      const { lottery, owner, bnbKeeper } = await loadFixture(deploy);
      const amount = 10;
      const tokenId = 3;
      const contractDAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
      const domainMarketplace = {
        name: "Marketplace",
        version: "1",
        chainId: network.config.chainId,
        verifyingContract: lottery.address,
      };

      const uri = "someURI.json";
      const signature = await signMarketplaceDataByUser(
        domainMarketplace,
        amount,
        bnbKeeper.address,
        uri,
        owner
      );

      await expect(
        lottery
          .connect(bnbKeeper)
          .purchaseTicket(
            contractDAI,
            tokenId,
            amount,
            uri,
            signature.v,
            signature.r,
            signature.s,
          )
      ).to.be.revertedWith("Unsupported token");
    });

    it("reverted: Action is inconsistent", async () => {
      const { lottery, owner, bnbKeeper, bnb } = await loadFixture(deploy);
      const amount = 10;
      const tokenId = 2;
      const contractDAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
      const domainMarketplace = {
        name: "Marketplace",
        version: "1",
        chainId: network.config.chainId,
        verifyingContract: lottery.address,
      };

      const uri = "someURI.json";
      const signature = await signMarketplaceDataByUser(
        domainMarketplace,
        5,
        bnbKeeper.address,
        uri,
        owner
      );

      await expect(
        lottery
          .connect(bnbKeeper)
          .purchaseTicket(
            bnb.address,
            tokenId,
            amount,
            uri,
            signature.v,
            signature.r,
            signature.s,
          )
      ).to.be.revertedWith("Action is inconsistent.");

    });

    it("reverted: Lottery over", async () => {
      const { lottery, owner, user } = await loadFixture(deploy);
      const amount = 10;
      const price = utils.parseEther("0.02");
      const uri = "someURI.json";

      const domainMarketplace = {
        name: "Marketplace",
        version: "1",
        chainId: network.config.chainId,
        verifyingContract: lottery.address,
      };

      const signature = await signMarketplaceDataByUser(
        domainMarketplace,
        amount,
        user.address,
        uri,
        owner
      );

      const totalPrice = BigInt(price * amount);
      await time.increase(604801);

      await expect(
        lottery
          .connect(user)
          .purchaseTicket(
            ethers.constants.AddressZero,
            0,
            amount,
            uri,
            signature.v,
            signature.r,
            signature.s,
            { value: totalPrice }
          )
      ).to.be.revertedWith("Lottery over");
    });

    it("reverted: Tickets sold out", async () => {
      const { lottery, owner, user } = await loadFixture(deploy);
      const amount = 255;
      const price = utils.parseEther("0.02");
      const uri = "someURI.json";

      const domainMarketplace = {
        name: "Marketplace",
        version: "1",
        chainId: network.config.chainId,
        verifyingContract: lottery.address,
      };

      const signature = await signMarketplaceDataByUser(
        domainMarketplace,
        amount,
        user.address,
        uri,
        owner
      );

      const totalPrice = BigInt(price * amount);

      await lottery
        .connect(user)
        .purchaseTicket(
          ethers.constants.AddressZero,
          0,
          amount,
          uri,
          signature.v,
          signature.r,
          signature.s,
          { value: totalPrice }
        )

      await expect(
        lottery
          .connect(user)
          .purchaseTicket(
            ethers.constants.AddressZero,
            0,
            amount,
            uri,
            signature.v,
            signature.r,
            signature.s,
            { value: totalPrice }
          )
      ).to.be.revertedWith("Tickets sold out");
    });

    it("reverted: Unnecessary transfer of Ether", async () => {
      const { lottery, owner, bnbKeeper, bnb } = await loadFixture(deploy);
      const amount = 10;
      const tokenId = 2;
      const price = utils.parseEther("0.02");
      const domainMarketplace = {
        name: "Marketplace",
        version: "1",
        chainId: network.config.chainId,
        verifyingContract: lottery.address,
      };

      const uri = "someURI.json";
      const signature = await signMarketplaceDataByUser(
        domainMarketplace,
        amount,
        bnbKeeper.address,
        uri,
        owner
      );

      await expect(
        lottery
          .connect(bnbKeeper)
          .purchaseTicket(
            bnb.address,
            tokenId,
            amount,
            uri,
            signature.v,
            signature.r,
            signature.s,
            { value: price }
          )
      ).to.be.revertedWith("Unnecessary transfer of Ether.");
    });
  })
  describe("Winner", () => {
    it("revert: Lottery is not over", async () => {
      const { lottery } = await loadFixture(deploy);
      await expect(lottery.payout()).to.be.revertedWith("Lottery is not over");
      await expect(lottery.setWinners()).to.be.revertedWith("Lottery is not over");
    });
    it("success: get winner", async () => {
      const { lottery, owner, lotteryTicket, usdtKeeper, usdt, bnbKeeper, bnb, user, vrfCoordinator } = await loadFixture(deploy);
      const amount = 100;
      const tokenIdUSDT = 1;
      const tokenIdBNB = 2;

      let totalPrice = await lottery.getTotalPrice(tokenIdUSDT, amount);

      const txPurchaseWithUSDT = await purchaseTicketWithToken(
        owner,
        usdtKeeper,
        usdt,
        tokenIdUSDT,
        lottery,
        amount
      );
      expect(await lotteryTicket.balanceOf(usdtKeeper.address)).to.eq(amount);
      await expect(txPurchaseWithUSDT).to.emit(lottery, "PurchaseTicket").withArgs(usdtKeeper.address, amount, tokenIdUSDT, totalPrice);


      totalPrice = await lottery.getTotalPrice(tokenIdBNB, amount);

      const txPurchaseWithBNB = await purchaseTicketWithToken(
        owner,
        bnbKeeper,
        bnb,
        tokenIdBNB,
        lottery,
        amount
      );
      expect(await lotteryTicket.balanceOf(bnbKeeper.address)).to.eq(amount);
      await expect(txPurchaseWithBNB).to.emit(lottery, "PurchaseTicket").withArgs(bnbKeeper.address, amount, tokenIdBNB, totalPrice);


      const price = utils.parseEther("0.02");
      let amountPrice = BigInt(price * amount);

      let txPurchaseWithETH = await purchaseTicketWithETH(
        owner,
        user,
        ethers.constants.AddressZero,
        0,
        lottery,
        amount
      );
      console.log(await lotteryTicket.balanceOf(user.address));
      expect(await lotteryTicket.balanceOf(user.address)).to.eq(amount);
      await expect(txPurchaseWithETH).to.emit(lottery, "PurchaseTicket").withArgs(user.address, amount, 0, amountPrice);

      expect(await lottery.getWinner()).to.eq(0);

      await time.increase(604801);
      await lottery.setWinners();
      const txVRFreq = await vrfCoordinator.fulfillRandomWords(1, lottery.address);
      txVRFreq.wait();
      const txGetWin = await lottery.getWinner();
      console.log(txGetWin);
      // How to test this event?
      // await expect(txSetWin).to.emit(lottery, "WinnerNumber").withArgs(161);

      expect(await lottery.getWinner()).to.eq(161);
      expect(await lotteryTicket.ownerOf(161)).to.eq(bnbKeeper.address);


      let amountUSDT = await lottery.purchaseAmount(1);
      let amountBNB = await lottery.purchaseAmount(2)
      let amountETH = await ethers.provider.getBalance(lottery.address);

      let feeUSDT = BigInt(amountUSDT) * 10n / 100n;
      let feeBNB = BigInt(amountBNB) * 10n / 100n
      let feeETH = BigInt(amountETH) * 10n / 100n;

      const payout = await lottery.payout();

      await expect(() => payout)
        .to.changeTokenBalances(usdt, [owner.address, bnbKeeper.address, lottery.address], [BigInt(feeUSDT), BigInt(amountUSDT) - BigInt(feeUSDT), -BigInt(amountUSDT)]);
      await expect(payout).to.emit(lottery, "Payout")
      .withArgs(usdt.address, owner.address, feeUSDT);
      await expect(payout).to.emit(lottery, "Payout")
      .withArgs(usdt.address, bnbKeeper.address, (BigInt(amountUSDT) - BigInt(feeUSDT)));

      await expect(() => payout)
        .to.changeTokenBalances(bnb, [owner.address, bnbKeeper.address, lottery.address], [BigInt(feeBNB), BigInt(amountBNB) - BigInt(feeBNB), -BigInt(amountBNB)]);
      await expect(payout).to.emit(lottery, "Payout")
      .withArgs(bnb.address, owner.address, feeBNB);
      await expect(payout).to.emit(lottery, "Payout")
      .withArgs(bnb.address, bnbKeeper.address, (BigInt(amountBNB) - BigInt(feeBNB)));


      await expect(() => payout)
        .to.changeEtherBalances([owner.address, bnbKeeper.address, lottery.address], [BigInt(feeETH), BigInt(amountETH) - BigInt(feeETH), - BigInt(amountETH)]);
      await expect(payout).to.emit(lottery, "Payout")
      .withArgs(ethers.constants.AddressZero, owner.address, feeETH);
      await expect(payout).to.emit(lottery, "Payout")
      .withArgs(ethers.constants.AddressZero, bnbKeeper.address, (BigInt(amountETH) - BigInt(feeETH)));
    });
  });
})