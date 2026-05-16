const { SlashCommandBuilder } = require('discord.js');

const TIMEZONES = {
    'est': 'America/New_York',
    'cst': 'America/Chicago',
    'mst': 'America/Denver',
    'pst': 'America/Los_Angeles',
    'gmt': 'Europe/London',
    'cet': 'Europe/Paris',
    'eet': 'Europe/Bucharest',
    'wita': 'Asia/Makassar',
    'nzst': 'Pacific/Auckland',
    'utc': 'UTC',
};

// Parse a date/time string into a Unix timestamp (ms), interpreting in the given IANA timezone.
// Returns null if unparseable.
function parseDateTime(input, ianaTimezone) {
    const raw = input.trim();
    const now = new Date();

    // Helper: get current date parts in the target timezone
    function nowInTz() {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: ianaTimezone,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        }).formatToParts(now);
        const p = {};
        parts.forEach(x => { p[x.type] = x.value; });
        return {
            year: parseInt(p.year),
            month: parseInt(p.month) - 1,
            day: parseInt(p.day),
            hour: parseInt(p.hour) % 24,
            minute: parseInt(p.minute),
        };
    }

    // Convert a local date described by {year,month,day,hour,minute} in the target timezone to UTC ms
    function localToUtcMs(year, month, day, hour, minute) {
        // Use Intl to find the UTC offset at that moment by round-tripping
        const candidate = new Date(Date.UTC(year, month, day, hour, minute));
        // Get what that UTC instant looks like in the target tz
        const fmt = new Intl.DateTimeFormat('en-US', {
            timeZone: ianaTimezone,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false,
        });
        const parts = fmt.formatToParts(candidate);
        const p = {};
        parts.forEach(x => { p[x.type] = x.value; });
        const tzHour = parseInt(p.hour) % 24;
        const tzMinute = parseInt(p.minute);
        const tzMonth = parseInt(p.month) - 1;
        const tzDay = parseInt(p.day);
        const tzYear = parseInt(p.year);
        // offset = what UTC gave us in local - what we wanted
        const offsetMs = Date.UTC(tzYear, tzMonth, tzDay, tzHour, tzMinute) - Date.UTC(year, month, day, hour, minute);
        return candidate.getTime() - offsetMs;
    }

    const lower = raw.toLowerCase();

    // 1. Raw unix timestamp (digits only)
    if (/^\d{9,13}$/.test(raw)) {
        const n = parseInt(raw);
        return n > 1e10 ? n : n * 1000; // handle seconds or ms
    }

    // 2. Simple duration: 10m 2h 1d 30s
    const simpleDuration = raw.match(/^(\d+)([smhd])$/i);
    if (simpleDuration) {
        const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
        return now.getTime() + parseInt(simpleDuration[1]) * mult[simpleDuration[2].toLowerCase()];
    }

    // 3. "in X seconds/minutes/hours/days/weeks"
    const inPattern = lower.match(/^in (\d+) (second|minute|hour|day|week)s?$/);
    if (inPattern) {
        const mult = { second: 1000, minute: 60000, hour: 3600000, day: 86400000, week: 604800000 };
        return now.getTime() + parseInt(inPattern[1]) * mult[inPattern[2]];
    }

    // Helper: parse "HH:MM am/pm" or "H am/pm" -> { hour, minute }
    function parseTime12(str) {
        const m = str.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
        if (!m) return null;
        let h = parseInt(m[1]);
        const min = m[2] ? parseInt(m[2]) : 0;
        const mer = m[3] ? m[3].toLowerCase() : null;
        if (mer === 'pm' && h !== 12) h += 12;
        if (mer === 'am' && h === 12) h = 0;
        if (h > 23 || min > 59) return null;
        return { hour: h, minute: min };
    }

    // 4. "at HH:MM [am/pm]" -> today or tomorrow if passed
    const atMatch = lower.match(/^at (.+)$/);
    if (atMatch) {
        const t = parseTime12(atMatch[1]);
        if (t) {
            const tz = nowInTz();
            let ms = localToUtcMs(tz.year, tz.month, tz.day, t.hour, t.minute);
            if (ms <= now.getTime()) ms += 86400000;
            return ms;
        }
    }

    // 5. "today at HH:MM [am/pm]"
    const todayMatch = lower.match(/^today at (.+)$/);
    if (todayMatch) {
        const t = parseTime12(todayMatch[1]);
        if (t) {
            const tz = nowInTz();
            const ms = localToUtcMs(tz.year, tz.month, tz.day, t.hour, t.minute);
            if (ms <= now.getTime()) return null; // already passed
            return ms;
        }
    }

    // 6. "tomorrow at HH:MM [am/pm]"
    const tomorrowMatch = lower.match(/^tomorrow at (.+)$/);
    if (tomorrowMatch) {
        const t = parseTime12(tomorrowMatch[1]);
        if (t) {
            const tz = nowInTz();
            const nextDay = new Date(Date.UTC(tz.year, tz.month, tz.day + 1));
            const nd = new Intl.DateTimeFormat('en-US', {
                timeZone: ianaTimezone, year: 'numeric', month: '2-digit', day: '2-digit', hour12: false,
            }).formatToParts(nextDay);
            const ndp = {};
            nd.forEach(x => { ndp[x.type] = x.value; });
            return localToUtcMs(parseInt(ndp.year), parseInt(ndp.month) - 1, parseInt(ndp.day), t.hour, t.minute);
        }
    }

    // 7. ISO-ish: YYYY-MM-DD [HH:MM[:SS]]
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (isoMatch) {
        const [, yr, mo, dy, hr = '0', mn = '0'] = isoMatch;
        return localToUtcMs(parseInt(yr), parseInt(mo) - 1, parseInt(dy), parseInt(hr), parseInt(mn));
    }

    // 8. Natural language: "Month Day[,] [Year] [at] [HH:MM [am/pm]]"
    // e.g. "December 25, 2025 3:00 PM" / "Jan 5 at 2pm" / "March 15 2026"
    const months = {
        january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
        april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
        august: 7, aug: 7, september: 8, sep: 8, sept: 8, october: 9, oct: 9,
        november: 10, nov: 10, december: 11, dec: 11,
    };
    const naturalMatch = lower.match(
        /^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?[,\s]+(?:(\d{4})[,\s]+)?(?:at\s+)?(?:(.+))?$/
    );
    if (naturalMatch) {
        const monthName = naturalMatch[1];
        if (monthName in months) {
            const month = months[monthName];
            const day = parseInt(naturalMatch[2]);
            const tz = nowInTz();
            let year = naturalMatch[3] ? parseInt(naturalMatch[3]) : tz.year;
            let hour = 0, minute = 0;
            if (naturalMatch[4]) {
                const t = parseTime12(naturalMatch[4].trim());
                if (!t) return null;
                hour = t.hour;
                minute = t.minute;
            }
            let ms = localToUtcMs(year, month, day, hour, minute);
            // If no year was given and the date is in the past, try next year
            if (!naturalMatch[3] && ms < now.getTime()) {
                ms = localToUtcMs(year + 1, month, day, hour, minute);
            }
            return ms;
        }
    }

    return null;
}

