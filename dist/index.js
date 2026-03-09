'use strict';

var __createBinding = (undefined && undefined.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (undefined && undefined.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (undefined && undefined.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const core = __importStar(require("@actions/core"));
const assumeRole_1 = require("./assumeRole");
const CredentialsClient_1 = require("./CredentialsClient");
const helpers_1 = require("./helpers");
const DEFAULT_ROLE_DURATION = 3600; // One hour (seconds)
const ROLE_SESSION_NAME = 'GitHubActions';
const REGION_REGEX = /^[a-z0-9-]+$/g;
async function run() {
    try {
        (0, helpers_1.translateEnvVariables)();
        // Get inputs
        // Undefined inputs are empty strings ( or empty arrays)
        const AccessKeyId = core.getInput('aws-access-key-id', { required: false });
        const SecretAccessKey = core.getInput('aws-secret-access-key', { required: false });
        const sessionTokenInput = core.getInput('aws-session-token', { required: false });
        const SessionToken = sessionTokenInput === '' ? undefined : sessionTokenInput;
        const region = core.getInput('aws-region', { required: true });
        const roleToAssume = core.getInput('role-to-assume', { required: false });
        const audience = core.getInput('audience', { required: false });
        const maskAccountId = (0, helpers_1.getBooleanInput)('mask-aws-account-id', { required: false });
        const roleExternalId = core.getInput('role-external-id', { required: false });
        const webIdentityTokenFile = core.getInput('web-identity-token-file', { required: false });
        const roleDuration = Number.parseInt(core.getInput('role-duration-seconds', { required: false })) || DEFAULT_ROLE_DURATION;
        const roleSessionName = core.getInput('role-session-name', { required: false }) || ROLE_SESSION_NAME;
        const roleSkipSessionTagging = (0, helpers_1.getBooleanInput)('role-skip-session-tagging', { required: false });
        const transitiveTagKeys = core.getMultilineInput('transitive-tag-keys', { required: false });
        const proxyServer = core.getInput('http-proxy', { required: false }) || process.env.HTTP_PROXY;
        const inlineSessionPolicy = core.getInput('inline-session-policy', { required: false });
        const managedSessionPolicies = core.getMultilineInput('managed-session-policies', { required: false }).map((p) => {
            return { arn: p };
        });
        const roleChaining = (0, helpers_1.getBooleanInput)('role-chaining', { required: false });
        const outputCredentials = (0, helpers_1.getBooleanInput)('output-credentials', { required: false });
        const outputEnvCredentials = (0, helpers_1.getBooleanInput)('output-env-credentials', { required: false, default: true });
        const unsetCurrentCredentials = (0, helpers_1.getBooleanInput)('unset-current-credentials', { required: false });
        let disableRetry = (0, helpers_1.getBooleanInput)('disable-retry', { required: false });
        const specialCharacterWorkaround = (0, helpers_1.getBooleanInput)('special-characters-workaround', { required: false });
        const useExistingCredentials = core.getInput('use-existing-credentials', { required: false });
        let maxRetries = Number.parseInt(core.getInput('retry-max-attempts', { required: false })) || 12;
        const expectedAccountIds = core
            .getInput('allowed-account-ids', { required: false })
            .split(',')
            .map((s) => s.trim());
        const forceSkipOidc = (0, helpers_1.getBooleanInput)('force-skip-oidc', { required: false });
        const noProxy = core.getInput('no-proxy', { required: false });
        const globalTimeout = Number.parseInt(core.getInput('action-timeout-s', { required: false })) || 0;
        let timeoutId;
        if (globalTimeout > 0) {
            core.info(`Setting a global timeout of ${globalTimeout} seconds for the action`);
            timeoutId = setTimeout(() => {
                core.setFailed(`Action timed out after ${globalTimeout} seconds`);
                process.exit(1);
            }, globalTimeout * 1000);
        }
        if (forceSkipOidc && roleToAssume && !AccessKeyId && !webIdentityTokenFile) {
            throw new Error("If 'force-skip-oidc' is true and 'role-to-assume' is set, 'aws-access-key-id' or 'web-identity-token-file' must be set");
        }
        if (specialCharacterWorkaround) {
            // 😳
            disableRetry = false;
            maxRetries = 12;
        }
        else if (maxRetries < 1) {
            maxRetries = 1;
        }
        // Logic to decide whether to attempt to use OIDC or not
        const useGitHubOIDCProvider = () => {
            if (forceSkipOidc)
                return false;
            // The `ACTIONS_ID_TOKEN_REQUEST_TOKEN` environment variable is set when the `id-token` permission is granted.
            // This is necessary to authenticate with OIDC, but not strictly set just for OIDC. If it is not set and all other
            // checks pass, it is likely but not guaranteed that the user needs but lacks this permission in their workflow.
            // So, we will log a warning when it is the only piece absent
            if (!!roleToAssume &&
                !webIdentityTokenFile &&
                !AccessKeyId &&
                !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN &&
                !roleChaining) {
                core.info('It looks like you might be trying to authenticate with OIDC. Did you mean to set the `id-token` permission? ' +
                    'If you are not trying to authenticate with OIDC and the action is working successfully, you can ignore this message.');
            }
            return (!!roleToAssume &&
                !!process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN &&
                !AccessKeyId &&
                !webIdentityTokenFile &&
                !roleChaining);
        };
        if (unsetCurrentCredentials) {
            (0, helpers_1.unsetCredentials)(outputEnvCredentials);
        }
        if (!region.match(REGION_REGEX)) {
            throw new Error(`Region is not valid: ${region}`);
        }
        (0, helpers_1.exportRegion)(region, outputEnvCredentials);
        // Instantiate credentials client
        const clientProps = {
            region,
            roleChaining,
        };
        if (proxyServer)
            clientProps.proxyServer = proxyServer;
        if (noProxy)
            clientProps.noProxy = noProxy;
        const credentialsClient = new CredentialsClient_1.CredentialsClient(clientProps);
        let sourceAccountId;
        let webIdentityToken;
        //if the user wants to attempt to use existing credentials, check if we have some already
        if (useExistingCredentials) {
            const validCredentials = await (0, helpers_1.areCredentialsValid)(credentialsClient);
            if (validCredentials) {
                core.notice('Pre-existing credentials are valid. No need to generate new ones.');
                if (timeoutId)
                    clearTimeout(timeoutId);
                return;
            }
            core.notice('No valid credentials exist. Running as normal.');
        }
        // If OIDC is being used, generate token
        // Else, export credentials provided as input
        if (useGitHubOIDCProvider()) {
            try {
                webIdentityToken = await (0, helpers_1.retryAndBackoff)(async () => {
                    return core.getIDToken(audience);
                }, !disableRetry, maxRetries);
            }
            catch (error) {
                throw new Error(`getIDToken call failed: ${(0, helpers_1.errorMessage)(error)}`);
            }
        }
        else if (AccessKeyId) {
            if (!SecretAccessKey) {
                throw new Error("'aws-secret-access-key' must be provided if 'aws-access-key-id' is provided");
            }
            // The STS client for calling AssumeRole pulls creds from the environment.
            // Plus, in the assume role case, if the AssumeRole call fails, we want
            // the source credentials to already be masked as secrets
            // in any error messages.
            (0, helpers_1.exportCredentials)({ AccessKeyId, SecretAccessKey, SessionToken }, outputCredentials, outputEnvCredentials);
        }
        else if (!webIdentityTokenFile && !roleChaining) {
            // Proceed only if credentials can be picked up
            await credentialsClient.validateCredentials(undefined, roleChaining, expectedAccountIds);
            sourceAccountId = await (0, helpers_1.exportAccountId)(credentialsClient, maskAccountId);
        }
        if (AccessKeyId || roleChaining) {
            // Validate that the SDK can actually pick up credentials.
            // This validates cases where this action is using existing environment credentials,
            // and cases where the user intended to provide input credentials but the secrets inputs resolved to empty strings.
            await credentialsClient.validateCredentials(AccessKeyId, roleChaining, expectedAccountIds);
            sourceAccountId = await (0, helpers_1.exportAccountId)(credentialsClient, maskAccountId);
        }
        // Get role credentials if configured to do so
        if (roleToAssume) {
            let roleCredentials;
            do {
                roleCredentials = await (0, helpers_1.retryAndBackoff)(async () => {
                    return (0, assumeRole_1.assumeRole)({
                        credentialsClient,
                        sourceAccountId,
                        roleToAssume,
                        roleExternalId,
                        roleDuration,
                        roleSessionName,
                        roleSkipSessionTagging,
                        transitiveTagKeys,
                        webIdentityTokenFile,
                        webIdentityToken,
                        inlineSessionPolicy,
                        managedSessionPolicies,
                    });
                }, !disableRetry, maxRetries);
            } while (specialCharacterWorkaround && !(0, helpers_1.verifyKeys)(roleCredentials.Credentials));
            core.info(`Authenticated as assumedRoleId ${roleCredentials.AssumedRoleUser?.AssumedRoleId}`);
            (0, helpers_1.exportCredentials)(roleCredentials.Credentials, outputCredentials, outputEnvCredentials);
            // We need to validate the credentials in 2 of our use-cases
            // First: self-hosted runners. If the GITHUB_ACTIONS environment variable
            //  is set to `true` then we are NOT in a self-hosted runner.
            // Second: Customer provided credentials manually (IAM User keys stored in GH Secrets)
            if (!process.env.GITHUB_ACTIONS || AccessKeyId) {
                await credentialsClient.validateCredentials(roleCredentials.Credentials?.AccessKeyId, roleChaining, expectedAccountIds);
            }
            if (outputEnvCredentials) {
                await (0, helpers_1.exportAccountId)(credentialsClient, maskAccountId);
            }
        }
        else {
            core.info('Proceeding with IAM user credentials');
        }
        // Clear timeout on successful completion
        if (timeoutId)
            clearTimeout(timeoutId);
    }
    catch (error) {
        core.setFailed((0, helpers_1.errorMessage)(error));
        const showStackTrace = process.env.SHOW_STACK_TRACE;
        if (showStackTrace === 'true') {
            throw error;
        }
    }
}
/* c8 ignore start */
/* istanbul ignore next */
if (require.main === module) {
    (async () => {
        await run();
    })().catch((error) => {
        core.setFailed((0, helpers_1.errorMessage)(error));
    });
}
