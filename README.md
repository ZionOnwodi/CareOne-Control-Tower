# CareOne Enterprise Control Tower — V0.1

<!-- test edit: verifying commit/push workflow -->


## Run locally
    npm install
    npm run dev

## Deploy to Vercel (recommended, free)
1. Push this folder to a new GitHub repository.
2. Go to vercel.com -> Sign up free with GitHub -> "Add New Project" -> import the repo.
3. Vercel auto-detects Vite; click Deploy.
4. You get a permanent URL like https://careone-control-tower.vercel.app
   Every future `git push` redeploys automatically.

## Deploy to Netlify instead (no GitHub needed)
1. Run: npm install && npm run build   (creates a `dist` folder)
2. Go to app.netlify.com/drop and drag the `dist` folder in.
3. You get a live URL immediately. Free tier, no account strictly required
   for the initial drop, though a free account lets you keep/update it.