const FORMAT_STYLES = [
    { code: 't', label: 'Short Time',      example: '9:01 PM' },
    { code: 'T', label: 'Long Time',       example: '9:01:00 PM' },
    { code: 'd', label: 'Short Date',      example: '11/28/2024' },
    { code: 'D', label: 'Long Date',       example: 'November 28, 2024' },
    { code: 'f', label: 'Short Date/Time', example: 'November 28, 2024 9:01 PM' },
    { code: 'F', label: 'Long Date/Time',  example: 'Thursday, November 28, 2024 9:01 PM' },
    { code: 'R', label: 'Relative',        example: '2 hours from now' },
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timestamp')
        .setDescription('Generate Discord dynamic timestamps for a given date/time')
        .addStringOption(opt =>
            opt.setName('time')
                .setDescription('Date/time to convert (e.g. "Dec 25 2025 3pm", "in 2 hours", "2025-12-25 15:00")')
                .setRequired(true))
        .addStringOption(opt =>
            opt.setName('timezone')
                .setDescription('Your timezone (default: UTC)')
                .setRequired(false)
                .addChoices(
                    { name: 'EST/EDT — Eastern US', value: 'est' },
                    { name: 'CST/CDT — Central US', value: 'cst' },
                    { name: 'MST/MDT — Mountain US', value: 'mst' },
                    { name: 'PST/PDT — Pacific US', value: 'pst' },
                    { name: 'GMT/BST — UK', value: 'gmt' },
                    { name: 'CET/CEST — Central Europe', value: 'cet' },
                    { name: 'EET/EEST — Eastern Europe', value: 'eet' },
                    { name: 'WITA — Indonesia', value: 'wita' },
                    { name: 'NZST/NZDT — New Zealand', value: 'nzst' },
                    { name: 'UTC', value: 'utc' },
                )),

    async execute(interaction) {
        const timeInput = interaction.options.getString('time');
        const tzKey = interaction.options.getString('timezone') ?? 'utc';
        const ianaTimezone = TIMEZONES[tzKey];

        const ms = parseDateTime(timeInput, ianaTimezone);

        if (!ms || isNaN(ms)) {
            return interaction.reply({
                content: [
                    '❌ Could not parse that date/time. Try formats like:',
                    '• `December 25, 2025 3:00 PM`',
                    '• `2025-12-25 15:00`',
                    '• `tomorrow at 5pm`',
                    '• `in 2 hours` or `2h`',
                    '• `at 9:30 AM`',
                    '• `Jan 5 at 2pm`',
                ].join('\n'),
                ephemeral: true,
            });
        }

        const unix = Math.floor(ms / 1000);

        const lines = FORMAT_STYLES.map(({ code, label }) => {
            const tag = `<t:${unix}:${code}>`;
            return `**${label}**\n${tag} — \`${tag}\``;
        });

        await interaction.reply({
            content: `## Timestamps for \`${timeInput}\`\n\n${lines.join('\n\n')}`,
            ephemeral: true,
        });
    },
};
