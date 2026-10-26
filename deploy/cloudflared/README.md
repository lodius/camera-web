# Cloudflare Tunnel deployment

This publishes the React application and Express API through Cloudflare Tunnel.
It does not publish MediaMTX: WebRTC media remains on the existing Tailscale
WHEP URL.

## Traffic flow

`https://camera.example.com` -> Cloudflare Tunnel -> local Nginx -> React build
and `/api/*` -> Express on `127.0.0.1:3000`.

Do not add MediaMTX WebRTC (`8889`) or ICE (`8189/udp`) as a Tunnel public
hostname.

## Cloudflare

1. Add the domain to Cloudflare and create a remotely-managed tunnel named
   `raspberry-pi-camera` in **Zero Trust > Networks > Tunnels**.
2. Add a Published application route for the selected hostname with Service URL
   `http://127.0.0.1:80`.
3. Store its token only in `/etc/cloudflared/camera-tunnel.env`.

## Raspberry Pi

1. Build and deploy the frontend with `client/deploy.sh`.
2. Install `deploy/nginx/camera.conf`, enable it, validate using `nginx -t`,
   then reload Nginx.
3. Copy the environment template to `/etc/cloudflared/camera-tunnel.env`, add
   the token, and set mode `0600`.
4. Install the systemd unit, then run `systemctl daemon-reload` and enable it.
5. Verify `https://camera.example.com/api/health`, then sign in.

For production, leave `VITE_API_URL` unset or set it to `/api`; preserve the
existing Tailscale `VITE_WEBRTC_URL`.
