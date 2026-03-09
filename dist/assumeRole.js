"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assumeRole = assumeRole;
const node_assert_1 = __importDefault(require("node:assert"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const core = __importStar(require("@actions/core"));
const client_sts_1 = require("@aws-sdk/client-sts");
const helpers_1 = require("./helpers");
async function assumeRoleWithOIDC(params, client, webIdentityToken) {
    delete params.Tags;
    delete params.TransitiveTagKeys;
    core.info('Assuming role with OIDC');
    try {
        const creds = await client.send(new client_sts_1.AssumeRoleWithWebIdentityCommand({
            ...params,
            WebIdentityToken: webIdentityToken,
        }));
        return creds;
    }
    catch (error) {
        throw new Error(`Could not assume role with OIDC: ${(0, helpers_1.errorMessage)(error)}`);
    }
}
async function assumeRoleWithWebIdentityTokenFile(params, client, webIdentityTokenFile, workspace) {
    core.debug('webIdentityTokenFile provided. Will call sts:AssumeRoleWithWebIdentity and take session tags from token contents.');
    const webIdentityTokenFilePath = node_path_1.default.isAbsolute(webIdentityTokenFile)
        ? webIdentityTokenFile
        : node_path_1.default.join(workspace, webIdentityTokenFile);
    if (!node_fs_1.default.existsSync(webIdentityTokenFilePath)) {
        throw new Error(`Web identity token file does not exist: ${webIdentityTokenFilePath}`);
    }
    core.info('Assuming role with web identity token file');
    try {
        const webIdentityToken = node_fs_1.default.readFileSync(webIdentityTokenFilePath, 'utf8');
        delete params.Tags;
        const creds = await client.send(new client_sts_1.AssumeRoleWithWebIdentityCommand({
            ...params,
            WebIdentityToken: webIdentityToken,
        }));
        return creds;
    }
    catch (error) {
        throw new Error(`Could not assume role with web identity token file: ${(0, helpers_1.errorMessage)(error)}`);
    }
}
async function assumeRoleWithCredentials(params, client) {
    core.info('Assuming role with user credentials');
    try {
        const creds = await client.send(new client_sts_1.AssumeRoleCommand({ ...params }));
        return creds;
    }
    catch (error) {
        throw new Error(`Could not assume role with user credentials: ${(0, helpers_1.errorMessage)(error)}`);
    }
}
async function assumeRole(params) {
    const { credentialsClient, sourceAccountId, roleToAssume, roleExternalId, roleDuration, roleSessionName, roleSkipSessionTagging, transitiveTagKeys, webIdentityTokenFile, webIdentityToken, inlineSessionPolicy, managedSessionPolicies, } = { ...params };
    // Load GitHub environment variables
    const { GITHUB_REPOSITORY, GITHUB_WORKFLOW, GITHUB_ACTION, GITHUB_ACTOR, GITHUB_SHA, GITHUB_WORKSPACE } = process.env;
    if (!GITHUB_REPOSITORY || !GITHUB_WORKFLOW || !GITHUB_ACTION || !GITHUB_ACTOR || !GITHUB_SHA || !GITHUB_WORKSPACE) {
        throw new Error('Missing required environment variables. Are you running in GitHub Actions?');
    }
    // Load role session tags
    const tagArray = [
        { Key: 'GitHub', Value: 'Actions' },
        { Key: 'Repository', Value: GITHUB_REPOSITORY },
        { Key: 'Workflow', Value: (0, helpers_1.sanitizeGitHubVariables)(GITHUB_WORKFLOW) },
        { Key: 'Action', Value: GITHUB_ACTION },
        { Key: 'Actor', Value: (0, helpers_1.sanitizeGitHubVariables)(GITHUB_ACTOR) },
        { Key: 'Commit', Value: GITHUB_SHA },
    ];
    if (process.env.GITHUB_REF) {
        tagArray.push({
            Key: 'Branch',
            Value: (0, helpers_1.sanitizeGitHubVariables)(process.env.GITHUB_REF),
        });
    }
    const tags = roleSkipSessionTagging ? undefined : tagArray;
    if (!tags) {
        core.debug('Role session tagging has been skipped.');
    }
    else {
        core.debug(`${tags.length} role session tags are being used.`);
    }
    //only populate transitiveTagKeys array if user is actually using session tagging
    const transitiveTagKeysArray = roleSkipSessionTagging
        ? undefined
        : transitiveTagKeys?.filter((key) => tags?.some((tag) => tag.Key === key));
    // Calculate role ARN from name and account ID (currently only supports `aws` partition)
    let roleArn = roleToAssume;
    if (!roleArn.startsWith('arn:aws')) {
        (0, node_assert_1.default)((0, helpers_1.isDefined)(sourceAccountId), 'Source Account ID is needed if the Role Name is provided and not the Role Arn.');
        roleArn = `arn:aws:iam::${sourceAccountId}:role/${roleArn}`;
    }
    // Ready common parameters to assume role
    const commonAssumeRoleParams = {
        RoleArn: roleArn,
        RoleSessionName: roleSessionName,
        DurationSeconds: roleDuration,
        Tags: tags ? tags : undefined,
        TransitiveTagKeys: transitiveTagKeysArray ? transitiveTagKeysArray : undefined,
        ExternalId: roleExternalId ? roleExternalId : undefined,
        Policy: inlineSessionPolicy ? inlineSessionPolicy : undefined,
        PolicyArns: managedSessionPolicies?.length ? managedSessionPolicies : undefined,
    };
    const keys = Object.keys(commonAssumeRoleParams);
    keys.forEach((k) => {
        if (commonAssumeRoleParams[k] === undefined) {
            delete commonAssumeRoleParams[k];
        }
    });
    // Instantiate STS client
    const stsClient = credentialsClient.stsClient;
    // Assume role using one of three methods
    if (!!webIdentityToken) {
        return assumeRoleWithOIDC(commonAssumeRoleParams, stsClient, webIdentityToken);
    }
    if (!!webIdentityTokenFile) {
        return assumeRoleWithWebIdentityTokenFile(commonAssumeRoleParams, stsClient, webIdentityTokenFile, GITHUB_WORKSPACE);
    }
    return assumeRoleWithCredentials(commonAssumeRoleParams, stsClient);
}
//# sourceMappingURL=assumeRole.js.map