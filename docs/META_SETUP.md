# Meta developer setup

1. developers.facebook.com → My Apps → Create App → type **Business**
2. Add the **WhatsApp** product
3. WhatsApp → API Setup → copy the test number's Phone Number ID into `.env` (`WHATSAPP_PHONE_NUMBER_ID`)
4. Business Settings → Users → System Users → Add → role **Admin**
5. Generate token → select this app → scopes `whatsapp_business_messaging`, `whatsapp_business_management` → copy into `.env` (`WHATSAPP_ACCESS_TOKEN`)
6. App Settings → Basic → App Secret → copy into `.env` (`WHATSAPP_APP_SECRET`)
7. Invent a string and set it as `.env`'s `WHATSAPP_VERIFY_TOKEN`
8. `ngrok http 3001`
9. WhatsApp → Configuration → Webhook → Callback URL `<ngrok URL>/api/whatsapp/webhook`, Verify token = `WHATSAPP_VERIFY_TOKEN`
10. Subscribe the webhook to the `messages` field
11. Subscribe the app to the WABA:
    ```shell
    curl -X POST "https://graph.facebook.com/v23.0/<WABA_ID>/subscribed_apps" \
      -H "Authorization: Bearer <WHATSAPP_ACCESS_TOKEN>"
    ```
12. WhatsApp → API Setup → To section → add up to 5 recipient test numbers
13. WhatsApp → API Setup → From number → complete phone number verification
