import { WalletContextState } from "@solana/wallet-adapter-react";
import {
  AddressLookupTableAccount,
  Connection,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

const mints = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  SOL: "So11111111111111111111111111111111111111112",
};

export const swapToShdw = async (
  wallet: WalletContextState,
  connection: Connection,
  /**
   * amount of shdw in base unit
   */
  amount: number,

  paymentToken: "SOL" | "USDC"
) => {
  const mint = mints[paymentToken];
  const { data } = await (
    await fetch(
      `https://quote-api.jup.ag/v4/quote?inputMint=${mint}&outputMint=SHDWyBxihqiCj6YekG2GUr7wqKLeLAMK1gHZck9pL6y&amount=${amount}&swapMode=ExactOut&slippageBps=1`
    )
  ).json();
  const routes = data;

  if (!routes.length) throw new Error("No routes found");

  // get serialized transactions for the swap
  const transactions = await (
    await fetch("https://quote-api.jup.ag/v4/swap", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // route from /quote api
        route: routes[0],
        userPublicKey: wallet.publicKey.toString(),
      }),
    })
  ).json();

  const { swapTransaction } = transactions;

  const swapTransactionBuf = Buffer.from(swapTransaction, "base64");
  const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

  const addressLookupTableAccounts = await Promise.all(
    transaction.message.addressTableLookups.map(async (lookup) => {
      return new AddressLookupTableAccount({
        key: lookup.accountKey,
        state: AddressLookupTableAccount.deserialize(
          await connection
            .getAccountInfo(lookup.accountKey)
            .then((res) => res.data)
        ),
      });
    })
  );

  // console.log(addressLookupTableAccounts)

  // decompile transaction message and add transfer instruction
  var message = TransactionMessage.decompile(transaction.message, {
    addressLookupTableAccounts: addressLookupTableAccounts,
  });

  // compile the message and update the transaction
  transaction.message = message.compileToV0Message(addressLookupTableAccounts);

  return await wallet.sendTransaction(transaction, connection);
};
