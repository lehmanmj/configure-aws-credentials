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
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanup = cleanup;
const core = __importStar(require("@actions/core"));
const helpers_1 = require("../helpers");
/**
 * When the GitHub Actions job is done, clean up any environment variables that
 * may have been set by the configure-aws-credentials steps in the job.
 *
 * Environment variables are not intended to be shared across different jobs in
 * the same GitHub Actions workflow: GitHub Actions documentation states that
 * each job runs in a fresh instance.  However, doing our own cleanup will
 * give us additional assurance that these environment variables are not shared
 * with any other jobs.
 */
function cleanup() {
    // Only attempt to change environment variables if we changed them in the first place
    if ((0, helpers_1.getBooleanInput)('output-env-credentials', { required: false, default: true })) {
        try {
            // The GitHub Actions toolkit does not have an option to completely unset
            // environment variables, so we overwrite the current value with an empty
            // string. The AWS CLI and AWS SDKs will behave correctly: they treat an
            // empty string value as if the environment variable does not exist.
            core.exportVariable('AWS_ACCESS_KEY_ID', '');
            core.exportVariable('AWS_SECRET_ACCESS_KEY', '');
            core.exportVariable('AWS_SESSION_TOKEN', '');
            core.exportVariable('AWS_DEFAULT_REGION', '');
            core.exportVariable('AWS_REGION', '');
        }
        catch (error) {
            core.setFailed((0, helpers_1.errorMessage)(error));
        }
    }
}
/* c8 ignore start */
if (require.main === module) {
    try {
        cleanup();
    }
    catch (error) {
        core.setFailed((0, helpers_1.errorMessage)(error));
    }
}
//# sourceMappingURL=index.js.map