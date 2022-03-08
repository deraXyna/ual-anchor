import {
  SignTransactionResponse,
  User,
  UALErrorType,
} from "universal-authenticator-library";
import {
  APIClient,
  PackedTransaction,
  SignedTransaction,
} from "@greymass/eosio";
import { Api, JsonRpc } from "eosjs";
import { UALAnchorError } from "./UALAnchorError";
import { convertLegacyPublicKeys } from "eosjs/dist/eosjs-numeric";
// import { TextDecoder, TextEncoder } from "util";
const httpEndpoint = "https://wax.greymass.com";
// import fetch from "node-fetch"; //node only
let fetch = window.fetch.bind(window);
const rpc = new JsonRpc(httpEndpoint, { fetch });
import * as _ from "lodash";

class CosignAuthorityProvider {
  async getRequiredKeys(args) {
    const { transaction } = args;
    // Iterate over the actions and authorizations
    transaction.actions.forEach((action, ti) => {
      action.authorization.forEach((auth, ai) => {
        // If the authorization matches the expected cosigner
        // then remove it from the transaction while checking
        // for what public keys are required
        if (auth.actor === "limitlesswax" && auth.permission === "cosign") {
          //@ts-ignore
          delete transaction.actions[ti].authorization.splice(ai, 1);
        }
      });
    });
    return convertLegacyPublicKeys(
      (
        await rpc.fetch("/v1/chain/get_required_keys", {
          transaction,
          available_keys: args.availableKeys,
        })
      ).required_keys
    );
  }
}

// const authorization: Array<Object> = [
//   { actor: "limitlesswax", permission: "cosign" },
// ];

//@ts-ignore
const api = new Api({
  rpc: rpc,
  authorityProvider: new CosignAuthorityProvider(),
  textDecoder: new TextDecoder(),
  textEncoder: new TextEncoder(),
});

type ApiValue = {
  isOk?: boolean;
  signature?: string;
  message?: string;
};

export class AnchorUser extends User {
  public client: APIClient;
  public rpc: JsonRpc;
  public session: any;

  public signerKey?: string;
  public signerProof?: string;
  public signerRequest?: any;

  private signatureProvider: any;
  private chainId: string;
  private accountName: string = "";
  private requestPermission: string = "";

  constructor(rpc, client, identity) {
    super();
    const { session } = identity;
    this.accountName = String(session.auth.actor);
    this.chainId = String(session.chainId);
    if (identity.signatures) {
      [this.signerProof] = identity.signatures;
    }
    if (identity.signerKey) {
      this.signerKey = identity.signerKey;
    }
    if (identity.resolvedTransaction) {
      this.signerRequest = identity.transaction;
    }
    this.requestPermission = String(session.auth.permission);
    this.session = session;
    this.client = client;
    this.rpc = rpc;
  }

  objectify(data: any) {
    return JSON.parse(JSON.stringify(data));
  }

