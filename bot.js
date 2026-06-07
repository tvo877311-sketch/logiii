const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// ============== DATENBANK (JSON) ==============
const DB_FILE = './users.json';
let users = {};

function loadDB() {
    if (fs.existsSync(DB_FILE)) {
        users = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        console.log(`📦 Geladene Benutzer: ${Object.keys(users).length}`);
    }
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 4));
}

loadDB();

// ============== EXPRESS API für den Cheat ==============
const app = express();
app.use(bodyParser.json());

// CORS für Cheat
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// API Endpoint für Login
app.post('/api/login', (req, res) => {
    const { username, password, hwid } = req.body;
    console.log(`📝 Login Versuch: ${username} - HWID: ${hwid.substring(0, 8)}...`);
    
    if (!users[username]) {
        return res.json({ success: false, message: 'Benutzer nicht gefunden!' });
    }
    
    const user = users[username];
    
    if (user.password !== password) {
        return res.json({ success: false, message: 'Falsches Passwort!' });
    }
    
    // HWID prüfen/locken
    if (user.hwid === "") {
        user.hwid = hwid;
        user.created_at = Date.now();
        saveDB();
        console.log(`🔒 HWID gebunden an ${username}`);
    } else if (user.hwid !== hwid) {
        return res.json({ success: false, message: 'Diese Lizenz ist an eine andere HWID gebunden!' });
    }
    
    // Ablauf prüfen
    if (user.expires_at && user.expires_at < Date.now()) {
        return res.json({ success: false, message: 'Lizenz abgelaufen! Kontaktiere den Support.' });
    }
    
    const daysLeft = Math.ceil((user.expires_at - Date.now()) / (1000 * 60 * 60 * 24));
    
    res.json({
        success: true,
        message: 'Login erfolgreich',
        token: `ENOX-${Date.now()}-${username}`,
        user: {
            username: username,
            rank: user.rank,
            expires_at: user.expires_at,
            days_left: daysLeft
        }
    });
});

// API Endpoint für Server-Status
app.get('/api/status', (req, res) => {
    const totalUsers = Object.keys(users).length;
    const activeUsers = Object.values(users).filter(u => u.expires_at > Date.now()).length;
    res.json({ 
        online: true, 
        totalUsers, 
        activeUsers, 
        timestamp: Date.now(),
        version: '4.2.0'
    });
});

