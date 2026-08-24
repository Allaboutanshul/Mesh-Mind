// lanInfo.ts – helper to retrieve the local LAN IPv4 address (private network)
import os from 'os';

export function getLocalIPv4(): string | null {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        const ip = alias.address;
        if (/^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.|^192\.168\./.test(ip)) {
          return ip;
        }
      }
    }
  }
  return null;
}
