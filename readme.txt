Kijiji Scraper

Kijiji Scraper is a kijiji-bot to periodically perform the searches you tell it you're interested in. It will then email you with any new ads listed under those searches.

Configuration:
1. Create a config.js file based off the config.js.example file included.
2. Fill in the config values
3. (ONLY IF PASSWORD AUTH IS USED, NOT NEEDED FOR OAUTH2) - Log into your gmail account and allow insecure api apps
   - https://support.google.com/accounts/answer/6010255?hl=en

Running the App:
1. Install node 5.x
2. Install this app's dependencies: `npm install` from the root directory of the project
3. Run the app as a server: `node server` from the root directory of the project
