# Google Authentication Setup Guide

To enable "Sign in with Google" for your Supabase project, follow these steps:

## 1. Google Cloud Console Setup

1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  **Create a new project** (or select an existing one).
3.  Navigate to **APIs & Services > OAuth consent screen**.
    *   Select **External** (unless you're in an organization).
    *   Fill in the required fields (App name, support email, etc.).
    *   Click **Save and Continue**.
4.  Navigate to **APIs & Services > Credentials**.
    *   Click **+ Create Credentials** > **OAuth client ID**.
    *   Application type: **Web application**.
    *   Name: `Supabase Auth` (or similar).
    *   **Authorized JavaScript origins**:
        *   `http://localhost:3000` (or your local port, e.g., `http://localhost:3001`)
        *   `https://ognusjgoyvhihypbtgvl.supabase.co` (Your Supabase URL)
        *   `https://cashflow-487122773776.us-west1.run.app` **(Your Cloud Run App)**
    *   **Authorized redirect URIs**:
        *   `https://ognusjgoyvhihypbtgvl.supabase.co/auth/v1/callback`
    *   Click **Create**.
5.  **Copy** the `Client ID` and `Client Secret`.

## 2. Supabase Dashboard Setup

1.  Go to your [Supabase Dashboard](https://supabase.com/dashboard/project/ognusjgoyvhihypbtgvl).
2.  Navigate to **Authentication > Providers**.
3.  Click on **Google**.
4.  **Enable** "Google" provider.
5.  Paste the **Client ID** and **Client Secret** from the previous step.
6.  Click **Save**.

## 3. URL Configuration

1.  In Supabase, go to **Authentication > URL Configuration**.
2.  **Site URL**: Set this to your production URL: `https://cashflow-487122773776.us-west1.run.app`
3.  **Redirect URLs**: Add the following:
    *   `http://localhost:3000/*` (and `3001` just in case)
    *   `https://cashflow-487122773776.us-west1.run.app/*`

Once these steps are done, the "Sign in with Google" button will work for both your local environment and your hosted app!
