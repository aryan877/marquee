# Wrangler

Wrangler is only used for Cloudflare R2 bucket operations. The Marquee worker runs on the VPS and writes to R2 through S3-compatible env vars, so no `wrangler.toml` Worker binding is required.

```bash
wrangler r2 bucket list
wrangler r2 bucket create marquee-assets
wrangler r2 bucket dev-url get marquee-assets
wrangler r2 bucket dev-url enable marquee-assets --force
```
