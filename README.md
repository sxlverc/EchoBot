# Astro Bot 🤖🚀

A Discord bot for the **Kitty Voyage** server, themed around a spacey train ride. Astro is your friendly bot companion that brings fun, utility, and organization to your Discord experience!

## Features

### Core Features
- **XP Leveling System** - Gain XP through messages and voice chat, level up and earn roles
### **Music Player** - Play YouTube music in voice channels with queue management (uses play-dl for reliable YouTube access)

#### YouTube Cookies Setup
To prevent "Sign in to confirm you're not a bot" errors, you need to provide YouTube cookies:

1. Create a `cookies.txt` file in the bot's root directory
2. Add your YouTube cookies in Netscape format (see `cookies.txt` for instructions)
3. Restart the bot

**Without cookies, YouTube may block music requests.**
- **Bump Reminder** - Automatic reminders for Disboard bumps
- **Voice Master** - Dynamic voice channel creation and management
- **Games** - Play Battleship, Tic-Tac-Toe, and Connect 4
- **Server Logging** - Tracks message logs, server logs, role logs, and VC logs
- **Data Cleanup** - Automated cleanup of old data
- **Welcome Messages** - Custom embed welcomes with user pings

### Commands
- `/play <url>` - Play music from YouTube URLs (supports videos and playlist links)
- `/skip` - Skip the current song
- `/pause` - Pause the current song
- `/resume` - Resume a paused song
- `/stop` - Stop music and clear the queue
- `/queue` - Show the current music queue
- `/brick` - Brick someone (fun interaction)
- `/hump` - Hump command (fun interaction)
- `/poll` - Create interactive polls
- `/quoteit` - Quote messages
- `/reactionrole` - Set up reaction roles
- `/rules` - Manage server rules with embeds
- `/tell` - Send anonymous messages
- `/topic` - Generate conversation starters


## PM2 Process Management

AstroBot is configured for PM2 process management, just like CackleCrewBot.

### Basic PM2 Commands
```bash
# Start AstroBot
pm2 start ecosystem.config.js

# Stop AstroBot
pm2 stop AstroBot

# Restart AstroBot
pm2 restart AstroBot

# View logs
pm2 logs AstroBot

# Check status
pm2 list
```

### PM2 Features
- **Auto-restart** on crashes
- **Memory monitoring** (restarts if >1GB usage)
- **Log management** (logs saved to `./logs/` directory)
- **Environment variable** loading from `.env`

## Configuration

### config.json Structure
```json
{
  "channels": {
    "greeting": "welcome_channel_id",
    "levelUp": "level_up_channel_id",
    "vcLogs": "voice_logs_channel_id",
    "serverLogs": "server_logs_channel_id",
    "roleLogs": "role_logs_channel_id",
    "messageLogs": "message_logs_channel_id"
  },
  "roles": {
    "newcomer": "newcomer_role_id",
    "levels": {
      "2": "level_2_role_id",
      "5": "level_5_role_id"
    }
  },
  "features": {
    "xp": {
      "messageXP": 10,
      "voiceXPPerMinute": 5
    },
    "welcome": {
      "gifUrl": "welcome_gif_url"
    }
  }
}
```

### Environment Variables
- `DISCORD_TOKEN` - Your bot's Discord token
- `CLIENT_ID` - Your bot's client ID
- `GUILD_ID` - Your Discord server's ID

## Bot Permissions

The bot requires the following permissions:
- Read Messages
- Send Messages
- Embed Links
- Read Message History
- Use Slash Commands
- Manage Roles (for reaction roles and leveling)
- Manage Channels (for voice master)
- View Audit Log (for logging)
- Connect/Speak (for voice features)

## Customization

### Welcome Messages
Edit the `gifUrl` in `config.json` to change the welcome embed image.

### XP System
Adjust XP rates and level requirements in the `features.xp` section of `config.json`.

### Logging
Configure which events are logged by modifying the channel IDs in `config.json`.

## Troubleshooting

### Music Bot Issues
- **"Sign in to confirm you're not a bot"**: Add YouTube cookies to `cookies.txt`
- **"Please provide a valid YouTube URL"**: Make sure the URL is a direct YouTube video or playlist link
- **No audio plays**: Check bot permissions in voice channel (Connect + Speak)
- **Bot doesn't join voice channel**: Ensure you're in a voice channel when using music commands

## License

ISC License - Feel free to use and modify for your own server!