const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// ============== KONFIGURATION ==============
const ALLOWED_ROLE_ID = "1513159020897243247";  // Deine Admin Rolle
const ALLOWED_CHANNEL_ID = "1513165818744148040"; // Dein Bot Channel

// Prüft ob der Benutzer die richtige Rolle hat UND im richtigen Channel ist
function hasPermission(message) {
    // Prüfe Channel
    if (message.channel.id !== ALLOWED_CHANNEL_ID) {
        return false;
    }
    // Prüfe Rolle
    if (!message.member.roles.cache.has(ALLOWED_ROLE_ID)) {
        return false;
    }
    return true;
}

// ============== DATENBANK ==============
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

// ============== EXPRESS API ==============
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// ========== LOGIN ENDPOINT ==========
app.post('/api/login', (req, res) => {
    console.log('📝 Login request received');
    console.log('Body:', req.body);
    
    const { username, password, hwid } = req.body;
    
    if (!username || !password) {
        return res.json({ success: false, message: 'Benutzername und Passwort erforderlich!' });
    }
    
    if (!users[username]) {
        return res.json({ success: false, message: 'Benutzer nicht gefunden!' });
    }
    
    const user = users[username];
    
    if (user.password !== password) {
        return res.json({ success: false, message: 'Falsches Passwort!' });
    }
    
    if (user.hwid === "") {
        user.hwid = hwid;
        saveDB();
        console.log(`🔒 HWID gebunden an ${username}`);
    } else if (user.hwid !== hwid) {
        return res.json({ success: false, message: 'Diese Lizenz ist an eine andere HWID gebunden!' });
    }
    
    if (user.expires_at && user.expires_at < Date.now()) {
        return res.json({ success: false, message: 'Lizenz abgelaufen! Kontaktiere den Support.' });
    }
    
    const daysLeft = Math.ceil((user.expires_at - Date.now()) / (1000 * 60 * 60 * 24));
    
    const response = {
        success: true,
        message: 'Login erfolgreich',
        token: `ENOX-${Date.now()}-${username}`,
        user: {
            username: username,
            rank: user.rank,
            expires_at: user.expires_at,
            days_left: daysLeft
        }
    };
    
    console.log('✅ Login erfolgreich:', username);
    res.json(response);
});

app.get('/api/login', (req, res) => {
    res.json({ message: 'Bitte POST request verwenden!', success: false });
});

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

app.get('/health', (req, res) => {
    res.json({ status: 'online', uptime: process.uptime() });
});

