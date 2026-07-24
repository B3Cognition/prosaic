'use strict';

/**
 * `--require`-loadable preload script (NODE_OPTIONS) that blocks any outbound
 * network attempt for the duration of the process. Used by run-example.ts to
 * prove Example manifest steps make zero network calls (FR-003/NFR-004), and
 * usable by a reader manually re-running the same command with the guard
 * enabled, since it patches the runtime rather than a Jest-side mock.
 */

class NetworkCallBlockedError extends Error {
  constructor(api) {
    super(`Network call blocked by network-guard-preload: ${api}() was invoked`);
    this.name = 'NetworkCallBlockedError';
  }
}

const http = require('http');
const https = require('https');
const net = require('net');
const dns = require('dns');

http.request = function blockedHttpRequest() {
  throw new NetworkCallBlockedError('http.request');
};
http.get = function blockedHttpGet() {
  throw new NetworkCallBlockedError('http.get');
};

https.request = function blockedHttpsRequest() {
  throw new NetworkCallBlockedError('https.request');
};
https.get = function blockedHttpsGet() {
  throw new NetworkCallBlockedError('https.get');
};

net.connect = function blockedNetConnect() {
  throw new NetworkCallBlockedError('net.connect');
};
net.createConnection = function blockedNetCreateConnection() {
  throw new NetworkCallBlockedError('net.createConnection');
};

dns.lookup = function blockedDnsLookup() {
  throw new NetworkCallBlockedError('dns.lookup');
};

module.exports = { NetworkCallBlockedError };
