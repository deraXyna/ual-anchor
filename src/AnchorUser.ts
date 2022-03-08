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

const authorization: Array<Object> = [
  { actor: "limitlesswax", permission: "cosign" },
];

//@ts-ignore
const api = new Api({
  rpc: rpc,
  authorityProvider: new CosignAuthorityProvider(),
  textDecoder: new TextDecoder(),
  textEncoder: new TextEncoder(),
});

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
    options.sign = true;
    console.log("Transaction: ", transaction.actions);
    var need_sig: number = 0;

    Object.keys(transaction.actions).forEach(function (key) {
      if (parseInt(key) >= 0) {
        console.log("TEST 1: ", key);
        if (
          _.isEqual(transaction.actions[key]["authorization"], authorization)
        ) {
          console.log("TEST 2: ", transaction.actions[key]);
          need_sig = 1;
        }
      }
    });
    console.log("need_sig: ", need_sig);
    if (need_sig === 1) {
      var temp_braodcast = options.broadcast;
      options.broadcast = false;
      try {
        completedTransaction = await this.session.transact(
          transaction,
          options
        );
      } catch (e) {
        const message = "this.session.transact FAILED";
        const type = UALErrorType.Signing;
        const cause = e;
        throw new UALAnchorError(message, type, cause);
      }

      const request = {
        transaction: Array.from(
          PackedTransaction.fromSigned(
            SignedTransaction.from(completedTransaction.transaction)
          ).packed_trx.array
        ),
      };
      console.log("About to fetch");
      console.log(request);

      const response = await fetch("https://api.limitlesswax.co/cpu-rent", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new UALAnchorError(
          "Failed to connect to endpoint",
          UALErrorType.Signing,
          null
        );
      }
      const json = await response.json();
      console.log("Response JSON: ", json);

      var sigs: any = [];
      if (json.signature) {
        sigs.push(json.signature[0]);
        sigs.push(completedTransaction.payload.sig);
      }

      console.log("Pushing completed_transaction");

      var data = {
        signatures: sigs,
        compression: 0,
        serializedContextFreeData: undefined,
        serializedTransaction: PackedTransaction.fromSigned(
          SignedTransaction.from(completedTransaction.transaction)
        ).packed_trx.array,
      };
      console.log("data: ", data);
      options.broadcast = temp_braodcast;

      if (temp_braodcast) {
        try {
          var completed_transaction = await api.rpc.send_transaction(data);
          console.log("completed: ", completed_transaction);
          completedTransaction.transaction_id =
            completed_transaction.transaction_id;
          completedTransaction.processed = completed_transaction.processed;
        } catch (e) {
          const message = "api.rpc.send_transaction FAILED";
          const type = UALErrorType.Signing;
          const cause = e;
          throw new UALAnchorError(message, type, cause);
        }
      }
    }
    // console.log("session: ", this.session);
    completedTransaction.signatures = sigs;
    console.log("completedTransaction: ", completedTransaction);
    console.log("Done with changed code.");

    const wasBroadcast = options.broadcast !== false;
    const serializedTransaction = PackedTransaction.fromSigned(
      SignedTransaction.from(completedTransaction.transaction)
    );
    return this.returnEosjsTransaction(wasBroadcast, {
      ...completedTransaction,
      transaction_id: completedTransaction.payload.tx,
      serializedTransaction: serializedTransaction.packed_trx.array,
      signatures: this.objectify(completedTransaction.signatures),
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
