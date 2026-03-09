"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialsClient = void 0;
const core_1 = require("@actions/core");
const client_sts_1 = require("@aws-sdk/client-sts");
const node_http_handler_1 = require("@smithy/node-http-handler");
const proxy_agent_1 = require("proxy-agent");
const helpers_1 = require("./helpers");
const ProxyResolver_1 = require("./ProxyResolver");
const USER_AGENT = 'configure-aws-credentials-for-github-actions';
class CredentialsClient {
    constructor(props) {
        if (props.region !== undefined) {
            this.region = props.region;
        }
        if (props.proxyServer) {
            (0, core_1.info)('Configuring proxy handler for STS client');
            const proxyOptions = {
                httpProxy: props.proxyServer,
                httpsProxy: props.proxyServer,
            };
            if (props.noProxy !== undefined) {
                proxyOptions.noProxy = props.noProxy;
            }
            const getProxyForUrl = new ProxyResolver_1.ProxyResolver(proxyOptions).getProxyForUrl;
            const handler = new proxy_agent_1.ProxyAgent({ getProxyForUrl });
            this.requestHandler = new node_http_handler_1.NodeHttpHandler({
                httpsAgent: handler,
                httpAgent: handler,
            });
        }
        this.roleChaining = props.roleChaining;
    }
    get stsClient() {
        if (!this._stsClient || this.roleChaining) {
            const config = { customUserAgent: USER_AGENT };
            if (this.region !== undefined)
                config.region = this.region;
            if (this.requestHandler !== undefined)
                config.requestHandler = this.requestHandler;
            this._stsClient = new client_sts_1.STSClient(config);
        }
        return this._stsClient;
    }
    async validateCredentials(expectedAccessKeyId, roleChaining, expectedAccountIds) {
        let credentials;
        try {
            credentials = await this.loadCredentials();
            if (!credentials.accessKeyId) {
                throw new Error('Access key ID empty after loading credentials');
            }
        }
        catch (error) {
            throw new Error(`Credentials could not be loaded, please check your action inputs: ${(0, helpers_1.errorMessage)(error)}`);
        }
        if (expectedAccountIds && expectedAccountIds.length > 0 && expectedAccountIds[0] !== '') {
            let callerIdentity;
            try {
                callerIdentity = await (0, helpers_1.getCallerIdentity)(this.stsClient);
            }
            catch (error) {
                throw new Error(`Could not validate account ID of credentials: ${(0, helpers_1.errorMessage)(error)}`);
            }
            if (!callerIdentity.Account || !expectedAccountIds.includes(callerIdentity.Account)) {
                throw new Error(`The account ID of the provided credentials (${callerIdentity.Account ?? 'unknown'}) does not match any of the expected account IDs: ${expectedAccountIds.join(', ')}`);
            }
        }
        if (!roleChaining) {
            const actualAccessKeyId = credentials.accessKeyId;
            if (expectedAccessKeyId && expectedAccessKeyId !== actualAccessKeyId) {
                throw new Error('Credentials loaded by the SDK do not match the expected access key ID configured by the action');
            }
        }
    }
    async loadCredentials() {
        const config = {};
        if (this.requestHandler !== undefined)
            config.requestHandler = this.requestHandler;
        const client = new client_sts_1.STSClient(config);
        return client.config.credentials();
    }
}
exports.CredentialsClient = CredentialsClient;
//# sourceMappingURL=CredentialsClient.js.map