app.get('/', (req, res) => {
    res.json({ 
        name: 'Enox API', 
        status: 'online',
        endpoints: ['POST /api/login', 'GET /api/status', 'GET /health']
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ API läuft auf Port ${PORT}`));

// ============== DISCORD BOT ==============
const PREFIX = '!';

client.on('ready', () => {
    console.log(`✅ Bot eingeloggt als ${client.user.tag}`);
    console.log(`📢 Befehle nur in Channel ID: ${ALLOWED_CHANNEL_ID}`);
    console.log(`👑 Benötigte Rolle ID: ${ALLOWED_ROLE_ID}`);
    client.user.setActivity('Enox Cheat System', { type: 'WATCHING' });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;
    
    // ========== PERMISSIONS CHECK ==========
    if (!hasPermission(message)) {
        const wrongChannelMsg = message.channel.id !== ALLOWED_CHANNEL_ID 
            ? `❌ Befehl nur in <#${ALLOWED_CHANNEL_ID}> erlaubt!` 
            : `❌ Du hast keine Berechtigung für diesen Befehl! (Benötigte Rolle: <@&${ALLOWED_ROLE_ID}>)`;
        
        return message.reply(wrongChannelMsg).then(msg => {
            setTimeout(() => msg.delete(), 5000);
            message.delete();
        });
    }
    
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    // ========== !createuser ==========
    if (command === 'createuser') {
        const username = args[0];
        const password = args[1];
        const days = parseInt(args[2]);
        
        if (!username || !password || !days) {
            return message.reply('✅ !createuser <Benutzername> <Passwort> <Tage>\n📝 Beispiel: !createuser test 123 30');
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
    
    // ========== !deleteuser ==========
    if (command === 'deleteuser') {
        const username = args[0];
        if (!username) return message.reply('✅ !deleteuser <Benutzername>');
        if (!users[username]) return message.reply('❌ Benutzer nicht gefunden!');
        delete users[username];
        saveDB();
        message.reply(`✅ Benutzer **${username}** wurde gelöscht!`);
    }
    
    // ========== !addtime ==========
    if (command === 'addtime') {
        const username = args[0];
        const days = parseInt(args[1]);
        if (!username || !days) return message.reply('✅ !addtime <Benutzername> <Tage>');
        if (!users[username]) return message.reply('❌ Benutzer nicht gefunden!');
        users[username].expires_at += (days * 24 * 60 * 60 * 1000);
        saveDB();
        message.reply(`✅ **${username}** +${days} Tage verlängert!`);
    }
    
    // ========== !resetuser ==========
    if (command === 'resetuser') {
        const username = args[0];
        if (!username || !users[username]) return message.reply('❌ Benutzer nicht gefunden!');
        users[username].hwid = '';
        saveDB();
        message.reply(`✅ HWID von **${username}** wurde zurückgesetzt!`);
    }
    
    // ========== !users ==========
    if (command === 'users') {
        const userList = Object.entries(users).map(([name, data]) => {
            const status = data.expires_at > Date.now() ? '🟢' : '🔴';
            const hwid_status = data.hwid ? '🔒' : '⚪';
            const daysLeft = Math.ceil((data.expires_at - Date.now()) / (1000 * 60 * 60 * 24));
            return `${status} **${name}** | ${hwid_status} | ${daysLeft} Tage`;
        }).join('\n');
        const embed = new EmbedBuilder().setTitle('📋 Benutzerliste').setColor(0x9C27B0).setDescription(userList || 'Keine Benutzer').setFooter({ text: `Total: ${Object.keys(users).length}` });
        message.reply({ embeds: [embed] });
    }
    
    // ========== !userinfo ==========
    if (command === 'userinfo') {
        const username = args[0];
        if (!username || !users[username]) return message.reply('❌ Benutzer nicht gefunden!');
        const user = users[username];
        const status = user.expires_at > Date.now() ? '🟢 Aktiv' : '🔴 Abgelaufen';
        const hwid_status = user.hwid ? `🔒 \`${user.hwid.substring(0, 16)}...\`` : '⚪ Nicht gebunden';
        const embed = new EmbedBuilder().setTitle(`👤 ${username}`).setColor(0x9C27B0)
            .addFields(
                { name: 'Status', value: status, inline: true },
                { name: 'Rang', value: user.rank, inline: true },
                { name: 'HWID', value: hwid_status, inline: false },
                { name: 'Erstellt von', value: user.created_by, inline: true },
                { name: 'Gültig bis', value: new Date(user.expires_at).toLocaleString('de-DE'), inline: true }
            );
        message.reply({ embeds: [embed] });
    }
    
    // ========== !stats ==========
    if (command === 'stats') {
        const total = Object.keys(users).length;
        const active = Object.values(users).filter(u => u.expires_at > Date.now()).length;
        const bound = Object.values(users).filter(u => u.hwid !== '').length;
        const embed = new EmbedBuilder().setTitle('📊 Enox Cheat Statistiken').setColor(0x9C27B0)
            .addFields(
                { name: '👥 Total', value: `${total}`, inline: true },
                { name: '🟢 Aktiv', value: `${active}`, inline: true },
                { name: '🔴 Abgelaufen', value: `${total - active}`, inline: true },
                { name: '🔒 HWID Gebunden', value: `${bound}`, inline: true },
                { name: '⚪ Frei', value: `${total - bound}`, inline: true }
            );
        message.reply({ embeds: [embed] });
    }
    
    // ========== !help ==========
    if (command === 'help') {
        const embed = new EmbedBuilder().setTitle('🤖 Enox Bot Commands').setColor(0x9C27B0)
            .setDescription(`**🔐 Admin Commands**\nNur verfügbar in <#${ALLOWED_CHANNEL_ID}> mit der Rolle <@&${ALLOWED_ROLE_ID}>`)
            .addFields(
                { name: '!createuser <name> <pass> <tage>', value: 'Erstellt neuen Benutzer', inline: false },
                { name: '!deleteuser <name>', value: 'Löscht Benutzer', inline: false },
                { name: '!addtime <name> <tage>', value: 'Verlängert Lizenz', inline: false },
                { name: '!resetuser <name>', value: 'Setzt HWID zurück', inline: false },
                { name: '!users', value: 'Zeigt alle Benutzer', inline: false },
                { name: '!userinfo <name>', value: 'Zeigt Details', inline: false },
                { name: '!stats', value: 'Zeigt Statistiken', inline: false }
            )
            .setFooter({ text: `Channel: ${ALLOWED_CHANNEL_ID} | Rolle: ${ALLOWED_ROLE_ID}` });
        message.reply({ embeds: [embed] });
    }
});

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
    console.error('❌ DISCORD_TOKEN nicht gesetzt!');
    process.exit(1);
}

client.login(TOKEN);