// Health Check für Render
app.get('/health', (req, res) => {
    res.json({ status: 'online', uptime: process.uptime() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ API läuft auf Port ${PORT}`));

// ============== DISCORD BOT COMMANDS ==============
const PREFIX = '!';
// ÄNDERE DAS ZU DEINER ADMIN ROLE ID
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID || '1513159020897243247';

function isAdmin(member) {
    return member.roles.cache.has(ADMIN_ROLE_ID) || member.permissions.has(PermissionsBitField.Flags.Administrator);
}

client.on('ready', () => {
    console.log(`✅ Bot eingeloggt als ${client.user.tag}`);
    client.user.setActivity('Enox Cheat System', { type: 'WATCHING' });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;
    
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    // ========== !createuser <name> <pass> <tage> ==========
    if (command === 'createuser') {
        if (!isAdmin(message.member)) {
            return message.reply('❌ Keine Berechtigung! Du brauchst die Admin Rolle.');
        }
        
        const username = args[0];
        const password = args[1];
        const days = parseInt(args[2]);
        
        if (!username || !password || !days) {
            return message.reply('✅ !createuser <Benutzername> <Passwort> <Tage>\n📝 Beispiel: !createuser EnoxUser Pass123 30');
        }
        
        if (users[username]) {
            return message.reply('❌ Benutzer existiert bereits!');
        }
        
        const expires_at = Date.now() + (days * 24 * 60 * 60 * 1000);
        const expireDate = new Date(expires_at).toLocaleString('de-DE');
        
        users[username] = {
            password: password,
            rank: 'Premium',
            hwid: '',
            created_by: message.author.tag,
            created_at: Date.now(),
            expires_at: expires_at
        };
        
        saveDB();
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Benutzer erstellt')
            .setColor(0x9C27B0)
            .addFields(
                { name: '👤 Benutzername', value: `\`${username}\``, inline: true },
                { name: '🔑 Passwort', value: `||${password}||`, inline: true },
                { name: '📅 Gültig bis', value: expireDate, inline: true },
                { name: '⏰ Tage', value: `${days} Tage`, inline: true },
                { name: '🛡️ Rang', value: 'Premium', inline: true }
            )
            .setFooter({ text: 'Enox Cheat System • HWID Lock aktiv' })
            .setTimestamp();
        
        message.reply({ embeds: [embed] });
    }
    
    // ========== !deleteuser <name> ==========
    if (command === 'deleteuser') {
        if (!isAdmin(message.member)) {
            return message.reply('❌ Keine Berechtigung!');
        }
        
        const username = args[0];
        
        if (!username) {
            return message.reply('✅ !deleteuser <Benutzername>');
        }
        
        if (!users[username]) {
            return message.reply('❌ Benutzer nicht gefunden!');
        }
        
        delete users[username];
        saveDB();
        
        message.reply(`✅ Benutzer **${username}** wurde gelöscht!`);
    }
    
    // ========== !addtime <name> <tage> ==========
    if (command === 'addtime') {
        if (!isAdmin(message.member)) {
            return message.reply('❌ Keine Berechtigung!');
        }
        
        const username = args[0];
        const days = parseInt(args[1]);
        
        if (!username || !days) {
            return message.reply('✅ !addtime <Benutzername> <Tage>');
        }
        
        if (!users[username]) {
            return message.reply('❌ Benutzer nicht gefunden!');
        }
        
        const oldExpiry = new Date(users[username].expires_at).toLocaleString('de-DE');
        users[username].expires_at += (days * 24 * 60 * 60 * 1000);
        const newExpiry = new Date(users[username].expires_at).toLocaleString('de-DE');
        saveDB();
        
        const embed = new EmbedBuilder()
            .setTitle('⏰ Lizenz verlängert')
            .setColor(0x9C27B0)
            .addFields(
                { name: '👤 Benutzer', value: username, inline: true },
                { name: '📆 + Tage', value: `${days} Tage`, inline: true },
                { name: '🕐 Alt', value: oldExpiry, inline: false },
                { name: '🕐 Neu', value: newExpiry, inline: false }
            );
        
        message.reply({ embeds: [embed] });
    }
    
    // ========== !users ==========
    if (command === 'users') {
        if (!isAdmin(message.member)) {
            return message.reply('❌ Keine Berechtigung!');
        }
        
        const userList = Object.entries(users).map(([name, data]) => {
            const status = data.expires_at > Date.now() ? '🟢' : '🔴';
            const hwid_status = data.hwid ? '🔒' : '⚪';
            const daysLeft = Math.ceil((data.expires_at - Date.now()) / (1000 * 60 * 60 * 24));
            return `${status} **${name}** | ${hwid_status} | ${daysLeft} Tage`;
        }).join('\n');
        
        const embed = new EmbedBuilder()
            .setTitle('📋 Benutzerliste')
            .setColor(0x9C27B0)
            .setDescription(userList || 'Keine Benutzer vorhanden')
            .setFooter({ text: `🟢 Aktiv | 🔴 Abgelaufen | 🔒 HWID gebunden | ⚪ Frei • Total: ${Object.keys(users).length}` });
        
        message.reply({ embeds: [embed] });
    }
    
    // ========== !userinfo <name> ==========
    if (command === 'userinfo') {
        if (!isAdmin(message.member)) {
            return message.reply('❌ Keine Berechtigung!');
        }
        
        const username = args[0];
        
        if (!username || !users[username]) {
            return message.reply('❌ Benutzer nicht gefunden!');
        }
        
        const user = users[username];
        const status = user.expires_at > Date.now() ? '🟢 Aktiv' : '🔴 Abgelaufen';
        const hwid_status = user.hwid ? `🔒 \`${user.hwid.substring(0, 16)}...\`` : '⚪ Nicht gebunden';
        const expires = new Date(user.expires_at).toLocaleString('de-DE');
        const created = new Date(user.created_at).toLocaleString('de-DE');
        const daysLeft = Math.ceil((user.expires_at - Date.now()) / (1000 * 60 * 60 * 24));
        
        const embed = new EmbedBuilder()
            .setTitle(`👤 Benutzer: ${username}`)
            .setColor(0x9C27B0)
            .addFields(
                { name: '📊 Status', value: status, inline: true },
                { name: '🎖️ Rang', value: user.rank, inline: true },
                { name: '⏰ Tage übrig', value: `${daysLeft} Tage`, inline: true },
                { name: '🔑 HWID', value: hwid_status, inline: false },
                { name: '👮 Erstellt von', value: user.created_by, inline: true },
                { name: '📅 Erstellt am', value: created, inline: true },
                { name: '⏱️ Gültig bis', value: expires, inline: true }
            )
            .setFooter({ text: 'Enox Cheat System' });
        
        message.reply({ embeds: [embed] });
    }
    
    // ========== !resetuser <name> ==========
    if (command === 'resetuser') {
        if (!isAdmin(message.member)) {
            return message.reply('❌ Keine Berechtigung!');
        }
        
        const username = args[0];
        
        if (!username || !users[username]) {
            return message.reply('❌ Benutzer nicht gefunden!');
        }
        
        users[username].hwid = '';
        saveDB();
        
        message.reply(`✅ HWID von **${username}** wurde zurückgesetzt! Der Benutzer kann sich jetzt von einem neuen PC anmelden.`);
    }
    
    // ========== !stats ==========
    if (command === 'stats') {
        const total = Object.keys(users).length;
        const active = Object.values(users).filter(u => u.expires_at > Date.now()).length;
        const expired = total - active;
        const bound = Object.values(users).filter(u => u.hwid !== '').length;
        
        const embed = new EmbedBuilder()
            .setTitle('📊 Enox Cheat Statistiken')
            .setColor(0x9C27B0)
            .addFields(
                { name: '👥 Total Benutzer', value: `${total}`, inline: true },
                { name: '🟢 Aktiv', value: `${active}`, inline: true },
                { name: '🔴 Abgelaufen', value: `${expired}`, inline: true },
                { name: '🔒 HWID Gebunden', value: `${bound}`, inline: true },
                { name: '⚪ Frei', value: `${total - bound}`, inline: true },
                { name: '🖥️ API Status', value: '✅ Online', inline: true }
            )
            .setFooter({ text: `Enox Cheat System • ${new Date().toLocaleString()}` });
        
        message.reply({ embeds: [embed] });
    }
    
    // ========== !help ==========
    if (command === 'help') {
        const embed = new EmbedBuilder()
            .setTitle('🤖 Enox Bot Commands')
            .setColor(0x9C27B0)
            .setDescription('**🔐 Admin Commands (nur für Admins)**')
            .addFields(
                { name: '!createuser <name> <pass> <tage>', value: 'Erstellt neuen Benutzer mit Lizenz', inline: false },
                { name: '!deleteuser <name>', value: 'Löscht einen Benutzer', inline: false },
                { name: '!addtime <name> <tage>', value: 'Verlängert Lizenz eines Users', inline: false },
                { name: '!resetuser <name>', value: 'Setzt HWID zurück (für neuen PC)', inline: false },
                { name: '!users', value: 'Zeigt alle Benutzer an', inline: false },
                { name: '!userinfo <name>', value: 'Zeigt Details zu einem Benutzer', inline: false },
                { name: '!stats', value: 'Zeigt Serverstatistiken', inline: false }
            )
            .setFooter({ text: 'Enox Cheat System • Premium Protection' });
        
        message.reply({ embeds: [embed] });
    }
});

// Bot starten - TOKEN aus Environment Variable
const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
    console.error('❌ DISCORD_TOKEN nicht gesetzt! Füge eine Environment Variable hinzu.');
    process.exit(1);
}

client.login(TOKEN);
