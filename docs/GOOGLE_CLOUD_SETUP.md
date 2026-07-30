# Google Cloud setup

1. Google Cloud Console → create or select a project
2. APIs & Services → Library → enable **Google Calendar API**
3. APIs & Services → OAuth consent screen → User type **External**
4. Add scope `https://www.googleapis.com/auth/calendar.events`
5. Add your Google account under **Test users**
6. APIs & Services → Credentials → Create Credentials → OAuth client ID → Application type **Web application**
7. Authorized redirect URI: `http://localhost:3001/api/auth/callback/google`
8. Copy the Client ID and Client secret into `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