  public async signTransaction(
    transaction,
    options
  ): Promise<SignTransactionResponse> {
    var completedTransaction;
    // If this is not a transaction and expireSeconds is passed, form a transaction
    //   Note: this needs to be done because the session transact doesn't understand eosjs transact options

    var temp_transaction = transaction;
    try {
      if (options.expireSeconds && !transaction.expiration) {
        const info = await this.client.v1.chain.get_info();
        const tx = {
          ...transaction,
          ...info.getTransactionHeader(options.expireSeconds),
        };
        temp_transaction = tx;
      }
    } catch (e) {
      const message = "this.client.v1.chain.get_info() FAILED";
      const type = UALErrorType.Signing;
      const cause = e;
      throw new UALAnchorError(message, type, cause);
    }

    console.log("Transaction: ", temp_transaction.actions);
    var need_sig: boolean = true;
    // Object.keys(temp_transaction.actions).forEach(function (key) {
    //   if (parseInt(key) >= 0) {
    //     console.log("TEST 1: ", key);
    //     if (
    //       _.isEqual(
    //         temp_transaction.actions[key]["authorization"],
    //         authorization
    //       )
    //     ) {
    //       console.log("TEST 2: ", temp_transaction.actions[key]);
    //       need_sig = true;
    //     }
    //   }
    // });
    console.log("need_sig: ", need_sig);
    if (need_sig === true) {
      console.log("Getting a sig");
      var temp_braodcast = options.broadcast;
      options.broadcast = false;
      try {
        completedTransaction = await this.session.transact(
          temp_transaction,
          options
        );
      } catch (e) {
        const message = "this.session.transact FAILED";
        const type = UALErrorType.Signing;
        const cause = e;
        throw new UALAnchorError(message, type, cause);
      }
      console.log("Didn't broadcast.");
      // const serialized_transaction = PackedTransaction.fromSigned(
      //   SignedTransaction.from(completed_transaction.transaction)
      // );
      console.log("serializedTransaction: ", completedTransaction);
      console.log(
        "What is this",
        PackedTransaction.fromSigned(
          SignedTransaction.from(completedTransaction.transaction)
        )
      );
      const request = {
        transaction: Array.from(completedTransaction.transaction),
      };
      console.log("About to fetch");
      console.log(request);
      let response;
      // try {
      const res = await fetch("https://api.limitlesswax.co/cpu-rent", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: JSON.stringify(request),
      });
      console.log(res);
      response = res;
      // } catch (e) {
      //   console.log(JSON.stringify(e));
      //   const message = "fetch api sig FAILED";
      //   const type = UALErrorType.Signing;
      //   const cause = e;
      //   throw new UALAnchorError(message, type, cause);
      // }
      console.log("Response: ", response);
      if (!response.ok) {
        console.log("Stuck");
        //@ts-ignore
        const body = await response.json();
        throw new UALAnchorError(
          "Failed to connect to endpoint",
          UALErrorType.Signing,
          null
        );
      }
      //@ts-ignore
      const json: ApiValue = await response.json();
      console.log("Response JSON: ", json);
      if (json.signature) {
        try {
          completedTransaction.signatures.push(json.signature[0]);
        } catch (e) {
          const message = "completedTransaction.signatures.push FAILED";
          const type = UALErrorType.Signing;
          const cause = e;
          throw new UALAnchorError(message, type, cause);
        }
      }

      console.log("Pushing completed_transaction");

      var data = {
        signatures: completedTransaction.signatures,
        compression: 0,
        serializedContextFreeData: undefined,
        serializedTransaction: completedTransaction.serializedTransaction,
      };

      options.broadcast = temp_braodcast;
      var completed_transaction = completedTransaction;
      if (temp_braodcast) {
        completed_transaction = await api.rpc.send_transaction(data);
      }
    }

    console.log("Done with changed code.");

    const wasBroadcast = options.broadcast !== false;
    const serializedTransaction = PackedTransaction.fromSigned(
      SignedTransaction.from(completed_transaction.transaction)
    );
    return this.returnEosjsTransaction(wasBroadcast, {
      ...completed_transaction,
      transaction_id: completed_transaction.payload.tx,
      serializedTransaction: serializedTransaction.packed_trx.array,
      signatures: this.objectify(completed_transaction.signatures),
    });
  }

  public async signArbitrary(
    publicKey: string,
    data: string,
    _: string
  ): Promise<string> {
    throw new UALAnchorError(
      `Anchor does not currently support signArbitrary(${publicKey}, ${data})`,
      UALErrorType.Unsupported,
      null
    );
  }

  public async verifyKeyOwnership(challenge: string): Promise<boolean> {
    throw new UALAnchorError(
      `Anchor does not currently support verifyKeyOwnership(${challenge})`,
      UALErrorType.Unsupported,
      null
    );
  }

  public async getAccountName() {
    return this.accountName;
  }

  public async getChainId() {
    return this.chainId;
  }

  public async getKeys() {
    try {
      const keys = await this.signatureProvider.getAvailableKeys(
        this.requestPermission
      );
      return keys;
    } catch (error) {
      const message = `Unable to getKeys for account ${this.accountName}.
        Please make sure your wallet is running.`;
      const type = UALErrorType.DataRequest;
      const cause = error;
      throw new UALAnchorError(message, type, cause);
    }
  }

  public async isAccountValid() {
    try {
      const account =
        this.client &&
        (await this.client.v1.chain.get_account(this.accountName));
      const actualKeys = this.extractAccountKeys(account);
      const authorizationKeys = await this.getKeys();

      return (
        actualKeys.filter((key) => {
          return authorizationKeys.indexOf(key) !== -1;
        }).length > 0
      );
    } catch (e) {
      if (e.constructor.name === "UALAnchorError") {
        throw e;
      }

      const message = `Account validation failed for account ${this.accountName}.`;
      const type = UALErrorType.Validation;
      const cause = e;
      throw new UALAnchorError(message, type, cause);
    }
  }

  public extractAccountKeys(account) {
    const keySubsets = account.permissions.map((permission) =>
      permission.required_auth.keys.map((key) => key.key)
    );
    let keys = [];
    for (const keySubset of keySubsets) {
      keys = keys.concat(keySubset);
    }
    return keys;
  }
}
