# EchoBot 🐾

A Discord bot for **The Floof Squad** server. Handles XP levelling, voice channels, link fixing, bump reminders, birthdays, games, logging, polls, suggestions, and more.

## Features

- **XP & Levelling** — Earn XP from messages and voice chat, level up, and unlock roles
- **Voice Master** — Dynamic voice channel creation and management
- **Link Fixer** — Automatically replaces Twitter/X, TikTok, and Instagram links with better embeds
- **Bump Reminder** — Automatic reminders for Disboard and Discadia bumps
- **Birthdays** — Track and announce member birthdays
- **Welcome Messages** — Custom embed welcome with GIF on member join
- **Server Logging** — Message edits/deletes, role changes, VC activity, member events
- **Starboard** — Highlight popular messages to a dedicated channel
- **Reaction Roles** — Self-assignable roles via button panels
- **Polls** — Timed interactive polls with vote tracking
- **Suggestions** — Submit, track, and moderate server suggestions
- **Games** — Battleship, Tic-Tac-Toe, Connect 4
- **Reminders** — Personal reminders via DM
- **Bot Responses** — Configurable auto-responses to keywords
- **Data Cleanup** — Automated removal of stale data

## Commands

### XP & Levelling
| Command | Description |
|---|---|
| `/rank` | View your XP rank and level progress |
| `/leaderboard` | Server XP leaderboard |
| `/xp` | Admin XP management (add/remove/reset) |
| `/setlevelrole` | Assign a role to a level threshold |
| `/configxp` | Configure XP rates, cooldowns, excluded channels |

### Fun
| Command | Description |
|---|---|
| `/brick` | Brick someone (animated GIF) |
| `/hump` | Hump command (animated GIF) |
| `/poll` | Create a timed poll with up to 4 choices |
| `/quoteit` | Turn a message into a styled quote image |
| `/topic` | Generate a random conversation starter |
| `/tell` | Send an anonymous message to a user |
| `/time` | Show the current time in US timezones |
| `/timestamp` | Generate a Discord timestamp for any date/time |

### Suggestions
| Command | Description |
|---|---|
| `/suggest` | Submit a suggestion |
| `/suggestions` | Browse all suggestions |
| `/suggestion-result` | Mark a suggestion as accepted/rejected/implemented |

### Voice
| Command | Description |
|---|---|
| `/voicemaster` | Manage your dynamic voice channel |
| `/configvoicemaster` | Configure the join-to-create channel |

### Server Management
| Command | Description |
|---|---|
| `/reactionrole` | Create and manage reaction role panels |
| `/starboard` | Configure the starboard channel and threshold |
| `/logger` | Configure server logging channels and events |
| `/remind` | Set a personal reminder |
| `/message` | Send or manage embedded messages |
| `/responses` | Configure auto-response triggers |
| `/configpresence` | Set bot status and rotating activities |
| `/configwelcome` | Set the welcome GIF and channel |

### Birthdays
| Command | Description |
|---|---|
| `/setbirthday` | Set your birthday |
| `/checkbirthdays` | View upcoming birthdays |
| `/configbirthdays` | Configure the birthday announcement channel |

### Link Fixer
| Command | Description |
|---|---|
| `/configlinkfixer` | Enable/disable link fixing and embed suppression |

Supported platforms: **Twitter/X**, **TikTok**, **Instagram** (posts and reels).

### Bump Reminder
| Command | Description |
|---|---|
| `/bumpreminder` | Manually trigger or configure bump reminders |

Supports **Disboard** and **Discadia**.

## Configuration

All server settings live in `config.json` keyed by guild ID. Key sections:

```json
{
  "GUILD_ID": {
    "channels": { "greeting": "...", "levelUp": "...", "bump": "...", "vcLogs": "...", "serverLogs": "...", "roleLogs": "...", "messageLogs": "...", "quotes": "..." },
    "roles": { "newcomer": "...", "birthday": "...", "vcPing": "...", "levels": { "2": "...", "5": "...", "10": "..." } },
    "features": {
      "xp": { "enabled": true, "messageXP": 10, "voiceXPPerMinute": 5, "xpPerLevel": 100 },
      "voicemaster": { "enabled": true, "joinToCreateChannel": "..." },
      "welcome": { "enabled": true, "gifUrl": "..." },
      "linkFixer": { "enabled": true, "suppressEmbeds": true },
      "birthdays": { "enabled": true },
      "bumpReminder": { "enabled": true, "disboard": true, "discadia": true },
      "serverLogger": { "enabled": true },
      "suggestions": { "requireRecentActivity": false }
    }
  }
}
```

## Environment Variables

Create a `.env` file in the project root (never commit this file):

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token from Discord Developer Portal |
| `CLIENT_ID` | Bot's application/client ID |
| `GUILD_ID` | The Floof Squad server ID |

## Setup

```bash
npm install
node deploy-commands.js   # register slash commands
pm2 start ecosystem.config.js
```

## PM2

```bash
pm2 start ecosystem.config.js  # start
pm2 stop EchoBot-FloofSquad    # stop
pm2 restart EchoBot-FloofSquad # restart
pm2 logs EchoBot-FloofSquad    # view logs
pm2 list                       # status
```

Logs are saved to `./logs/`. Auto-restarts on crash, restarts if memory exceeds 1 GB.

## Permissions Required

`Send Messages` · `Embed Links` · `Read Message History` · `Use Slash Commands` · `Manage Roles` · `Manage Channels` · `View Audit Log` · `Add Reactions`

## License

ISC
