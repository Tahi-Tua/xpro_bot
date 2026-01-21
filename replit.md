# Xavier Pro Discord Bot

## Overview
This is a Discord bot for the Xavier Pro gaming community. It handles member management, moderation, recruitment, and various automated tasks.

## Project Structure
```
project/
├── config/
│   └── channels.js       # All channel IDs, role names, admin ID
├── handlers/
│   ├── rules.js          # Accept rules button
│   ├── welcome.js        # Welcome payload
│   ├── joinUs.js         # Ticket creation + admin DM notification
│   ├── modDecision.js    # Accept/Decline buttons
│   ├── generalChat.js    # Text-only enforcement
│   ├── screenshots.js    # Media-only enforcement
│   ├── badwords.js       # Bad word filter
│   ├── spam.js           # Anti-spam
│   └── heroTips.js       # Hero tips with smart update
├── events/
│   ├── memberJoin.js
│   └── memberLeave.js
├── commands/moderation/  # Slash commands (ban, kick, mute, unmute, clear, scan)
├── utils/
│   ├── badwords.json     # Bad word list
│   └── historyScanner.js # History scanning utility
├── data/
│   ├── heroes/           # Individual hero files
│   ├── heroState.json    # Hero message state tracking
│   ├── channelState.json # Channel message state tracking
│   └── scanState.json    # Scan progress tracking
├── index.js
└── deploy-commands.js
```

## Configuration

### Environment Variables
- `TOKEN` - Discord bot token (required, stored as secret)
- `HELLO_CHANNEL_ID` - Optional override for hello-goodbye channel ID

### Channel IDs (in config/channels.js)
- **RULES_CHANNEL_ID**: xpro-induction channel
- **WELCOME_CHANNEL_ID**: synd-requirement channel
- **JOIN_US_CHANNEL_ID**: join-us channel
- **GENERAL_CHAT_ID**: general-chat channel
- **SCREENSHOTS_CHANNEL_ID**: screenshots channel
- **DIVINE_TIPS_CHANNEL_ID**: divine-tips channel
- **HERO_TIPS_CHANNEL_ID**: hero-tips channel
- **HELLO_CHANNEL_ID**: hello-goodbye channel
- **STAFF_LOG_CHANNEL_ID**: Accept rules logs (1447653036708069568)
- **MODERATION_LOG_CHANNEL_ID**: Spam/badwords logs (1380197851371409482)

### Role Names & IDs
- **MEMBER_ROLE_NAME**: "𝔵𝔞𝔳𝔦𝔢𝔯 𝑝𝑟𝑜"
- **MOD_ROLE_NAME**: "𝔵𝔞𝔳𝔦𝔢𝔯 𝑝𝑟𝑜"
- **PENDING_ROLE_ID**: En attente role
- **ADMIN_USER_ID**: 1349048881966747699

## Features
1. **Welcome System**: Automated welcome messages and role assignment
2. **Recruitment System**: Automated ticket creation for new applicants + admin DM notification
3. **Moderation**: Slash commands for ban, kick, mute, unmute, clear, scan
4. **Content Filtering**: Bad word detection and image link filtering
5. **Anti-Spam**: Rate limiting and spam detection
6. **Member Tracking**: Join/leave notifications
7. **Hero Tips**: Individual hero guides with smart update system
8. **History Scanner**: Scan old messages for spam/badwords with `/scan` command

## Smart Update System
The bot uses a smart update system for channel messages:
- Messages are only updated if their content has changed
- Uses hash comparison to detect changes
- State is stored in `data/channelState.json` and `data/heroState.json`
- No unnecessary message deletion/resending on restart

## History Scanner (`/scan` command)
Scan channel history for violations:
- **Options:**
  - `channel` - Channel to scan (default: current)
  - `limit` - Max messages to scan (10-1000, default: 500)
  - `delete` - Auto-delete violations (default: false)
- **Detects:**
  - Bad words (from utils/badwords.json)
  - Spam patterns (caps lock, mentions, emojis, invite links, repeated chars)
- **Results** sent to moderation log channel

## Running the Bot
The bot runs via the "Discord Bot" workflow, which executes `node index.js`.

## Recent Changes (Dec 9, 2025)
- Added smart update system for all channels (only update if content changed)
- Added `/scan` command to scan channel history for spam/badwords
- Added history scanner utility (utils/historyScanner.js)
- Fixed duplicate hero IDs in hero files
- Admin DM notification when someone applies in Join-Us channel

## Dependencies
- discord.js v14.25.1
- dotenv v17.2.3
