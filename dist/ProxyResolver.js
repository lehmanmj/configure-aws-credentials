"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyResolver = void 0;
const DEFAULT_PORTS = {
    http: 80,
    https: 443,
};
class ProxyResolver {
    constructor(options) {
        // This method matches the interface expected by 'proxy-agent'. It is an arrow function to bind 'this'.
        this.getProxyForUrl = (url, _req) => {
            return this.getProxyForUrlOptions(url, this.options);
        };
        this.options = options;
    }
    getProxyForUrlOptions(url, options) {
        let parsedUrl;
        try {
            parsedUrl = typeof url === 'string' ? new URL(url) : url;
        }
        catch (_) {
            return ''; // Don't proxy invalid URLs.
        }
        const proto = parsedUrl.protocol.split(':', 1)[0];
        if (!proto)
            return ''; // Don't proxy URLs without a protocol.
        const hostname = parsedUrl.host;
        const port = parseInt(parsedUrl.port || '') || DEFAULT_PORTS[proto] || 0;
        if (options?.noProxy && !this.shouldProxy(hostname, port, options.noProxy))
            return '';
        if (proto === 'http' && options?.httpProxy)
            return options.httpProxy;
        if (proto === 'https' && options?.httpsProxy)
            return options.httpsProxy;
        return ''; // No proxy configured for this protocol or unknown protocol
    }
    shouldProxy(hostname, port, noProxy) {
        if (!noProxy)
            return true;
        if (noProxy === '*')
            return false; // Never proxy if wildcard is set.
        return noProxy.split(/[,\s]/).every((proxy) => {
            if (!proxy)
                return true; // Skip zero-length hosts.
            const parsedProxy = proxy.match(/^(.+):(\d+)$/);
            const parsedProxyHostname = parsedProxy ? parsedProxy[1] : proxy;
            const parsedProxyPort = parsedProxy?.[2] ? parseInt(parsedProxy[2]) : 0;
            if (parsedProxyPort && parsedProxyPort !== port)
                return true; // Skip if ports don't match.
            if (parsedProxyHostname && !/^[.*]/.test(parsedProxyHostname)) {
                // No wildcards, so stop proxying if there is an exact match.
                return hostname !== parsedProxyHostname;
            }
            let cleanProxyHostname = parsedProxyHostname;
            if (parsedProxyHostname && parsedProxyHostname.charAt(0) === '*') {
                // Remove leading wildcard.
                cleanProxyHostname = parsedProxyHostname.slice(1);
            }
            // Stop proxying if the hostname ends with the no_proxy host.
            return !cleanProxyHostname || !hostname.endsWith(cleanProxyHostname);
        });
    }
}
exports.ProxyResolver = ProxyResolver;
//# sourceMappingURL=ProxyResolver.js.map