"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Anchor = void 0;
const universal_authenticator_library_1 = require("universal-authenticator-library");
const anchor_link_1 = __importDefault(require("anchor-link"));
const eosjs_1 = require("eosjs");
const eosio_1 = require("@greymass/eosio");
const interfaces_1 = require("./interfaces");
const AnchorUser_1 = require("./AnchorUser");
const AnchorLogo_1 = require("./AnchorLogo");
const UALAnchorError_1 = require("./UALAnchorError");
const anchor_link_browser_transport_1 = __importDefault(require("anchor-link-browser-transport"));
class Anchor extends universal_authenticator_library_1.Authenticator {
    /**
     * Anchor Constructor.
     *
     * @param chains
     * @param options { appName } appName is a required option to use Scatter
     */
    constructor(chains, options) {
        super(chains);
        // Storage for AnchorUser instances
        this.users = [];
        // the callback service url, defaults to https://cb.anchor.link
        this.service = 'https://cb.anchor.link';
        // disable Greymass Fuel cosigning, defaults to false
        this.disableGreymassFuel = false;
        // display the request status returned by anchor-link, defaults to false (ual has it's own)
        this.requestStatus = false;
        // The referral account used in Fuel transactions
        this.fuelReferrer = 'teamgreymass';
        // Whether anchor-link should be configured to verify identity proofs in the browser for the app
        this.verifyProofs = false;
        // Establish initial values
        this.chainId = chains[0].chainId;
        this.users = [];
        // Determine the default rpc endpoint for this chain
        const [chain] = chains;
        const [rpc] = chain.rpcEndpoints;
        // Ensure the appName is set properly
        if (options && options.appName) {
            this.appName = options.appName;
        }
        else {
            throw new UALAnchorError_1.UALAnchorError('ual-anchor requires the appName property to be set on the `options` argument during initialization.', universal_authenticator_library_1.UALErrorType.Initialization, null);
        }
        // Allow overriding the JsonRpc client via options
        if (options && options.rpc) {
            this.rpc = options.rpc;
        }
        else {
            // otherwise just return a generic rpc instance for this endpoint
            this.rpc = new eosjs_1.JsonRpc(`${rpc.protocol}://${rpc.host}:${rpc.port}`);
        }
        // Allow overriding the APIClient via options
        if (options && options.client) {
            this.client = options.client;
        }
        else {
            const provider = new eosio_1.FetchProvider(`${rpc.protocol}://${rpc.host}:${rpc.port}`);
            this.client = new eosio_1.APIClient({ provider });
        }
        // Allow passing a custom service URL to process callbacks
        if (options.service) {
            this.service = options.service;
        }
        // Allow passing of disable flag for Greymass Fuel
        if (options && options.disableGreymassFuel) {
            this.disableGreymassFuel = options.disableGreymassFuel;
        }
        // Allow passing of disable flag for resulting request status
        if (options && options.requestStatus) {
            this.requestStatus = options.requestStatus;
        }
        // Allow specifying a Fuel referral account
        if (options && options.fuelReferrer) {
            this.fuelReferrer = options.fuelReferrer;
        }
        // Allow overriding the proof verification option
        if (options && options.verifyProofs) {
            this.verifyProofs = options.verifyProofs;
        }
    }
    /**
     * Called after `shouldRender` and should be used to handle any async actions required to initialize the authenticator
     */
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            // establish anchor-link
            this.link = new anchor_link_1.default({
                chains: [{
                        chainId: this.chainId,
                        nodeUrl: this.client,
                    }],
                service: this.service,
                transport: new anchor_link_browser_transport_1.default({
                    requestStatus: this.requestStatus,
                    disableGreymassFuel: this.disableGreymassFuel,
                    fuelReferrer: this.fuelReferrer,
                }),
                verifyProofs: this.verifyProofs,
            });
            // attempt to restore any existing session for this app
            const session = yield this.link.restoreSession(this.appName);
            if (session) {
                this.users = [new AnchorUser_1.AnchorUser(this.rpc, this.client, { session })];
            }
        });
    }
    /**
     * Resets the authenticator to its initial, default state then calls `init` method
     */
    reset() {
        this.users = [];
    }
    /**
     * Returns true if the authenticator has errored while initializing.
     */
    isErrored() {
        return false;
    }
    /**
     * Returns a URL where the user can download and install the underlying authenticator
     * if it is not found by the UAL Authenticator.
     */
    getOnboardingLink() {
        return 'https://github.com/greymass/anchor/';
    }
    /**
     * Returns error (if available) if the authenticator has errored while initializing.
     */
    getError() {
        return null;
    }
    /**
     * Returns true if the authenticator is loading while initializing its internal state.
     */
    isLoading() {
        return false;
    }
    getName() {
        return 'anchor';
    }
    /**
     * Returns the style of the Button that will be rendered.
     */
    getStyle() {
        return {
            icon: AnchorLogo_1.AnchorLogo,
            text: interfaces_1.Name,
            textColor: 'white',
            background: '#3650A2'
        };
    }
    /**
     * Returns whether or not the button should render based on the operating environment and other factors.
     * ie. If your Authenticator App does not support mobile, it returns false when running in a mobile browser.
     */
    shouldRender() {
        return !this.isLoading();
    }
    /**
     * Returns whether or not the dapp should attempt to auto login with the Authenticator app.
     * Auto login will only occur when there is only one Authenticator that returns shouldRender() true and
     * shouldAutoLogin() true.
     */
    shouldAutoLogin() {
        return this.users.length > 0;
    }
    /**
     * Returns whether or not the button should show an account name input field.
     * This is for Authenticators that do not have a concept of account names.
     */
    shouldRequestAccountName() {
        return __awaiter(this, void 0, void 0, function* () {
            return false;
        });
    }
    /**
     * Login using the Authenticator App. This can return one or more users depending on multiple chain support.
     *
     * @param accountName  The account name of the user for Authenticators that do not store accounts (optional)
     */
    login() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.chains.length > 1) {
                throw new UALAnchorError_1.UALAnchorError('UAL-Anchor does not yet support providing multiple chains to UAL. Please initialize the UAL provider with a single chain.', universal_authenticator_library_1.UALErrorType.Unsupported, null);
            }
            try {
                // only call the login method if no users exist, to prevent UI from prompting for login during auto login
                //  some changes to UAL are going to be required to support multiple users
                if (this.users.length === 0) {
                    const identity = yield this.link.login(this.appName);
                    this.users = [new AnchorUser_1.AnchorUser(this.rpc, this.client, identity)];
                }
            }
            catch (e) {
                throw new UALAnchorError_1.UALAnchorError(
                //@ts-ignore
                e.message, universal_authenticator_library_1.UALErrorType.Login, 
                //@ts-ignore
                e);
            }
            return this.users;
        });
    }
    /**
     * Logs the user out of the dapp. This will be strongly dependent on each Authenticator app's patterns.
     */
    logout() {
        return __awaiter(this, void 0, void 0, function* () {
            // Ensure a user exists to logout
            if (this.users.length) {
                // retrieve the current user
                const [user] = this.users;
                // retrieve the auth from the current user
                const { session: { auth } } = user;
                // remove the session from anchor-link
                yield this.link.removeSession(this.appName, auth, this.chainId);
            }
            // reset the authenticator
            this.reset();
        });
    }
    /**
     * Returns true if user confirmation is required for `getKeys`
     */
    requiresGetKeyConfirmation() {
        return false;
    }
}
exports.Anchor = Anchor;
