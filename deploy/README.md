# Raspberry Pi deployment

The React application and Express API run locally on the Raspberry Pi. Tailscale
Serve makes Nginx available to devices on your tailnet; the camera stream remains
on its existing Tailscale WebRTC/WHEP URL.

## Traffic flow

`tailnet device -> Tailscale Serve -> Nginx on 127.0.0.1:80`

Nginx serves the frontend and proxies `/api/*` to Express on
`127.0.0.1:3000`. The browser connects directly to MediaMTX for video. Do not
route the WebRTC media or ICE ports through Tailscale Serve.

## Raspberry Pi

1. Build and deploy the frontend with `client/deploy.sh`.
2. Install `deploy/nginx/camera.conf`, enable it, validate with `nginx -t`, and
   reload Nginx.
3. Copy `server/.env.example` to `server/.env`, set a long random `JWT_SECRET`,
   and configure `TAPO_DEVICE_IP`, `TAPO_EMAIL`, and `TAPO_PASSWORD`. Keep
   `server/.env` private; it is ignored by Git. Reserve the plug's IP address
   (`192.168.1.27` in this setup) in your router so it stays fixed.
4. Start the Express API and ensure its SQLite database is available from the
   server's working directory.
5. Configure Tailscale Serve to proxy the Pi's tailnet HTTPS address to
   `http://127.0.0.1:80`, for example:

   ```sh
   sudo tailscale serve --bg http://127.0.0.1:80
   sudo tailscale serve status
   ```

6. Verify `https://<pi-name>.<tailnet-name>.ts.net/api/health`, then sign in.

For production, leave `VITE_API_URL` unset or set it to `/api`; preserve the
existing Tailscale `VITE_WEBRTC_URL`.
