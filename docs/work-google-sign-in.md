# Google sign-in for Work

Google is now enabled in Supabase, and local sign-in has been verified with the school admin account. These console steps are retained as a setup reference. No Google secret needs to be pasted into chat or committed to the repository.

## 1. Create the Google client

Open [Google Auth Platform](https://console.cloud.google.com/auth/overview) and create or select a Google Cloud project.

- **Branding:** set the app name to `3256 Tools`, with your support email and developer contact.
- **Audience:** choose **External**, so both Gmail and Warrior Life accounts can sign in. If the app is in Testing, add your three initial admin emails as test users, and add teammates who need to test.
- **Data Access:** use only `openid`, `https://www.googleapis.com/auth/userinfo.email`, and `https://www.googleapis.com/auth/userinfo.profile`.
- **Clients → Create client:** choose **Web application**.

Set **Authorized JavaScript origins** to:

```text
http://localhost:3000
```

Also add the website's real HTTPS origin when deploying.

Set **Authorized redirect URIs** to this exact Supabase callback:

```text
https://immxwetvhuaimgwthcrl.supabase.co/auth/v1/callback
```

Create the client and retain its Client ID and Client Secret.

## 2. Enable Google in Supabase

Open [this project's Auth providers](https://supabase.com/dashboard/project/immxwetvhuaimgwthcrl/auth/providers), select Google, enable it, enter the Client ID and Client Secret, and save. Keep nonce verification enabled.

## 3. Allow the app callback

In [Supabase Auth URL Configuration](https://supabase.com/dashboard/project/immxwetvhuaimgwthcrl/auth/url-configuration), add this redirect URL, preserving existing entries:

```text
http://localhost:3000/auth/work/callback
```

For production, also add `https://YOUR-WEBSITE-DOMAIN/auth/work/callback`. Set the Site URL to the real deployed website when appropriate for the whole project. The Google callback and the app callback above are different URLs and belong in different consoles.

## 4. Sign in and manage your team

Open [Work sign-in](http://localhost:3000/work/login) and choose **Continue with Google**. These emails already have initial admin access:

- `ryan.ryanabraham@gmail.com`
- `ryan.abraham@warriorlife.net`
- `robotics@warriorlife.net`

In **Work → Settings → People**, admins can add email addresses, set Admin/Member/Viewer roles, and disable or restore access. Adding an email grants access; it does not send an invitation email. Each teammate then signs in using their own Google account. A Google account that has not been added is denied Work access. School accounts may also need permission from their Google Workspace administrator.

Work uses individual verified Google identities. The other team tools retain their existing team-code login. Local OAuth completion is verified with the school admin account. Production sign-in and real account sign-out still need verification. Database tests verified initial admins, account binding, role enforcement, and prevention of self-demotion.

Reference: [Supabase Google sign-in documentation](https://supabase.com/docs/guides/auth/social-login/auth-google).
