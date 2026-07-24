'use strict';

/**
 * `--require`-loadable preload script (NODE_OPTIONS) that blocks any outbound
 * network attempt for the duration of the process. Used by run-example.ts to
 * prove Example manifest steps make zero network calls (FR-003/NFR-004), and
 * usable by a reader manually re-running the same command with the guard
 * enabled, since it patches the runtime rather than a Jest-side mock.
 *
 * When NETWORK_GUARD_COUNT_FILE is set, the number of blocked-call attempts
 * is written to that path on process exit, giving callers a measured
 * call-count artifact rather than relying on absence-of-a-thrown-error alone.
 */

class NetworkCallBlockedError extends Error {
  constructor(api) {
    super(`Network call blocked by network-guard-preload: ${api}() was invoked`);
    this.name = 'NetworkCallBlockedError';
  }
}

const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const dns = require('dns');

let networkCallCount = 0;

function recordAndBlock(api) {
  networkCallCount += 1;
  throw new NetworkCallBlockedError(api);
}

http.request = function blockedHttpRequest() {
  recordAndBlock('http.request');
};
http.get = function blockedHttpGet() {
  recordAndBlock('http.get');
};

https.request = function blockedHttpsRequest() {
  recordAndBlock('https.request');
};
https.get = function blockedHttpsGet() {
  recordAndBlock('https.get');
};

net.connect = function blockedNetConnect() {
  recordAndBlock('net.connect');
};
net.createConnection = function blockedNetCreateConnection() {
  recordAndBlock('net.createConnection');
};

dns.lookup = function blockedDnsLookup() {
  recordAndBlock('dns.lookup');
};

if (process.env.NETWORK_GUARD_COUNT_FILE) {
  process.on('exit', () => {
    try {
      fs.writeFileSync(process.env.NETWORK_GUARD_COUNT_FILE, JSON.stringify({ networkCallCount }));
    } catch {
      // Best-effort: the process is already exiting.
    }
  });
}

module.exports = { NetworkCallBlockedError };
